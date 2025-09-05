use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;
use semver::Version;
use tauri::{AppHandle, Emitter};

use crate::serial::{SerialInterface, ConfigProtocol, StorageInfo};
use crate::serial::unified::reader::UnifiedSerialHandle;
use crate::update::{UpdateService, VersionCheckResult};
use crate::config::BinaryConfig;
use crate::hid::{HidReader, ButtonStates};
use super::{Device, ConnectionState, ProfileManager, DeviceError, Result, FirmwareUpdateSettings};
use super::port_monitor::{create_port_monitor, PortMonitor, PortEvent};

/// Central device management system
/// Handles device discovery, connection management, and configuration
#[derive(Clone)]
pub struct DeviceManager {
    devices: Arc<RwLock<HashMap<Uuid, Device>>>,
    connected_device: Arc<Mutex<Option<(Uuid, ConfigProtocol)>>>,
    profile_manager: Arc<Mutex<ProfileManager>>,
    hid_reader: Arc<Mutex<HidReader>>,
    app_handle: Arc<Mutex<Option<AppHandle>>>,
    raw_monitoring_active: Arc<AtomicBool>,
    unified_handles: Arc<Mutex<HashMap<Uuid, UnifiedSerialHandle>>>,
    key_to_id: Arc<Mutex<HashMap<String, Uuid>>>,
    /// One-shot guarded initial discovery burst after app handle is set (bounded, not polling)
    initial_discovery_started: Arc<AtomicBool>,
    /// Port monitor for event-driven device discovery
    port_monitor: Arc<Mutex<Option<Box<dyn PortMonitor>>>>,
    /// Handle for port monitor task
    port_monitor_handle: Arc<Mutex<Option<tokio::task::JoinHandle<()>>>>,
}

impl DeviceManager {
    pub fn new() -> Self {
        // Try to initialize HID reader, log error if it fails
        let hid_reader = HidReader::new().unwrap_or_else(|e| {
            log::warn!("Failed to initialize HID reader: {}. Button state reading will not be available.", e);
            // Return a reader that will work but won't be able to connect
            HidReader::new().expect("Second HID initialization attempt failed")
        });
    // NOTE: Architecture decisions:
    // 1. No continuous polling for device discovery. Instead we perform explicit discover calls
    //    plus a bounded one-shot burst on startup (see set_app_handle) to catch devices that
    //    enumerate slightly after the UI loads. This respects the "no polling" constraint while
    //    improving hot-plug detection at launch.
    // 2. Connection events are standardized: { id, state, error? } with state in
    //    [Connected, Connecting, Disconnected, Error]. All emissions flow through
    //    update_device_connection_state to avoid duplicate or out-of-order UI updates.
    // 3. Device list snapshots are emitted after each connection state change and discovery to
    //    keep frontend authoritative without needing intervals.
        Self {
            devices: Arc::new(RwLock::new(HashMap::new())),
            connected_device: Arc::new(Mutex::new(None)),
            profile_manager: Arc::new(Mutex::new(ProfileManager::new())),
            hid_reader: Arc::new(Mutex::new(hid_reader)),
            app_handle: Arc::new(Mutex::new(None)),
            raw_monitoring_active: Arc::new(AtomicBool::new(false)),
            unified_handles: Arc::new(Mutex::new(HashMap::new())),
            key_to_id: Arc::new(Mutex::new(HashMap::new())),
            initial_discovery_started: Arc::new(AtomicBool::new(false)),
            port_monitor: Arc::new(Mutex::new(None)),
            port_monitor_handle: Arc::new(Mutex::new(None)),
        }
    }

