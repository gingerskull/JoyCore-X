use hidapi::{HidApi, HidDevice};
use std::sync::{Arc, atomic::{AtomicBool, Ordering}, Mutex as StdMutex};
use std::thread::{self, JoinHandle};
use tokio::sync::Mutex;
use thiserror::Error;
use tauri::{AppHandle, Emitter};

// JoyCore device identifiers
const JOYCORE_VID: u16 = 0x2E8A; // Raspberry Pi
const JOYCORE_PID: u16 = 0xA02F;

#[derive(Error, Debug)]
pub enum HidError {
    #[error("HID API error: {0}")]
    HidApiError(#[from] hidapi::HidError),
    
    #[error("Device not found")]
    DeviceNotFound,
    
    #[error("Failed to read HID report")]
    ReadError,
    
    #[error("Invalid button data")]
    InvalidData,
}

pub type Result<T> = std::result::Result<T, HidError>;

/// Represents the button states read from the HID device
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ButtonStates {
    /// Bit-packed button states (up to 64 buttons)
    /// Each bit represents a button: 1 = pressed, 0 = not pressed
    pub buttons: u64,
    
    /// Timestamp when the state was read
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Event payload for button press/release events
#[derive(Debug, Clone, serde::Serialize)]
pub struct ButtonEvent {
    /// Button ID (0-63)
    pub button_id: u8,
    /// True if pressed, false if released
    pub pressed: bool,
    /// Timestamp of the event
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl ButtonStates {
    /// Check if a specific button is pressed
    pub fn is_button_pressed(&self, button_index: u8) -> bool {
        if button_index >= 64 {
            return false;
        }
        (self.buttons & (1u64 << button_index)) != 0
    }
    
    /// Get a list of all pressed button indices
    pub fn get_pressed_buttons(&self) -> Vec<u8> {
        let mut pressed = Vec::new();
        for i in 0..64 {
            if self.is_button_pressed(i) {
                pressed.push(i);
            }
        }
        pressed
    }
}

/// HID device reader for JoyCore devices
pub struct HidReader {
    device: Arc<Mutex<Option<HidDevice>>>,
    api: Arc<Mutex<HidApi>>,
    last_state: Arc<StdMutex<ButtonStates>>, // Cached last known state (std mutex for thread use)
    running: Arc<AtomicBool>,
    reader_handle: Arc<Mutex<Option<JoinHandle<()>>>>,
    // Selected offset (once determined) for raw button bitmap inside report
    selected_offset: Arc<StdMutex<Option<usize>>>,
    // Last raw 64-bit value captured at that offset for debug (mirrors last_state.buttons but before any future transforms)
    last_raw_value: Arc<StdMutex<u64>>,
    // Last full HID report bytes (for mapping investigation)
    last_report: Arc<StdMutex<[u8;64]>>,
    last_report_len: Arc<StdMutex<usize>>,
    // Parsed mapping information from feature reports (if supported by firmware)
    mapping_data: Arc<StdMutex<Option<MappingData>>>,
    // Tauri app handle for emitting events
    app_handle: Arc<StdMutex<Option<AppHandle>>>,
}

/// Raw HID mapping information structure as provided by firmware feature report ID 3.
/// Layout must match firmware exactly. Using repr(C, packed) to avoid padding.
#[repr(C, packed)]
#[derive(Clone, Copy, Debug, Default)]
struct HIDMappingInfoRaw {
    protocol_version: u8,
    input_report_id: u8,
    button_count: u8,
    axis_count: u8,
    button_byte_offset: u8,
    button_bit_order: u8, // 0 = LSB-first, 1 = MSB-first (only 0 currently used)
    mapping_crc: u16,     // 0x0000 = sequential
    frame_counter_offset: u8,
    reserved: [u8;7],
}

/// Processed mapping data used by reader thread.
#[derive(Clone, Debug)]
struct MappingData {
    info: HIDMappingInfoRaw,
    // mapping[bit_index] = logical joy button id. If sequential, identity mapping stored.
    mapping: Vec<u8>,
}

/// Public friendly struct for external mapping injection (e.g., from serial protocol)
#[derive(Debug, Clone)]
pub struct ExternalMappingInfo {
    pub protocol_version: u8,
    pub input_report_id: u8,
    pub button_count: u16,
    pub axis_count: u16,
    pub button_byte_offset: u8,
    pub button_bit_order: u8,
    pub mapping_crc: u16,
    pub frame_counter_offset: Option<u8>,
}

impl HidReader {
    /// Create a new HID reader
    pub fn new() -> Result<Self> {
        let api = HidApi::new()?;
        Ok(Self {
            device: Arc::new(Mutex::new(None)),
            api: Arc::new(Mutex::new(api)),
            last_state: Arc::new(StdMutex::new(ButtonStates { buttons: 0, timestamp: chrono::Utc::now() })),
            running: Arc::new(AtomicBool::new(false)),
            reader_handle: Arc::new(Mutex::new(None)),
            selected_offset: Arc::new(StdMutex::new(None)),
            last_raw_value: Arc::new(StdMutex::new(0)),
            last_report: Arc::new(StdMutex::new([0u8;64])),
            last_report_len: Arc::new(StdMutex::new(0)),
            mapping_data: Arc::new(StdMutex::new(None)),
            app_handle: Arc::new(StdMutex::new(None)),
        })
    }
    
    /// Set the Tauri app handle for event emission
    pub fn set_app_handle(&self, handle: AppHandle) {
        if let Ok(mut app_handle) = self.app_handle.lock() {
            *app_handle = Some(handle);
        }
    }

    /// Inject mapping information obtained via an alternate path (e.g., serial fallback)
    /// This will override any existing mapping only if none currently loaded or force_replace=true.
    pub fn apply_external_mapping(&self, info: ExternalMappingInfo, mapping: Vec<u8>, force_replace: bool) -> bool {
        // Build HIDMappingInfoRaw equivalent from external struct
        let raw = HIDMappingInfoRaw {
            protocol_version: info.protocol_version,
            input_report_id: info.input_report_id,
            button_count: info.button_count.min(128) as u8,
            axis_count: info.axis_count.min(32) as u8,
            button_byte_offset: info.button_byte_offset,
            button_bit_order: info.button_bit_order,
            mapping_crc: info.mapping_crc,
            frame_counter_offset: info.frame_counter_offset.unwrap_or(0xFF), // 0xFF meaning unknown
            reserved: [0u8;7],
        };

        let mut guard = self.mapping_data.lock().unwrap();
        if guard.is_some() && !force_replace { return false; }
        *guard = Some(MappingData { info: raw, mapping });
        log::info!("External mapping injected: buttons={} axes={} sequential={} source=serial-fallback", raw.button_count, raw.axis_count, raw.mapping_crc==0);
        true
    }
    
    /// Connect to the JoyCore HID device
    pub async fn connect(&self) -> Result<()> {
        let mut api = self.api.lock().await;
        
        // Refresh device list
        api.refresh_devices()?;
        
        log::info!("Searching for JoyCore HID device (VID: 0x{:04X}, PID: 0x{:04X})", JOYCORE_VID, JOYCORE_PID);
        
        // List all HID devices for debugging
        let mut device_count = 0;
        for device_info in api.device_list() {
            log::debug!("HID Device: VID=0x{:04X}, PID=0x{:04X}, Path={:?}, Interface={}", 
                device_info.vendor_id(), 
                device_info.product_id(),
                device_info.path(),
                device_info.interface_number()
            );
            device_count += 1;
        }
        log::info!("Found {} HID devices total", device_count);
        
        // Collect all JoyCore top-level collections (Windows enumerates each HID collection as separate path '...&ColXX#')
        let mut found_devices: Vec<(i32, String)> = Vec::new();
        for device_info in api.device_list() {
            if device_info.vendor_id() == JOYCORE_VID && device_info.product_id() == JOYCORE_PID {
                let interface = device_info.interface_number();
                let path_str = device_info.path().to_str().unwrap_or("").to_string();
                log::info!("Found JoyCore interface {}: {:?}", interface, path_str);
                found_devices.push((interface, path_str));
            }
        }
        
        if found_devices.is_empty() {
            log::error!("No JoyCore HID devices found!");
            return Err(HidError::DeviceNotFound);
        }
        
        log::info!("Found {} JoyCore HID interfaces (collections)", found_devices.len());

        // Sort by interface then path for deterministic order
        found_devices.sort_by_key(|(iface, path)| (*iface, path.clone()));

        // PASS 1: Prefer a collection that supports mapping feature report (ID 3)
        use std::mem::size_of;
        for (interface, path) in &found_devices {
            if let Some(info) = api.device_list().find(|d| d.path().to_str().unwrap_or("") == path) {
                if let Ok(dev) = info.open_device(&api) {
                    let mut buf = [0u8; 1 + size_of::<HIDMappingInfoRaw>()];
                    buf[0] = 3;
                    if let Ok(sz) = dev.get_feature_report(&mut buf) { if sz == buf.len() { // looks promising
                        // Store device so mapping fetch can use it
                        {
                            let mut device_guard = self.device.lock().await; *device_guard = Some(dev);
                        }
                        // Parse mapping
                        if self.try_fetch_mapping().await.is_ok() {
                            // Quick sanity check: ensure this interface yields input reports
                            let mut probe_ok = false;
                            {
                                let guard = self.device.lock().await;
                                if let Some(device) = guard.as_ref() {
                                    let mut rbuf = [0u8; 64];
                                    for _ in 0..6 {
                                        if let Ok(rs) = device.read_timeout(&mut rbuf, 40) { if rs > 0 { probe_ok = true; break; } }
                                    }
                                }
                            }
                            if probe_ok {
                                log::info!("Selected JoyCore HID interface {} (mapping feature supported) path={}", interface, path);
                                self.start_reader_task(*interface).await?;
                                return Ok(());
                            } else {
                                log::warn!("Interface {} had mapping but produced no input reports; trying next", interface);
                                let mut device_guard = self.device.lock().await; *device_guard = None;
                            }
                        } else {
                            // Clear device again to retry in pass 2
                            let mut device_guard = self.device.lock().await; *device_guard = None;
                        }
                    }}
                }
            }
        }

        // PASS 2: Heuristic fallback - pick first interface that produces any input report bytes
        let mut fallback: Option<(i32, HidDevice)> = None;
        for (interface, path) in &found_devices {
            if let Some(info) = api.device_list().find(|d| d.path().to_str().unwrap_or("") == path) {
                if let Ok(dev) = info.open_device(&api) {
                    let mut buf = [0u8; 64];
                    let mut success = false;
                    for _ in 0..8 { // quick tries
                        if let Ok(sz) = dev.read_timeout(&mut buf, 40) { if sz > 0 { success = true; break; } }
                    }
                    if success {
                        {
                            let mut device_guard = self.device.lock().await; *device_guard = Some(dev);
                        }
                        log::info!("Selected JoyCore HID interface {} via fallback (no mapping feature)", interface);
                        self.start_reader_task(*interface).await?;
                        return Ok(());
                    } else if fallback.is_none() { fallback = Some((*interface, dev)); }
                }
            }
        }

        if let Some((interface, dev)) = fallback {
            let mut device_guard = self.device.lock().await; *device_guard = Some(dev);
            log::warn!("Using fallback JoyCore HID interface {} (no immediate reports, no mapping feature)", interface);
            self.start_reader_task(interface).await?;
            return Ok(());
        }

        log::error!("Failed to open/validate any JoyCore HID interface");
        Err(HidError::DeviceNotFound)
    }
    
    /// Disconnect from the HID device
    pub async fn disconnect(&self) -> Result<()> {
        // Signal reader thread to stop
        self.running.store(false, Ordering::SeqCst);
        {
            let mut handle_guard = self.reader_handle.lock().await;
            if let Some(handle) = handle_guard.take() {
                log::info!("Joining HID reader thread...");
                let _ = handle.join();
            }
        }
        {
            let mut device_guard = self.device.lock().await;
            *device_guard = None;
        }
        log::info!("Disconnected from JoyCore HID device");
        Ok(())
    }
    
    /// Check if connected to a HID device
    pub async fn is_connected(&self) -> bool {
        let device_guard = self.device.lock().await;
        device_guard.is_some()
    }
    
    /// Read current button states from the HID device
    pub async fn read_button_states(&self) -> Result<ButtonStates> {
        // Simply return the cached last state. This prevents flicker to zero when no new report.
        if !self.is_connected().await { return Err(HidError::DeviceNotFound); }
    let state = self.last_state.lock().unwrap().clone();
    Ok(state)
    }

    /// Debug info: selected offset & last raw value
    pub async fn debug_hid_mapping(&self) -> Option<(usize, u64)> {
        let off = *self.selected_offset.lock().unwrap();
        let raw = *self.last_raw_value.lock().unwrap();
        off.map(|o| (o, raw))
    }

    /// Detailed mapping info (if feature reports supported)
    pub async fn mapping_details(&self) -> Option<serde_json::Value> {
        if let Some(md) = self.mapping_data.lock().unwrap().clone() {
            let map_vec: Vec<u8> = md.mapping.clone();
            // Copy packed fields to locals to avoid unaligned references
            let info = md.info;
            let protocol_version = info.protocol_version;
            let input_report_id = info.input_report_id;
            let button_count = info.button_count;
            let axis_count = info.axis_count;
            let button_byte_offset = info.button_byte_offset;
            let button_bit_order = info.button_bit_order;
            let frame_counter_offset = info.frame_counter_offset;
            let mapping_crc = info.mapping_crc;
            let sequential = mapping_crc == 0;
            return Some(serde_json::json!({
                "protocol_version": protocol_version,
                "input_report_id": input_report_id,
                "button_count": button_count,
                "axis_count": axis_count,
                "button_byte_offset": button_byte_offset,
                "button_bit_order": button_bit_order,
                "frame_counter_offset": frame_counter_offset,
                "sequential": sequential,
                "mapping_crc": mapping_crc,
                "mapping": map_vec,
            }));
        }
        None
    }

    /// Debug: get last full HID report as hex (truncated to actual length)
    pub async fn debug_full_report(&self) -> Option<(usize, String)> {
        let len = *self.last_report_len.lock().unwrap();
        if len == 0 { return None; }
        let mut buf = [0u8;64];
        buf.copy_from_slice(&*self.last_report.lock().unwrap());
        Some((len, hex::encode(&buf[..len])))
    }

    /// Diagnostic: return a JSON string summarizing raw button bytes vs mapped logical bits (first 16 buttons)
    pub async fn debug_button_bit_diagnostics(&self) -> Option<serde_json::Value> {
        let len = *self.last_report_len.lock().unwrap();
        if len == 0 { return None; }
        let report = self.last_report.lock().unwrap().clone();
        let mapping_opt = { self.mapping_data.lock().unwrap().clone() };
        let selected_off_opt = { *self.selected_offset.lock().unwrap() };
        let last_raw_val = { *self.last_raw_value.lock().unwrap() };
        let mut raw_bits: Vec<u8> = Vec::new();
        // Interpret report[0..16] as raw button bytes regardless of report ID presence
        for byte_index in 0..16 { raw_bits.push(report[byte_index]); }
        // Derive bit->logical (0..15) pressed arrays from current cached state
        let logical_state = self.last_state.lock().unwrap().buttons;
        let mut logical_pressed: Vec<u8> = Vec::new();
        for b in 0..16 { if (logical_state & (1u64 << b)) != 0 { logical_pressed.push(b as u8); } }
        let mapping_summary = mapping_opt.as_ref().map(|m| serde_json::json!({
            "button_byte_offset": m.info.button_byte_offset,
            "button_bit_order": m.info.button_bit_order,
            "button_count": m.info.button_count,
            "input_report_id": m.info.input_report_id,
            "sequential": m.info.mapping_crc == 0,
        }));
        // Additional legacy diagnostic when mapping is absent
        let legacy_extra = if mapping_opt.is_none() {
            // Provide the 8-byte window starting at selected offset (if any)
            let mut window: Vec<String> = Vec::new();
            if let Some(off) = selected_off_opt { for i in 0..8 { if off + i < report.len() { window.push(format!("0x{:02X}", report[off + i])); } } }
            Some(serde_json::json!({
                "selected_offset": selected_off_opt,
                "window_8_bytes_from_offset": window,
                "interpreted_u64_hex": format!("0x{:016X}", last_raw_val),
            }))
        } else { None };
        Some(serde_json::json!({
            "mode": if mapping_opt.is_some() { "mapped" } else { "legacy" },
            "raw_first_16_bytes": raw_bits.iter().map(|b| format!("0x{:02X}", b)).collect::<Vec<_>>(),
            "raw_first_2_bytes_binary": raw_bits.iter().take(2).map(|b| format!("{:08b}", b)).collect::<Vec<_>>(),
            "logical_pressed_first16": logical_pressed,
            "mapping": mapping_summary,
            "legacy": legacy_extra,
        }))
    }
    
    /// Find and list all JoyCore HID devices
    pub async fn list_devices() -> Result<Vec<String>> {
        let api = HidApi::new()?;
        let mut devices = Vec::new();
        
        for device_info in api.device_list() {
            if device_info.vendor_id() == JOYCORE_VID && device_info.product_id() == JOYCORE_PID {
                let info = format!(
                    "JoyCore HID - Path: {:?}, Interface: {}",
                    device_info.path(),
                    device_info.interface_number()
                );
                devices.push(info);
            }
        }
        
        Ok(devices)
    }
}

impl HidReader {
    /// Attempt to fetch HID mapping feature reports (IDs 3 & 4). Stores mapping_data if successful.
    async fn try_fetch_mapping(&self) -> Result<()> {
        use std::mem::size_of;
        let guard = self.device.lock().await;
        let Some(dev) = guard.as_ref() else { return Err(HidError::DeviceNotFound); };

        // Feature report ID 3: mapping info (1 + 16 bytes)
        let mut buf = [0u8; 1 + size_of::<HIDMappingInfoRaw>()];
        buf[0] = 3; // report ID
        let sz = dev.get_feature_report(&mut buf)?; // returns number of bytes read
        if sz < buf.len() { return Err(HidError::InvalidData); }
        // SAFETY: bytes are from device, copy into struct
        let mut raw = HIDMappingInfoRaw::default();
        let raw_slice = unsafe {
            std::slice::from_raw_parts_mut((&mut raw as *mut HIDMappingInfoRaw) as *mut u8, size_of::<HIDMappingInfoRaw>())
        };
        raw_slice.copy_from_slice(&buf[1..]);

        if raw.protocol_version == 0 || raw.button_count == 0 || raw.button_count > 128 { return Err(HidError::InvalidData); }

        // Prefer explicit mapping report (ID 4) if available; otherwise fall back to identity
        let mut mapping: Vec<u8> = (0..raw.button_count).collect();
        {
            let mut map_buf = vec![0u8; 1 + raw.button_count as usize];
            map_buf[0] = 4; // feature report ID 4
            match dev.get_feature_report(&mut map_buf) {
                Ok(sz2) if sz2 >= map_buf.len() => {
                    mapping = map_buf[1..].to_vec();
                }
                Ok(_) => {
                    // too short; keep identity
                }
                Err(e) => {
                    // Some firmware may omit ID 4 when sequential; keep identity
                    log::debug!("Feature report 4 unavailable: {} (using identity)", e);
                }
            }
        }

        {
            let mut md = self.mapping_data.lock().unwrap();
            *md = Some(MappingData { info: raw, mapping });
        }
        log::info!("HID mapping feature reports loaded: buttons={}, axes={}, sequential={}", raw.button_count, raw.axis_count, raw.mapping_crc == 0);
        Ok(())
    }

    /// Start background reader task (idempotent)
    async fn start_reader_task(&self, interface: i32) -> Result<()> {
        if self.running.load(Ordering::SeqCst) { return Ok(()); }
        self.running.store(true, Ordering::SeqCst);
        let device_arc = self.device.clone();
        let state_arc = self.last_state.clone();
        let sel_offset_arc = self.selected_offset.clone();
        let last_raw_arc = self.last_raw_value.clone();
        let last_report_arc = self.last_report.clone();
        let last_report_len_arc = self.last_report_len.clone();
        let mapping_data_arc = self.mapping_data.clone();
        let running_flag = self.running.clone();
        let app_handle_arc = self.app_handle.clone();

        let handle = thread::spawn(move || {
            // Build a small single-threaded runtime once for locking the tokio::Mutex
            let rt = match tokio::runtime::Builder::new_current_thread().enable_time().build() {
                Ok(r) => r,
                Err(e) => { log::error!("Failed to build runtime for HID reader: {}", e); return; }
            };
            let mut preferred_offset: Option<usize> = None; // For heuristic fallback only
            let mut report_count: u64 = 0;
            let mut last_sync_time = std::time::Instant::now();
            const SYNC_INTERVAL: std::time::Duration = std::time::Duration::from_secs(1); // Sync every second
            // Track full-range logical IDs (supports >64) for mapped mode
            let mut prev_pressed_set: std::collections::HashSet<u8> = std::collections::HashSet::new();
            // previous logical state no longer needed (we derive changes from stored state)
            // Heuristic baseline variables (used only if mapping feature unsupported)
            let mut baseline_0: Option<u64> = None;
            let mut baseline_1: Option<u64> = None;
            let mut baseline_extra: std::collections::HashMap<usize, u64> = std::collections::HashMap::new();
            let mut first_byte_constant: Option<u8> = None;
            let mut first_byte_varies = false;
            while running_flag.load(Ordering::SeqCst) {
                // Build a tiny runtime per loop (cost acceptable given low frequency)
                let mut buf = [0u8; 64];
                let maybe_size = rt.block_on(async {
                    let guard = device_arc.lock().await; // MutexGuard<Option<HidDevice>>
                    if let Some(device) = guard.as_ref() {
                        device.read_timeout(&mut buf, 50).ok()
                    } else { None }
                });
                let Some(sz) = maybe_size else { std::thread::sleep(std::time::Duration::from_millis(10)); continue; };
                if sz == 0 { continue; }
                // Store raw report for debugging
                if let Ok(mut lr) = last_report_arc.lock() { lr[..sz.min(64)].copy_from_slice(&buf[..sz.min(64)]); }
                if let Ok(mut ll) = last_report_len_arc.lock() { *ll = sz as usize; }
                report_count += 1;

                // Check if mapping feature available
                let mapping_opt = { mapping_data_arc.lock().unwrap().clone() };
                if let Some(mapping) = mapping_opt {
                    // Determine if the first byte is a report ID and derive payload accordingly
                    let has_report_id = mapping.info.input_report_id != 0 && buf[0] == mapping.info.input_report_id;
                    let payload_start = if has_report_id { 1 } else { 0 };
                    if sz <= payload_start { continue; }
                    let payload = &buf[payload_start..sz];
                    // Buttons start at button_byte_offset
                    let btn_off = mapping.info.button_byte_offset as usize;
                    let btn_bytes_len = ((mapping.info.button_count as usize + 7) / 8).min(16);
                    if payload.len() < btn_off + btn_bytes_len { continue; }
                    let buttons_slice = &payload[btn_off..btn_off+btn_bytes_len];
                    // Build full-range logical pressed set and 64-bit mask for UI
                    let mut new_pressed_set: std::collections::HashSet<u8> = std::collections::HashSet::new();
                    let mut logical_u64: u64 = 0;
                    for bit_index in 0..(mapping.info.button_count as usize) {
                        let byte = buttons_slice[bit_index / 8];
                        let bit_pos = bit_index % 8;
                        let pressed = if mapping.info.button_bit_order == 0 { (byte & (1 << bit_pos)) != 0 } else { (byte & (1 << (7-bit_pos))) != 0 };
                        if pressed {
                            let logical_id = mapping.mapping.get(bit_index).copied().unwrap_or(bit_index as u8);
                            new_pressed_set.insert(logical_id);
                            if (logical_id as usize) < 64 { logical_u64 |= 1u64 << (logical_id as usize); }
                        }
                    }
                    // Diff sets to detect changes across the entire logical range
                    let mut pressed_delta: Vec<u8> = Vec::new();
                    let mut released_delta: Vec<u8> = Vec::new();
                    for &lid in new_pressed_set.iter() { if !prev_pressed_set.contains(&lid) { pressed_delta.push(lid); } }
                    for &lid in prev_pressed_set.iter() { if !new_pressed_set.contains(&lid) { released_delta.push(lid); } }

                    if !pressed_delta.is_empty() || !released_delta.is_empty() {
                        // Keep the previous set in sync
                        prev_pressed_set = new_pressed_set;
                        let timestamp = chrono::Utc::now();
                        // Emit events for all changed buttons (including >63)
                        if let Ok(app_handle) = app_handle_arc.lock() {
                            if let Some(handle) = app_handle.as_ref() {
                                for &button_id in &pressed_delta {
                                    let event = ButtonEvent { button_id, pressed: true, timestamp };
                                    let _ = handle.emit("button-changed", &event);
                                }
                                for &button_id in &released_delta {
                                    let event = ButtonEvent { button_id, pressed: false, timestamp };
                                    let _ = handle.emit("button-changed", &event);
                                }
                            }
                        }
                        // Update cached 64-bit state for UI
                        if let Ok(mut state_guard) = state_arc.lock() {
                            state_guard.buttons = logical_u64;
                            state_guard.timestamp = timestamp;
                        }
                        if let Ok(mut off) = sel_offset_arc.lock() { *off = Some(btn_off + payload_start); }
                        if let Ok(mut raw) = last_raw_arc.lock() { *raw = logical_u64; }
                        // Trim for logging readability
                        let mut p0 = pressed_delta.clone(); p0.sort(); let p0 = if p0.len()>8 { p0[..8].to_vec() } else { p0 };
                        let mut r0 = released_delta.clone(); r0.sort(); let r0 = if r0.len()>8 { r0[..8].to_vec() } else { r0 };
                        // Display logical IDs as 1-based in logs to match firmware tools (e.g., VKB btntester)
                        let p_disp: Vec<u8> = p0.iter().map(|v| v.saturating_add(1)).collect();
                        let r_disp: Vec<u8> = r0.iter().map(|v| v.saturating_add(1)).collect();
                        log::info!(
                            "[HID iface {}] mapped change: pressed={:?} released={:?} mask64=0x{:016X} ({} logical, off {} rid_present={} len={}, id_base=1)",
                            interface, p_disp, r_disp, logical_u64, mapping.info.button_count, btn_off + payload_start, has_report_id, sz
                        );
                    } else if report_count % 200 == 0 {
                        // Heartbeat: refresh timestamp so UI doesn’t stale out
                        if let Ok(mut state_guard) = state_arc.lock() {
                            state_guard.timestamp = chrono::Utc::now();
                        }
                        log::debug!("[HID iface {}] heartbeat rpt#{} no change", interface, report_count);
                    }
                    continue; // processed
                }

                // FALLBACK: heuristic logic (legacy firmware)
                let data = &buf[..(sz as usize).min(buf.len())];
                let mut buttons0: u64 = 0;
                let mut buttons1: u64 = 0;
                for (i, b) in data.iter().take(8).enumerate() { buttons0 |= (*b as u64) << (i * 8); }
                if data.len() > 1 { for (i, b) in data[1..].iter().take(8).enumerate() { buttons1 |= (*b as u64) << (i * 8); } }
                let mut extra_candidates: Vec<(usize, u64)> = Vec::new();
                for &start in &[16usize, 17, 24, 32] { if data.len() > start { let mut val: u64 = 0; for (i, b) in data[start..].iter().take(8).enumerate() { val |= (*b as u64) << (i * 8); } extra_candidates.push((start, val)); } }
                if let Some(&b0) = data.get(0) { match first_byte_constant { None => first_byte_constant = Some(b0), Some(prev) if prev != b0 => { first_byte_varies = true; }, _ => {} } }
                if baseline_0.is_none() { baseline_0 = Some(buttons0); }
                if baseline_1.is_none() { baseline_1 = Some(buttons1); }
                for (s, v) in &extra_candidates { baseline_extra.entry(*s).or_insert(*v); }
                let dyn0 = if let Some(b) = baseline_0 { buttons0 ^ b } else { buttons0 };
                let dyn1 = if let Some(b) = baseline_1 { buttons1 ^ b } else { buttons1 };
                let mut dyn_extra: Vec<(usize, u64)> = Vec::new();
                for (s, v) in &extra_candidates { if let Some(b) = baseline_extra.get(s) { dyn_extra.push((*s, *v ^ *b)); } }
                let _chosen_dyn = if let Some(off) = preferred_offset { if off == 0 { dyn0 } else if off == 1 { dyn1 } else { dyn_extra.iter().find(|(s, _)| *s == off).map(|(_, v)| *v).unwrap_or(0) } } else { let mut candidates: Vec<(usize, u64)> = vec![(0, dyn0), (1, dyn1)]; candidates.extend(dyn_extra.iter().cloned()); if !first_byte_varies && matches!(first_byte_constant, Some(_)) { candidates.sort_by_key(|(off, _)| if *off == 1 {0} else if *off == 0 {1} else {2}); } if let Some((sel_off, val)) = candidates.iter().find(|(_, v)| *v != 0) { preferred_offset = Some(*sel_off); *val } else { dyn0 } };
                let chosen_offset = preferred_offset.unwrap_or(0);
                // Dynamic (baseline-xor) values already computed: dyn0, dyn1, dyn_extra entries.
                let chosen_dyn_val: u64 = match chosen_offset {
                    0 => dyn0,
                    1 => dyn1,
                    _ => dyn_extra.iter().find(|(s, _)| *s == chosen_offset).map(|(_, v)| *v).unwrap_or(0)
                };
                // Previously we shifted dynamic bits left by 1 assuming firmware logical button IDs started at 1.
                // This caused off-by-one mismatches in UI highlighting. Use raw dynamic bits directly.
                let logical_val = chosen_dyn_val;
                if let Ok(mut state_guard) = state_arc.lock() {
                    if state_guard.buttons != logical_val {
                        let changed = state_guard.buttons ^ logical_val;
                        let pressed_now = changed & logical_val;
                        let released_now = changed & state_guard.buttons;
                        let mut newly_pressed: Vec<u8> = Vec::new();
                        let mut newly_released: Vec<u8> = Vec::new();
                        for b in 0..64 { if (pressed_now & (1u64<<b)) != 0 { newly_pressed.push(b as u8); if newly_pressed.len()>=8 { break; }}}
                        for b in 0..64 { if (released_now & (1u64<<b)) != 0 { newly_released.push(b as u8); if newly_released.len()>=8 { break; }}}
                        let timestamp = chrono::Utc::now();
                        log::info!(
                            "[BACKEND HID {} LEGACY @ {}] Button change: pressed={:?} released={:?} (report #{}, offset={}, raw=0x{:016X})",
                            interface, timestamp.format("%H:%M:%S%.3f"), newly_pressed, newly_released, report_count, chosen_offset, logical_val
                        );
                        
                        // Emit events for button changes
                        if let Ok(app_handle) = app_handle_arc.lock() {
                            if let Some(handle) = app_handle.as_ref() {
                                // Emit events for pressed buttons
                                for &button_id in &newly_pressed {
                                    let event = ButtonEvent {
                                        button_id,
                                        pressed: true,
                                        timestamp,
                                    };
                                    let _ = handle.emit("button-changed", &event);
                                }
                                // Emit events for released buttons
                                for &button_id in &newly_released {
                                    let event = ButtonEvent {
                                        button_id,
                                        pressed: false,
                                        timestamp,
                                    };
                                    let _ = handle.emit("button-changed", &event);
                                }
                            }
                        }
                        state_guard.buttons = logical_val;
                        state_guard.timestamp = chrono::Utc::now();
                        if let Ok(mut o) = sel_offset_arc.lock() { *o = Some(chosen_offset); }
                        if let Ok(mut lr) = last_raw_arc.lock() { *lr = logical_val; }
                        if report_count <= 5 {
                            log::info!(
                                "[HID iface {} LEGACY] initial chosen offset {} dyn_raw=0x{:016X} logical=0x{:016X}",
                                interface, chosen_offset, chosen_dyn_val, logical_val
                            );
                        }
                    } else if report_count % 400 == 0 {
                        state_guard.timestamp = chrono::Utc::now();
                        log::debug!("[HID iface {} LEGACY] heartbeat rpt#{}", interface, report_count);
                    }
                }
                
                // Emit periodic state sync event
                if last_sync_time.elapsed() >= SYNC_INTERVAL {
                    last_sync_time = std::time::Instant::now();
                    if let Ok(state) = state_arc.lock() {
                        if let Ok(app_handle) = app_handle_arc.lock() {
                            if let Some(handle) = app_handle.as_ref() {
                                let _ = handle.emit("button-state-sync", &state.clone());
                                log::debug!("Emitted button state sync: 0x{:016X}", state.buttons);
                            }
                        }
                    }
                }
            }
            log::info!("HID reader thread exiting (interface {})", interface);
        });

        let mut handle_guard = self.reader_handle.lock().await;
        *handle_guard = Some(handle);
        Ok(())
    }
}

// --- Tests -----------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::*;

    // Helper: construct a raw feature report ID 3 buffer (1 + 16 bytes) matching HIDMappingInfoRaw
    fn build_feature_report_3(
        protocol_version: u8,
        input_report_id: u8,
        button_count: u8,
        axis_count: u8,
        button_byte_offset: u8,
        button_bit_order: u8,
        mapping_crc: u16,
        frame_counter_offset: u8,
    ) -> [u8; 1 + std::mem::size_of::<HIDMappingInfoRaw>()] {
        let mut buf = [0u8; 1 + std::mem::size_of::<HIDMappingInfoRaw>()];
        buf[0] = 3; // feature report ID
        // Fill struct bytes
        let mut raw = HIDMappingInfoRaw::default();
        raw.protocol_version = protocol_version;
        raw.input_report_id = input_report_id;
        raw.button_count = button_count;
        raw.axis_count = axis_count;
        raw.button_byte_offset = button_byte_offset;
        raw.button_bit_order = button_bit_order;
        raw.mapping_crc = mapping_crc;
        raw.frame_counter_offset = frame_counter_offset;
        // reserved already zeroed
        let raw_bytes = unsafe {
            std::slice::from_raw_parts((&raw as *const HIDMappingInfoRaw) as *const u8, std::mem::size_of::<HIDMappingInfoRaw>())
        };
        buf[1..].copy_from_slice(raw_bytes);
        buf
    }

    #[test]
    fn parse_sequential_mapping_info() {
        // button_count = 12, mapping_crc=0 -> sequential
        let buf = build_feature_report_3(1, 0x01, 12, 4, 10, 0, 0x0000, 0xFF);
        // Emulate logic in try_fetch_mapping() for info extraction
        let mut raw = HIDMappingInfoRaw::default();
        let raw_slice = unsafe { std::slice::from_raw_parts_mut((&mut raw as *mut HIDMappingInfoRaw) as *mut u8, std::mem::size_of::<HIDMappingInfoRaw>()) };
        raw_slice.copy_from_slice(&buf[1..]);
    let protocol_version = raw.protocol_version;
    let input_report_id = raw.input_report_id;
    let button_count = raw.button_count;
    let axis_count = raw.axis_count;
    let button_byte_offset = raw.button_byte_offset;
    let button_bit_order = raw.button_bit_order;
    let mapping_crc = raw.mapping_crc;
    let frame_counter_offset = raw.frame_counter_offset;
    assert_eq!(protocol_version, 1);
    assert_eq!(input_report_id, 0x01);
    assert_eq!(button_count, 12);
    assert_eq!(axis_count, 4);
    assert_eq!(button_byte_offset, 10);
    assert_eq!(button_bit_order, 0);
    assert_eq!(mapping_crc, 0x0000);
    assert_eq!(frame_counter_offset, 0xFF);
        // Sequential mapping should be identity 0..button_count-1
    let mapping: Vec<u8> = (0..button_count).collect();
        assert_eq!(mapping.len(), 12);
        for (i, v) in mapping.iter().enumerate() { assert_eq!(*v as usize, i); }
    }

    #[test]
    fn parse_custom_mapping_info() {
        // Custom mapping indicated by non-zero CRC. We don't compute CRC here; just ensure mapping path logic assumptions hold.
        let buf = build_feature_report_3(1, 0x02, 8, 2, 5, 0, 0x1234, 0x0A);
        let mut raw = HIDMappingInfoRaw::default();
        let raw_slice = unsafe { std::slice::from_raw_parts_mut((&mut raw as *mut HIDMappingInfoRaw) as *mut u8, std::mem::size_of::<HIDMappingInfoRaw>()) };
        raw_slice.copy_from_slice(&buf[1..]);
        let button_count = raw.button_count;
        let mapping_crc = raw.mapping_crc;
        assert_eq!(mapping_crc, 0x1234);
        // Simulate receiving feature report 4 (mapping vector) of length button_count
        let feature4: Vec<u8> = vec![0,2,4,6,1,3,5,7]; // arbitrary permutation
        assert_eq!(feature4.len(), button_count as usize);
        // Validate logical->physical translation expectation: mapping[bit_index] gives logical id
        for (bit_index, logical_id) in feature4.iter().enumerate() {
            // Each logical id should be within range
            assert!((*logical_id as usize) < button_count as usize);
            // Example: check uniqueness (simple O(n^2) fine for small test)
            for (j, other) in feature4.iter().enumerate() { if j != bit_index { assert_ne!(logical_id, other); } }
        }
    }
}