    /// Attempt to fetch HID mapping via serial commands and inject into HID reader if missing.
    async fn try_serial_mapping_fallback(&self, unified_handle: crate::serial::unified::UnifiedSerialHandle) -> Result<Option<bool>> {
        use crate::serial::unified::types::{CommandSpec, ResponseMatcher};
        use std::time::Duration;
        // Check if display mode allows HID
        if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::HID | crate::raw_state::DisplayMode::Both) { return Ok(None); }
        // Quick check if mapping already present
        {
            let hid_reader = self.hid_reader.lock().await;
            if hid_reader.mapping_details().await.is_some() { return Ok(Some(false)); }
        }
        // Issue HID_MAPPING_INFO
    let mapping_info_spec = CommandSpec { name: "HID_MAPPING_INFO", timeout: Duration::from_millis(800), matcher: ResponseMatcher::UntilPrefix("HID_MAPPING_INFO:"), test_min_duration_ms: None };
        let mapping_resp = match unified_handle.send_command("HID_MAPPING_INFO".to_string(), mapping_info_spec).await {
            Ok(r) => r.lines.join("\n"),
            Err(e) => { log::debug!("HID_MAPPING_INFO command unavailable: {}", e); return Ok(None); }
        };
        if !mapping_resp.starts_with("HID_MAPPING_INFO:") { return Ok(None); }
        // Parse key=value pairs after prefix
        let data_part = mapping_resp.splitn(2, ':').nth(1).unwrap_or("");
        let mut proto_ver: u8 = 0; let mut report_id: u8 = 0; let mut btn_cnt: u16 = 0; let mut axis_cnt: u16 = 0; let mut btn_off: u8 = 0; let mut bit_order: u8 = 0; let mut crc: u16 = 0; let mut fc_off: Option<u8> = None;
        for kv in data_part.split(',') { if let Some((k,v)) = kv.split_once('=') { match k { "ver"=> proto_ver = v.parse().unwrap_or(0), "rid"=> report_id = v.parse().unwrap_or(0), "btn"=> btn_cnt = v.parse().unwrap_or(0), "axis"=> axis_cnt = v.parse().unwrap_or(0), "btn_offset"=> btn_off = v.parse().unwrap_or(0), "bit_order"=> bit_order = v.parse().unwrap_or(0), "crc"=> { crc = u16::from_str_radix(v.trim_start_matches("0x"),16).unwrap_or(0); }, "fc_offset"=> fc_off = Some(v.parse().unwrap_or(0)), _=>{} } } }
        if btn_cnt == 0 { return Ok(None); }
        // Always attempt to fetch explicit mapping table; fall back to identity if SEQUENTIAL or unavailable
        let mut mapping: Vec<u8> = (0..btn_cnt.min(128) as u8).collect(); // identity by default
        let map_spec = CommandSpec { name: "HID_BUTTON_MAP", timeout: Duration::from_millis(800), matcher: ResponseMatcher::UntilPrefix("HID_BUTTON_MAP"), test_min_duration_ms: None };
        match unified_handle.send_command("HID_BUTTON_MAP".to_string(), map_spec).await {
            Ok(r) => {
                let resp = r.lines.join("\n");
                if resp.trim() == "HID_BUTTON_MAP:SEQUENTIAL" {
                    // keep identity
                } else if let Some(rest) = resp.strip_prefix("HID_BUTTON_MAP:") {
                    let parsed: Vec<u8> = rest.split(',').filter_map(|n| n.parse::<u8>().ok()).collect();
                    if parsed.is_empty() {
                        if crc != 0 { log::warn!("HID_BUTTON_MAP empty but CRC indicates custom mapping; retaining identity"); }
                    } else {
                        // If length mismatches, clamp/fill to button count
                        if parsed.len() != btn_cnt as usize { log::warn!("HID_BUTTON_MAP length {} != button_count {}; clamping", parsed.len(), btn_cnt); }
                        mapping = (0..btn_cnt.min(128) as u8).map(|i| parsed.get(i as usize).copied().unwrap_or(i)).collect();
                    }
                } else {
                    if crc != 0 { log::warn!("Unexpected HID_BUTTON_MAP response '{}'; retaining identity", resp.trim()); }
                }
            }
            Err(e) => {
                if crc != 0 { log::warn!("HID_BUTTON_MAP unavailable ({}); retaining identity", e); }
            }
        }
        // Inject mapping
        let injected = {
            let hid_reader = self.hid_reader.lock().await;
            let ext_info = crate::hid::ExternalMappingInfo {
                protocol_version: proto_ver,
                input_report_id: report_id,
                button_count: btn_cnt,
                axis_count: axis_cnt,
                button_byte_offset: btn_off,
                button_bit_order: bit_order,
                mapping_crc: crc,
                frame_counter_offset: fc_off,
            };
            hid_reader.apply_external_mapping(ext_info, mapping, false)
        };
        Ok(Some(injected))
    }

    /// Start the port monitor for event-driven device discovery
    async fn start_port_monitor(&self) {
        let mut monitor = create_port_monitor();
        
        if let Err(e) = monitor.start().await {
            log::error!("Failed to start port monitor: {}", e);
            return;
        }
        
        if let Some(mut rx) = monitor.get_receiver() {
            let mgr = self.clone();
            let handle = tokio::spawn(async move {
                log::info!("Port monitor started, listening for device changes");
                
                while let Some(event) = rx.recv().await {
                    log::info!("Port event received: {:?}", event);
                    
                    match event {
                        PortEvent::PortAdded(_) | PortEvent::PortRemoved(_) => {
                            // Trigger device discovery on any port change
                            if let Err(e) = mgr.discover_devices().await {
                                log::error!("Failed to discover devices after port event: {}", e);
                            }
                        }
                    }
                }
                
                log::info!("Port monitor event loop ended");
            });
            
            *self.port_monitor_handle.lock().await = Some(handle);
        }
        
        *self.port_monitor.lock().await = Some(monitor);
    }
    
    /// Stop the port monitor
    async fn stop_port_monitor(&self) {
        // Stop the event loop
        if let Some(handle) = self.port_monitor_handle.lock().await.take() {
            handle.abort();
            let _ = handle.await;
        }
        
        // Stop the monitor itself
        if let Some(mut monitor) = self.port_monitor.lock().await.take() {
            if let Err(e) = monitor.stop().await {
                log::error!("Error stopping port monitor: {}", e);
            }
        }
    }
    
    /// Sanitize a firmware version string so it can be parsed as proper semver.
    /// - Trims whitespace and any embedded NULs
    /// - Splits on line breaks and takes the first non-empty line
    /// - Removes trailing descriptive tokens after a space that are clearly not part of semver
    /// - Strips stray carriage returns left in the middle
    /// If the cleaned version still fails to parse, we leave the original so that
    /// higher layers can decide how to handle it; but we attempt best-effort fix.
    fn sanitize_firmware_version(raw: &str) -> String {
        // Fast path: empty
        if raw.is_empty() { return raw.to_string(); }
        // Remove any embedded "\0" just in case, trim
        let mut cleaned = raw.replace('\0', "");
        // Normalize line endings then split
        cleaned = cleaned.replace('\r', "\n");
        let mut first_line = cleaned.lines().find(|l| !l.trim().is_empty()).unwrap_or("").trim().to_string();
        // Some firmware appends markers like " GPIO_STATES" after the semver; drop after first space
        if let Some(space_idx) = first_line.find(' ') { first_line = first_line[..space_idx].to_string(); }
        // Remove any residual control chars
        first_line.retain(|c| !c.is_control() || c == '\n');
        // Final trim
        first_line = first_line.trim().to_string();
        // Validate basic semver shape (very lightweight): must contain a digit and a dot
        if !first_line.is_empty() && first_line.chars().any(|c| c.is_ascii_digit()) && first_line.contains('.') {
            // Attempt full semver parse (allow pre-release/build metadata)
            if semver::Version::parse(&first_line).is_ok() {
                return first_line;
            }
            // Try removing trailing non-semver characters (e.g., stray punctuation)
            let trimmed = first_line.trim_end_matches(|c: char| !(c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '+'));
            if trimmed != first_line && semver::Version::parse(trimmed).is_ok() { return trimmed.to_string(); }
        }
        // Fallback: original first line (or raw if first_line empty)
        if first_line.is_empty() { raw.trim().to_string() } else { first_line }
    }

    pub async fn get_unified_serial_handle(&self) -> Option<crate::serial::unified::reader::UnifiedSerialHandle> {
        let connected_guard = self.connected_device.lock().await;
    if let Some((id, _)) = &*connected_guard {
            let handles = self.unified_handles.lock().await;
            handles.get(id).cloned()
        } else { None }
    }
    
    /// Set the Tauri app handle for event emission
    pub async fn set_app_handle(&self, handle: AppHandle) {
        let hid_reader = self.hid_reader.lock().await;
        hid_reader.set_app_handle(handle.clone());
        
        let mut app_handle_guard = self.app_handle.lock().await;
        *app_handle_guard = Some(handle.clone());
        drop(app_handle_guard); // Release the lock before calling start_raw_state_monitoring
        
    // If we're in Raw mode or Both and have a connected device, start raw monitoring now
    if matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::Raw | crate::raw_state::DisplayMode::Both) {
            let connected_guard = self.connected_device.lock().await;
            if connected_guard.is_some() {
                drop(connected_guard); // Release the lock before calling start_raw_state_monitoring
                let _ = self.start_raw_state_monitoring(handle).await;
                log::info!("Started raw state monitoring after app handle was set");
            }
        }

        // Start port monitor for event-driven device discovery
        if !self.initial_discovery_started.swap(true, Ordering::SeqCst) {
            self.start_port_monitor().await;
        }
    }

    /// Discover available JoyCore devices
    pub async fn discover_devices(&self) -> Result<Vec<Device>> {
        let serial_devices = SerialInterface::discover_devices().map_err(DeviceError::SerialError)?;
        let mut devices_guard = self.devices.write().await;
        let mut key_map = self.key_to_id.lock().await;
        let mut seen_keys = std::collections::HashSet::new();
        let mut result = Vec::new();

        for info in serial_devices {
            let key = format!("{}:{}", info.port_name, info.serial_number.clone().unwrap_or_default());
            seen_keys.insert(key.clone());
            if let Some(id) = key_map.get(&key).cloned() {
                if let Some(existing) = devices_guard.get_mut(&id) {
                    existing.serial_number = info.serial_number.clone();
                    existing.manufacturer = info.manufacturer.clone();
                    existing.product = info.product.clone();
                    existing.last_seen = chrono::Utc::now();
                    if let Some(ref fw) = info.firmware_version { 
                        if let Some(ref mut st) = existing.device_status { 
                            let cleaned = Self::sanitize_firmware_version(fw);
                            if cleaned != st.firmware_version { 
                                log::debug!("Discovery sanitized firmware version '{}' -> '{}'", fw, cleaned);
                                st.firmware_version = cleaned; 
                            }
                        }
                    }
                    result.push(existing.clone());
                }
            } else {
                let device = Device::from_serial_info(&info);
                let id = device.id;
                key_map.insert(key, id);
                devices_guard.insert(id, device.clone());
                result.push(device);
            }
        }
        // Remove stale keys (disconnected devices) that vanished
        let to_remove: Vec<Uuid> = key_map.iter()
            .filter_map(|(k, id)| if !seen_keys.contains(k) { Some(*id) } else { None })
            .collect();
        for id in to_remove {
            key_map.retain(|_, v| *v != id);
            if let Some(mut d) = devices_guard.remove(&id) { d.update_connection_state(ConnectionState::Disconnected); }
        }
        drop(devices_guard);
        self.emit_device_list().await;
        Ok(result)
    }

    /// Clean up devices that are no longer present (separate from discovery)
    // legacy cleanup_disconnected_devices removed: event-driven discovery now authoritative

    /// Get all known devices
    pub async fn get_devices(&self) -> Vec<Device> {
        let devices_guard = self.devices.read().await;
        devices_guard.values().cloned().collect()
    }

    /// Get a specific device by ID
    pub async fn get_device(&self, device_id: &Uuid) -> Option<Device> {
        let devices_guard = self.devices.read().await;
        devices_guard.get(device_id).cloned()
    }

    /// Connect to a device
    pub async fn connect_device(&self, device_id: &Uuid) -> Result<()> {
        // Check if another device is already connected
        {
            let connected_guard = self.connected_device.lock().await;
            if connected_guard.is_some() {
                return Err(DeviceError::AlreadyConnected);
            }
        }

        // Get device info
        let device = {
            let devices_guard = self.devices.read().await;
            devices_guard.get(device_id).cloned()
                .ok_or(DeviceError::NotFound)?
        };

        // Update device state to connecting
        self.update_device_connection_state(device_id, ConnectionState::Connecting).await;

        // Get the device info from discovery for proper connection
        let serial_devices = SerialInterface::discover_devices()
            .map_err(DeviceError::SerialError)?;
        let device_info = serial_devices.iter()
            .find(|info| info.port_name == device.port_name)
            .cloned();
        
        // Attempt connection
        let mut serial_interface = SerialInterface::new();
        log::info!("Attempting to connect to port: {}", device.port_name);
        let connection_result = match device_info {
            Some(info) => {
                log::info!("Using discovered device info with firmware version: {:?}", info.firmware_version);
                serial_interface.connect_with_info(info)
            }
            None => {
                log::warn!("No device info found for {}, using basic connection", device.port_name);
                serial_interface.connect(&device.port_name)
            }
        };
        
        match connection_result {
            Ok(()) => {
                log::info!("Serial connection successful, initializing protocol");
                // Create protocol handler
                // Wrap interface and build unified reader/handle
                let iface_arc = std::sync::Arc::new(tokio::sync::Mutex::new(serial_interface));
                let builder = crate::serial::unified::UnifiedSerialBuilder { interface: iface_arc.clone(), event_capacity: 256, command_capacity: 64 };
                let handle = builder.build();
                let mut protocol = ConfigProtocol::new(handle.clone(), iface_arc.clone());
                
                // Initialize protocol
                match protocol.init().await {
                    Ok(()) => {
                        log::info!("Protocol initialization successful, getting device status");
                        // Get device status
                        match protocol.get_device_status().await {
                            Ok(status) => {
                                log::info!("Device status retrieved successfully: {:?}", status);
                                // Update device with status info first
                                self.update_device_status(device_id, status).await;
                                // Store connected device BEFORE emitting connected event to avoid race for frontend follow-up commands
                                log::debug!("Storing connected device protocol before emitting Connected state");
                                {
                                    let mut connected_guard = self.connected_device.lock().await;
                                    *connected_guard = Some((*device_id, protocol));
                                }
                                { let mut map = self.unified_handles.lock().await; map.insert(*device_id, handle.clone()); }
                                // Now emit connected state
                                log::debug!("Emitting Connected state after protocol stored");
                                self.update_device_connection_state(device_id, ConnectionState::Connected).await;

                                // Conditionally start monitoring based on display mode (Both starts both paths)
                                let mode = crate::raw_state::get_display_mode();
                                if matches!(mode, crate::raw_state::DisplayMode::HID | crate::raw_state::DisplayMode::Both) {
                                    let _ = self.connect_hid().await;
                                    log::info!("Started HID monitoring (mode: {:?})", mode);
                                    // Attempt serial mapping fallback if HID mapping not present yet
                                    match self.try_serial_mapping_fallback(handle.clone()).await {
                                        Ok(Some(true)) => log::info!("Serial mapping fallback applied successfully"),
                                        Ok(Some(false)) => {},
                                        Ok(None) => {},
                                        Err(e) => log::warn!("Serial mapping fallback error: {:?}", e),
                                    }
                                }
                                if matches!(mode, crate::raw_state::DisplayMode::Raw | crate::raw_state::DisplayMode::Both) {
                                    if let Some(app_handle) = &*self.app_handle.lock().await {
                                        let _ = self.start_raw_state_monitoring(app_handle.clone()).await;
                                        log::info!("Started raw state monitoring (mode: {:?})", mode);
                                    } else {
                                        log::info!("Raw monitoring mode active - will start when app handle is available");
                                    }
                                }
                                log::info!("Successfully connected to device: {}", device.port_name);
                                Ok(())
                            }
                            Err(e) => {
                                let error_msg = format!("Failed to get device status: {}", e);
                                log::error!("{}", error_msg);
                self.update_device_connection_state(device_id, ConnectionState::Error(error_msg.clone())).await;
                                Err(DeviceError::SerialError(e))
                            }
                        }
                    }
                    Err(e) => {
                        let error_msg = format!("Protocol initialization failed: {}", e);
                        log::error!("{}", error_msg);
            self.update_device_connection_state(device_id, ConnectionState::Error(error_msg)).await;
                        Err(DeviceError::SerialError(e))
                    }
                }
            }
            Err(e) => {
                let error_msg = format!("Connection failed: {}", e);
                log::error!("{}", error_msg);
        self.update_device_connection_state(device_id, ConnectionState::Error(error_msg)).await;
                Err(DeviceError::SerialError(e))
            }
        }
    }

    /// Disconnect from the currently connected device
    pub async fn disconnect_device(&self) -> Result<()> {
        // First capture whether a device is connected (without taking ownership yet)
        let device_id_opt = {
            let connected_guard = self.connected_device.lock().await;
            connected_guard.as_ref().map(|(id, _)| *id)
        };

        let device_id = match device_id_opt {
            Some(id) => id,
            None => return Err(DeviceError::NotConnected),
        };

        // Stop any active monitoring BEFORE tearing down protocol to avoid deadlocks on connected_device
        match crate::raw_state::get_display_mode() {
            crate::raw_state::DisplayMode::Raw | crate::raw_state::DisplayMode::Both => {
                if self.raw_monitoring_active.load(Ordering::Relaxed) {
                    log::debug!("Stopping raw monitoring prior to disconnect for device {}", device_id);
                    let _ = self.stop_raw_state_monitoring().await; // This acquires connected_device internally; safe because we are not holding it
                }
            },
            crate::raw_state::DisplayMode::HID => {
                // HID monitoring stop handled after protocol disconnect (does not lock connected_device)
            },
        }

        // Now take ownership of the protocol and clear connected_device
        let protocol_opt = {
            let mut connected_guard = self.connected_device.lock().await;
            connected_guard.take().map(|(_, protocol)| protocol)
        };

        if let Some(protocol) = protocol_opt {
            // Perform protocol / serial disconnect
            protocol.disconnect_locked().await;
            log::debug!("Serial protocol disconnected for device {}", device_id);
        }

        // Remove unified handle (reader task will naturally terminate after port closed)
        {
            let mut handles = self.unified_handles.lock().await;
            handles.remove(&device_id);
        }

        // Now handle HID monitoring stop (after protocol disconnect so underlying interface closed)
    if matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::HID | crate::raw_state::DisplayMode::Both) {
            let _ = self.disconnect_hid().await; // Ignore errors (non-fatal)
            log::info!("Disconnected HID monitoring");
        }

        // Emit disconnected state
        self.update_device_connection_state(&device_id, ConnectionState::Disconnected).await;
        log::info!("Disconnected from device {}", device_id);
        Ok(())
    }

    /// Get the currently connected device ID
    pub async fn get_connected_device_id(&self) -> Option<Uuid> {
        let connected_guard = self.connected_device.lock().await;
        connected_guard.as_ref().map(|(id, _)| *id)
    }

    /// Execute a command on the connected device
    pub async fn execute_with_protocol<F, R>(&self, f: F) -> Result<R>
    where
        F: FnOnce(&mut ConfigProtocol) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<R>> + Send + '_>>,
        R: Send,
    {
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            f(protocol).await
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Read axis configuration from connected device
    pub async fn read_axis_config(&self, axis_id: u8) -> Result<crate::serial::protocol::AxisConfig> {
        self.execute_with_protocol(|protocol| {
            Box::pin(async move {
                protocol.read_axis_config(axis_id).await
                    .map_err(DeviceError::SerialError)
            })
        }).await
    }

    /// Write axis configuration to connected device
    pub async fn write_axis_config(&self, config: &crate::serial::protocol::AxisConfig) -> Result<()> {
        let config_clone = config.clone();
        self.execute_with_protocol(|protocol| {
            Box::pin(async move {
                protocol.write_axis_config(&config_clone).await
                    .map_err(DeviceError::SerialError)
            })
        }).await
    }

    /// Read button configuration from connected device
    pub async fn read_button_config(&self, button_id: u8) -> Result<crate::serial::protocol::ButtonConfig> {
        self.execute_with_protocol(|protocol| {
            Box::pin(async move {
                protocol.read_button_config(button_id).await
                    .map_err(DeviceError::SerialError)
            })
        }).await
    }

    /// Write button configuration to connected device
    pub async fn write_button_config(&self, config: &crate::serial::protocol::ButtonConfig) -> Result<()> {
        let config_clone = config.clone();
        self.execute_with_protocol(|protocol| {
            Box::pin(async move {
                protocol.write_button_config(&config_clone).await
                    .map_err(DeviceError::SerialError)
            })
        }).await
    }

    /// Save configuration to device
    pub async fn save_device_config(&self) -> Result<()> {
        self.execute_with_protocol(|protocol| {
            Box::pin(async move {
                protocol.save_config().await
                    .map_err(DeviceError::SerialError)
            })
        }).await
    }

    /// Load configuration from device
    pub async fn load_device_config(&self) -> Result<()> {
        self.execute_with_protocol(|protocol| {
            Box::pin(async move {
                protocol.load_config().await
                    .map_err(DeviceError::SerialError)
            })
        }).await
    }

    /// Get profile manager
    pub async fn get_profile_manager(&self) -> ProfileManager {
        let profile_guard = self.profile_manager.lock().await;
        profile_guard.clone()
    }

    /// Update profile manager
    pub async fn update_profile_manager<F>(&self, f: F) -> Result<()>
    where
        F: FnOnce(&mut ProfileManager),
    {
        let mut profile_guard = self.profile_manager.lock().await;
        f(&mut profile_guard);
        Ok(())
    }

    /// Helper method to update device connection state
    async fn update_device_connection_state(&self, device_id: &Uuid, state: ConnectionState) {
        // Normalize state for event emission
        let (state_str, error_msg) = match &state {
            ConnectionState::Connected => ("Connected", None),
            ConnectionState::Connecting => ("Connecting", None),
            ConnectionState::Disconnected => ("Disconnected", None),
            ConnectionState::Error(msg) => ("Error", Some(msg.clone())),
        };
        let mut devices_guard = self.devices.write().await;
        if let Some(device) = devices_guard.get_mut(device_id) {
            device.update_connection_state(state);
        }
        drop(devices_guard);
        // Emit updated device list snapshot FIRST so frontend has current device object before connection event
        self.emit_device_list().await; // internal logging added there
        // Then emit standardized connection event payload
        if let Some(app) = &*self.app_handle.lock().await {
            let payload = if let Some(err) = error_msg { serde_json::json!({"id": device_id.to_string(), "state": state_str, "error": err}) } else { serde_json::json!({"id": device_id.to_string(), "state": state_str}) };
            match app.emit("device_connection_changed", &payload) {
                Ok(_) => log::info!("Emitted device_connection_changed: {} -> {}", device_id, state_str),
                Err(e) => log::warn!("Failed to emit device_connection_changed ({}): {}", state_str, e),
            }
        } else {
            log::debug!("Skipped device_connection_changed emission (app_handle not yet set) state={} id={}", state_str, device_id);
        }
    }

    /// Helper method to update device status
    async fn update_device_status(&self, device_id: &Uuid, status: crate::serial::protocol::DeviceStatus) {
        let mut devices_guard = self.devices.write().await;
        if let Some(device) = devices_guard.get_mut(device_id) {
            let mut sanitized = status.clone();
            let original_fw = sanitized.firmware_version.clone();
            let cleaned = Self::sanitize_firmware_version(&original_fw);
            if cleaned != original_fw {
                log::debug!("Sanitized firmware version '{}' -> '{}'", original_fw, cleaned);
                sanitized.firmware_version = cleaned;
            }
            device.update_device_status(sanitized);
        }
        drop(devices_guard);
        self.emit_device_list().await;
    }

    pub async fn emit_device_list(&self) {
        if let Some(app) = &*self.app_handle.lock().await {
            let list = self.get_devices().await;
            let count = list.len();
            match app.emit("device_list_updated", &list) {
                Ok(_) => log::info!("Emitted device_list_updated ({} devices)", count),
                Err(e) => log::warn!("Failed to emit device_list_updated: {}", e),
            }
        } else {
            log::debug!("Skipped device_list_updated emission (app_handle not yet set)");
        }
    }

    // Firmware update methods

    /// Check for firmware updates for the connected device
    pub async fn check_device_firmware_updates(
        &self,
        update_settings: &FirmwareUpdateSettings,
    ) -> Result<Option<VersionCheckResult>> {
        let connected_guard = self.connected_device.lock().await;
        
        if let Some((device_id, _)) = connected_guard.as_ref() {
            let devices_guard = self.devices.read().await;
            if let Some(device) = devices_guard.get(device_id) {
                if let Some(device_status) = &device.device_status {
                    let current_version = Version::parse(&device_status.firmware_version)
                        .map_err(|e| DeviceError::UpdateError(format!("Invalid firmware version: {}", e)))?;
                    
                    let update_service = UpdateService::new(
                        update_settings.repo_owner.clone(),
                        update_settings.repo_name.clone(),
                    );
                    
                    let result = update_service
                        .check_for_updates(current_version)
                        .await
                        .map_err(|e| DeviceError::UpdateError(format!("Update check failed: {}", e)))?;
                    
                    return Ok(Some(result));
                }
            }
        }
        
        Ok(None)
    }

    /// Get current firmware version of connected device
    pub async fn get_device_firmware_version(&self) -> Option<String> {
        let connected_guard = self.connected_device.lock().await;
        
        if let Some((device_id, _)) = connected_guard.as_ref() {
            let devices_guard = self.devices.read().await;
            if let Some(device) = devices_guard.get(device_id) {
                return device.device_status
                    .as_ref()
                    .map(|status| status.firmware_version.clone());
            }
        }
        
        None
    }

    // Binary configuration file operations

    /// Read raw binary configuration from device
    pub async fn read_config_binary(&self) -> Result<Vec<u8>> {
        // Temporarily pause monitoring to prevent data contamination
        let was_monitoring = self.is_raw_state_monitoring().await;
        if was_monitoring {
            log::info!("Temporarily stopping monitoring for config read");
            let _ = self.stop_raw_state_monitoring().await;
        }
        
        let mut connected_guard = self.connected_device.lock().await;
        
        let result = if let Some((_, protocol)) = connected_guard.as_mut() {
            let data = protocol.read_file("/config.bin").await
                .map_err(DeviceError::SerialError)?;
            Ok(data)
        } else {
            Err(DeviceError::NotConnected)
        };
        
        // Drop the lock before restarting monitoring
        drop(connected_guard);
        
        // Restart monitoring if it was running
        if was_monitoring {
            if let Some(app_handle) = self.app_handle.lock().await.as_ref() {
                log::info!("Restarting monitoring after config read");
                let _ = self.start_raw_state_monitoring(app_handle.clone()).await;
            }
        }
        
        result
    }

    /// Write raw binary configuration to device
    pub async fn write_config_binary(&self, data: &[u8]) -> Result<()> {
        // First validate the binary data
        let config = BinaryConfig::from_bytes(data)
            .map_err(|e| DeviceError::ProtocolError(format!("Invalid config data: {}", e)))?;
        
        // Serialize back to ensure it's valid
        let validated_data = config.to_bytes()
            .map_err(|e| DeviceError::ProtocolError(format!("Failed to serialize config: {}", e)))?;
        
        // Temporarily pause monitoring to prevent data contamination
        let was_monitoring = self.is_raw_state_monitoring().await;
        if was_monitoring {
            log::info!("Temporarily stopping monitoring for config write");
            let _ = self.stop_raw_state_monitoring().await;
        }
        
        let mut connected_guard = self.connected_device.lock().await;
        
        let result = if let Some((_, protocol)) = connected_guard.as_mut() {
            // The firmware automatically creates a backup before writing
            protocol.write_raw_file("/config.bin", &validated_data).await
                .map_err(DeviceError::SerialError)?;
            log::info!("Successfully wrote binary configuration to device");
            Ok(())
        } else {
            Err(DeviceError::NotConnected)
        };
        
        // Drop the lock before restarting monitoring
        drop(connected_guard);
        
        // Restart monitoring if it was running
        if was_monitoring {
            if let Some(app_handle) = self.app_handle.lock().await.as_ref() {
                log::info!("Restarting monitoring after config write");
                let _ = self.start_raw_state_monitoring(app_handle.clone()).await;
            }
        }
        
        result
    }

    /// Delete configuration file (forces regeneration on next boot)
    pub async fn delete_config_file(&self) -> Result<()> {
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            protocol.delete_file("/config.bin").await
                .map_err(DeviceError::SerialError)?;
            log::warn!("Configuration file deleted - will regenerate on next boot");
            Ok(())
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Reset device to factory defaults
    pub async fn reset_device_to_defaults(&self) -> Result<()> {
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            protocol.reset_to_defaults().await
                .map_err(DeviceError::SerialError)?;
            log::info!("Device reset to factory defaults");
            Ok(())
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Format device storage (nuclear option - deletes all files)
    pub async fn format_device_storage(&self) -> Result<()> {
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            protocol.format_storage().await
                .map_err(DeviceError::SerialError)?;
            log::warn!("Device storage formatted - all files deleted");
            Ok(())
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Get device storage information
    pub async fn get_device_storage_info(&self) -> Result<StorageInfo> {
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            let info = protocol.get_storage_details().await
                .map_err(DeviceError::SerialError)?;
            Ok(info)
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// List files on device storage
    pub async fn list_device_files(&self) -> Result<Vec<String>> {
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            let files = protocol.list_files().await
                .map_err(DeviceError::SerialError)?;
            Ok(files)
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Read any file from device storage
    pub async fn read_device_file(&self, filename: &str) -> Result<Vec<u8>> {
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            let data = protocol.read_file(filename).await
                .map_err(DeviceError::SerialError)?;
            Ok(data)
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Write any file to device storage
    pub async fn write_device_file(&self, filename: &str, data: &[u8]) -> Result<()> {
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            protocol.write_raw_file(filename, data).await
                .map_err(DeviceError::SerialError)?;
            Ok(())
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Delete any file from device storage
    pub async fn delete_device_file(&self, filename: &str) -> Result<()> {
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            protocol.delete_file(filename).await
                .map_err(DeviceError::SerialError)?;
            Ok(())
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Read button states from HID device
    pub async fn read_button_states(&self) -> Result<ButtonStates> {
    // Check display mode allows HID (HID or Both)
    if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::HID | crate::raw_state::DisplayMode::Both) {
            return Err(DeviceError::SerialError(
                crate::serial::SerialError::ProtocolError("HID button states only available in HID mode".to_string())
            ));
        }
        
        let hid_reader = self.hid_reader.lock().await;
        
        // Check if we're connected to a device via serial first
        let connected = {
            let connected_guard = self.connected_device.lock().await;
            connected_guard.is_some()
        };
        
        if !connected {
            log::debug!("read_button_states called but no device connected");
            return Err(DeviceError::NotConnected);
        }
        
        // Check if HID is connected
        if !hid_reader.is_connected().await {
            log::warn!("read_button_states called but HID not connected");
            return Err(DeviceError::SerialError(
                crate::serial::SerialError::ProtocolError("HID device not connected".to_string())
            ));
        }
        
        // Try to read button states from HID
        match hid_reader.read_button_states().await {
            Ok(states) => {
                static ONCE: std::sync::Once = std::sync::Once::new();
                ONCE.call_once(|| {
                    log::info!("First successful HID button read");
                });
                Ok(states)
            }
            Err(e) => {
                log::error!("Failed to read HID button states: {}", e);
                Err(DeviceError::SerialError(
                    crate::serial::SerialError::ProtocolError(format!("HID error: {}", e))
                ))
            }
        }
    }

    /// Debug helper: get selected HID offset and last raw value (if available)
    pub async fn hid_debug_mapping(&self) -> Option<(usize, u64)> {
    if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::HID | crate::raw_state::DisplayMode::Both) {
            return None;
        }
        let hid_reader = self.hid_reader.lock().await;
        hid_reader.debug_hid_mapping().await
    }

    /// Debug helper: get last full HID report (len, hex)
    pub async fn hid_full_report(&self) -> Option<(usize, String)> {
    if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::HID | crate::raw_state::DisplayMode::Both) {
            return None;
        }
        let hid_reader = self.hid_reader.lock().await;
        hid_reader.debug_full_report().await
    }

    /// Detailed HID mapping info if supported by firmware
    pub async fn hid_mapping_details(&self) -> Option<serde_json::Value> {
    if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::HID | crate::raw_state::DisplayMode::Both) {
            return None;
        }
        let hid_reader = self.hid_reader.lock().await;
        hid_reader.mapping_details().await
    }

    /// Diagnostic: raw vs logical button bits (first 16) for offset debugging
    pub async fn hid_button_bit_diagnostics(&self) -> Option<serde_json::Value> {
    if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::HID | crate::raw_state::DisplayMode::Both) {
            return None;
        }
        let hid_reader = self.hid_reader.lock().await;
        hid_reader.debug_button_bit_diagnostics().await
    }
    
    /// Connect HID device (called automatically when connecting via serial)
    pub(crate) async fn connect_hid(&self) -> Result<()> {
        let hid_reader = self.hid_reader.lock().await;
        
        // Try to connect to HID device
        match hid_reader.connect().await {
            Ok(()) => {
                log::info!("HID device connected for button state reading");
                Ok(())
            }
            Err(e) => {
                log::warn!("Failed to connect HID device: {}. Button states will not be available.", e);
                // Don't fail the overall connection if HID fails
                Ok(())
            }
        }
    }
    
    /// Disconnect HID device (called automatically when disconnecting serial)
    pub(crate) async fn disconnect_hid(&self) -> Result<()> {
        let hid_reader = self.hid_reader.lock().await;
        
        match hid_reader.disconnect().await {
            Ok(()) => {
                log::info!("HID device disconnected");
                Ok(())
            }
            Err(e) => {
                log::warn!("Failed to disconnect HID device: {}", e);
                // Don't fail the overall disconnection if HID fails
                Ok(())
            }
        }
    }

    // Raw hardware state methods

    /// Read raw GPIO states from connected device
    pub async fn read_raw_gpio_states(&self) -> Result<crate::raw_state::RawGpioStates> {
        // Check if we're in Raw mode first
    if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::Raw | crate::raw_state::DisplayMode::Both) {
            return Err(DeviceError::SerialError(
                crate::serial::SerialError::ProtocolError("Raw GPIO states only available in Raw mode".to_string())
            ));
        }
        
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = &mut *connected_guard {
            crate::raw_state::RawStateReader::read_gpio_states(protocol)
                .await
                .map_err(|e| DeviceError::SerialError(crate::serial::SerialError::ProtocolError(e)))
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Read raw matrix states from connected device
    pub async fn read_raw_matrix_state(&self) -> Result<crate::raw_state::MatrixState> {
        // Check if we're in Raw mode first
    if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::Raw | crate::raw_state::DisplayMode::Both) {
            return Err(DeviceError::SerialError(
                crate::serial::SerialError::ProtocolError("Raw matrix states only available in Raw mode".to_string())
            ));
        }
        
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = &mut *connected_guard {
            crate::raw_state::RawStateReader::read_matrix_state(protocol)
                .await
                .map_err(|e| DeviceError::SerialError(crate::serial::SerialError::ProtocolError(e)))
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Read raw shift register states from connected device
    pub async fn read_raw_shift_reg_state(&self) -> Result<Vec<crate::raw_state::ShiftRegisterState>> {
        // Check if we're in Raw mode first
    if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::Raw | crate::raw_state::DisplayMode::Both) {
            return Err(DeviceError::SerialError(
                crate::serial::SerialError::ProtocolError("Raw shift register states only available in Raw mode".to_string())
            ));
        }
        
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = &mut *connected_guard {
            crate::raw_state::RawStateReader::read_shift_reg_state(protocol)
                .await
                .map_err(|e| DeviceError::SerialError(crate::serial::SerialError::ProtocolError(e)))
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Read all raw hardware states from connected device
    pub async fn read_all_raw_states(&self) -> Result<crate::raw_state::RawHardwareState> {
    // Check display mode allows Raw (Raw or Both)
    if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::Raw | crate::raw_state::DisplayMode::Both) {
            return Err(DeviceError::SerialError(
                crate::serial::SerialError::ProtocolError("Raw hardware states only available in Raw mode".to_string())
            ));
        }
        
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = &mut *connected_guard {
            crate::raw_state::RawStateReader::read_all_states(protocol)
                .await
                .map_err(|e| DeviceError::SerialError(crate::serial::SerialError::ProtocolError(e)))
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Start raw state monitoring for connected device
    pub async fn start_raw_state_monitoring(&self, app_handle: tauri::AppHandle) -> Result<()> {
    // Check display mode allows Raw (Raw or Both)
    if !matches!(crate::raw_state::get_display_mode(), crate::raw_state::DisplayMode::Raw | crate::raw_state::DisplayMode::Both) {
            return Err(DeviceError::SerialError(
                crate::serial::SerialError::ProtocolError("Raw state monitoring only available in Raw mode".to_string())
            ));
        }
        
        // Check if already monitoring
        if self.raw_monitoring_active.load(Ordering::Relaxed) {
            return Ok(());
        }

        // Set monitoring flag
        self.raw_monitoring_active.store(true, Ordering::Relaxed);

        // Use the new continuous monitoring system
        let device_id = {
            let connected_guard = self.connected_device.lock().await;
            if let Some((id, _)) = &*connected_guard {
                id.to_string()
            } else {
                return Err(DeviceError::NotConnected);
            }
        };

        log::info!("Starting raw state monitoring for device {} using new monitoring system", device_id);

        // Use the new unified monitoring system with 50ms polling and continuous monitoring capabilities
        let monitor = crate::raw_state::monitor::get_monitor();
        monitor.start_monitoring_with_protocol(
            device_id, 
            app_handle, 
            std::sync::Arc::new(self.clone())
        ).await.map_err(|e| {
            log::error!("Failed to start new monitoring system: {}", e);
            self.raw_monitoring_active.store(false, Ordering::Relaxed);
            DeviceError::SerialError(crate::serial::SerialError::ProtocolError(e))
        })?;

        log::info!("New monitoring system started successfully");

        Ok(())
    }

    /// Check if raw state monitoring is currently active
    pub async fn is_raw_state_monitoring(&self) -> bool {
        self.raw_monitoring_active.load(Ordering::Relaxed)
    }

    /// Stop raw state monitoring for connected device
    pub async fn stop_raw_state_monitoring(&self) -> Result<()> {
        // Set monitoring flag to stop background loop
        self.raw_monitoring_active.store(false, Ordering::Relaxed);
        
        // Stop through monitor module
        let device_id = {
            let connected_guard = self.connected_device.lock().await;
            if let Some((id, _)) = &*connected_guard {
                id.to_string()
            } else {
                return Ok(()); // Already disconnected
            }
        };
        
        let monitor = crate::raw_state::monitor::get_monitor();
        let _ = monitor.stop_monitoring(&device_id).await;
        
        Ok(())
    }

    /// Get access to connected protocol for monitoring (internal use)
    pub(crate) async fn get_connected_protocol_for_monitoring(&self) -> Result<()> {
        let connected_guard = self.connected_device.lock().await;
        if connected_guard.is_some() {
            Ok(())
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Send a raw monitor command
    pub(crate) async fn send_raw_monitor_command(&self, command: &str) -> std::result::Result<String, String> {
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = &mut *connected_guard {
            protocol.send_locked(command).await.map_err(|e| format!("Command failed: {}", e))
        } else {
            Err("No device connected".to_string())
        }
    }

    /// Read monitor data (non-blocking) - reads directly from serial port
    pub(crate) async fn read_monitor_data(&self, timeout_ms: u64) -> std::result::Result<String, String> {
    let mut connected_guard = self.connected_device.lock().await;
        if let Some((_, protocol)) = &mut *connected_guard {
            let mut buffer = vec![0u8; 1024];
            let read_res = protocol.read_data_locked(&mut buffer, timeout_ms).await;
            match read_res {
                Ok(bytes_read) => {
                    if bytes_read > 0 {
                        buffer.truncate(bytes_read);
                        Ok(String::from_utf8_lossy(&buffer).to_string())
                    } else {
                        Ok(String::new())
                    }
                }
        Err(_e) => Ok(String::new()), // No data available
            }
        } else {
            Err("No device connected".to_string())
        }
    }

}

impl Default for DeviceManager {
    fn default() -> Self {
        Self::new()
    }
}
impl DeviceManager {
    /// Explicit asynchronous shutdown hook.
    ///
    /// This must be called before dropping the last `Arc<DeviceManager>`.
    /// It performs cleanup that previously occurred in `Drop` but required
    /// awaiting async tasks (stopping the port monitor). Performing that work
    /// inside `Drop` forced creation of a new Tokio runtime which could panic
    /// if `Drop` executed on an existing runtime worker thread ("Cannot start a runtime from within a runtime").
    ///
    /// Call this during application shutdown (e.g. in a Tauri on_exit handler).
    pub async fn shutdown(&self) {
        self.stop_port_monitor().await;
    }
}