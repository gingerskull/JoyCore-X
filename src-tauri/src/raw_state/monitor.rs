use crate::raw_state::types::*;
use crate::raw_state::parser::*;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::{Mutex, mpsc};
use tokio::time::{Duration, timeout};
use tauri::Emitter;

/// Raw state monitoring manager
pub struct RawStateMonitor {
    /// Currently monitored devices
    monitored_devices: Arc<Mutex<HashMap<String, MonitoringSession>>>,
}

/// Monitoring session for a single device
struct MonitoringSession {
    /// Task handle for the monitoring loop
    task_handle: tokio::task::JoinHandle<()>,
    /// Channel to signal stop
    stop_tx: mpsc::Sender<()>,
}

impl RawStateMonitor {
    pub fn new() -> Self {
        Self {
            monitored_devices: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Start monitoring using the DeviceManager's connected protocol
    pub async fn start_monitoring_with_protocol(
        &self,
        device_id: String,
        app_handle: tauri::AppHandle,
        device_manager: Arc<crate::device::DeviceManager>,
    ) -> Result<(), String> {
        // Check if already monitoring (defensive safeguard)
        {
            let monitored = self.monitored_devices.lock().await;
            if monitored.contains_key(&device_id) {
                log::warn!("Attempted to start monitoring for device {} that is already being monitored", device_id);
                return Err("Device already being monitored".to_string());
            }
        }

        // Create stop channel
        let (stop_tx, stop_rx) = mpsc::channel(1);

        // Spawn monitoring task
        let device_id_clone = device_id.clone();
        let app_handle_clone = app_handle.clone();

        let task_handle = tokio::spawn(async move {
            Self::monitoring_loop_continuous(
                device_id_clone, 
                app_handle_clone, 
                device_manager,
                stop_rx
            ).await;
        });

        // Store monitoring session
        let session = MonitoringSession {
            task_handle,
            stop_tx,
        };

        let mut monitored = self.monitored_devices.lock().await;
        monitored.insert(device_id, session);

        Ok(())
    }

    /// Stop monitoring a device
    pub async fn stop_monitoring(&self, device_id: &str) -> Result<(), String> {
        let session = {
            let mut monitored = self.monitored_devices.lock().await;
            monitored.remove(device_id)
        };

        if let Some(session) = session {
            // Send stop signal
            let _ = session.stop_tx.send(()).await;

            // Wait for task to complete gracefully (with timeout)
            let _ = timeout(Duration::from_secs(2), session.task_handle).await;

            Ok(())
        } else {
            Err("Device not being monitored".to_string())
        }
    }

    /// Continuous monitoring loop using firmware's streaming mode
    async fn monitoring_loop_continuous(
        device_id: String,
        app_handle: tauri::AppHandle,
        device_manager: Arc<crate::device::DeviceManager>,
        mut stop_rx: mpsc::Receiver<()>,
    ) {
        let start_time = Instant::now();
        log::info!("Starting continuous raw state monitoring for device: {}", device_id);

        // Get access to the device's protocol
        let protocol_result = device_manager.get_connected_protocol_for_monitoring().await;
        if protocol_result.is_err() {
            log::error!("Failed to get device protocol for monitoring");
            return;
        }

        // Start continuous monitoring only (no polling fallback)
        let use_continuous_mode = match Self::start_continuous_stream(&device_manager).await {
            Ok(()) => {
                log::info!("Successfully started continuous monitoring stream");
                true
            }
            Err(e) => {
                log::error!("Continuous monitoring failed: {}", e);
                return; // Exit if continuous monitoring fails - no fallback
            }
        };

        log::info!("Starting continuous monitoring mode only (no polling fallback)");

        // No throttling - emit all events immediately for real-time responsiveness

        // Buffer for accumulating partial lines
        let mut line_buffer = String::new();
        
        // Performance tracking
        let mut lines_processed = 0u64;
        let mut last_perf_report = Instant::now();
        let mut gpio_lines = 0u64;
        let mut matrix_lines = 0u64;
        let mut shift_lines = 0u64;
        let mut unknown_lines = 0u64;
    let _last_gpio_time = Instant::now();
        
        // Log monitoring mode for validation
        log::info!("Raw state monitoring mode: {}", if use_continuous_mode { "Continuous" } else { "Optimized Polling" });
        
        loop {
            tokio::select! {
                // Check for stop signal
                _ = stop_rx.recv() => {
                    log::info!("Received stop signal for monitoring");
                    break;
                }
                
                // Handle continuous monitoring only
                state_result = async {
                    // Continuous mode: read from stream
                    match Self::read_next_monitor_line(&device_manager, &mut line_buffer).await {
                        Ok(Some(line)) => Ok(vec![line]),
                        Ok(None) => Ok(vec![]),
                        Err(e) => Err(e),
                    }
                } => {
                    match state_result {
                        Ok(lines) => {
                            let _lines_count = lines.len();
                            // Process all received lines
                            for line in lines {
                                // Track line types for metrics
                                if line.starts_with("GPIO_STATES:") {
                                    gpio_lines += 1;
                                    if crate::raw_state::ENABLE_DEBUG_LOGGING {
                                        log::info!("GPIO line received: {}", line);
                                    }
                                } else if line.starts_with("MATRIX_STATE:") {
                                    matrix_lines += 1;
                                } else if line.starts_with("SHIFT_REG:") {
                                    shift_lines += 1;
                                } else {
                                    unknown_lines += 1;
                                    if crate::raw_state::ENABLE_DEBUG_LOGGING {
                                        log::debug!("Unknown monitor line type: {}", line);
                                    }
                                }
                                
                                // Process the line
                                Self::process_monitor_line(
                                    &line,
                                    &app_handle
                                );
                                
                                lines_processed += 1;
                            }
                            
                            // Performance reporting (after processing all lines)
                            if crate::raw_state::ENABLE_PERFORMANCE_METRICS && last_perf_report.elapsed().as_secs() >= 10 {
                                let elapsed = last_perf_report.elapsed();
                                let rate = lines_processed as f64 / elapsed.as_secs_f64();
                                log::info!("Raw state monitoring performance: {:.1} lines/sec ({} lines in {:?}) - GPIO: {}, Matrix: {}, Shift: {}, Unknown: {}", 
                                    rate, lines_processed, elapsed, gpio_lines, matrix_lines, shift_lines, unknown_lines);
                                
                                // Reset counters
                                lines_processed = 0;
                                gpio_lines = 0;
                                matrix_lines = 0;
                                shift_lines = 0;
                                unknown_lines = 0;
                                last_perf_report = Instant::now();
                            }
                            
                            // Continuous mode - no artificial delays needed
                        }
                        Err(e) => {
                            log::warn!("Error reading monitor stream: {}", e);
                            // Small delay before retrying
                            tokio::time::sleep(Duration::from_millis(10)).await;
                        }
                    }
                }
            }
        }

        // Stop continuous monitoring before returning
        let _ = Self::stop_continuous_stream(&device_manager).await;
        
        let elapsed = start_time.elapsed();
        if crate::raw_state::ENABLE_PERFORMANCE_METRICS {
            let total_lines = gpio_lines + matrix_lines + shift_lines + unknown_lines;
            let avg_rate = if elapsed.as_secs_f64() > 0.0 { total_lines as f64 / elapsed.as_secs_f64() } else { 0.0 };
            log::info!("Stopped raw state monitoring for device: {} (ran for {:?}, {} total lines, {:.1} avg lines/sec)", 
                device_id, elapsed, total_lines, avg_rate);
            log::info!("Final line breakdown - GPIO: {}, Matrix: {}, Shift: {}, Unknown: {}", 
                gpio_lines, matrix_lines, shift_lines, unknown_lines);
        } else {
            log::info!("Stopped raw state monitoring for device: {} (ran for {:?})", device_id, elapsed);
        }
    }

    /// Start continuous monitoring stream with firmware capability detection
    async fn start_continuous_stream(device_manager: &Arc<crate::device::DeviceManager>) -> Result<(), String> {
        log::info!("Starting firmware continuous monitoring");
        
        // Send START_RAW_MONITOR command
        match device_manager.send_raw_monitor_command("START_RAW_MONITOR").await {
            Ok(response) => {
                log::debug!("START_RAW_MONITOR response: {}", response);
                
                // Check for expected response patterns
                if response.contains("OK:RAW_MONITOR_STARTED") || response.contains("RAW_MONITOR") {
                    log::info!("Firmware confirmed continuous monitoring started");
                    Ok(())
                } else {
                    log::warn!("Unexpected response to START_RAW_MONITOR: {}", response);
                    Err(format!("Firmware may not support continuous monitoring: {}", response))
                }
            }
            Err(e) => {
                log::error!("Failed to start continuous monitoring: {}", e);
                Err(format!("START_RAW_MONITOR command failed: {}", e))
            }
        }
    }

    /// Stop continuous monitoring stream
    async fn stop_continuous_stream(device_manager: &Arc<crate::device::DeviceManager>) -> Result<(), String> {
        log::info!("Stopping firmware continuous monitoring");
        
        // Send stop command
        match device_manager.send_raw_monitor_command("STOP_RAW_MONITOR").await {
            Ok(response) => {
                log::debug!("STOP_RAW_MONITOR response: {}", response);
            }
            Err(e) => {
                log::warn!("Failed to send STOP_RAW_MONITOR: {}", e);
            }
        }

        // Give firmware time to stop before cleaning up
        tokio::time::sleep(Duration::from_millis(50)).await;
        
        // TODO: Drain any residual monitor lines from the channel
        log::info!("Continuous monitoring stop sequence completed");
        Ok(())
    }

    /// Read next line from monitoring stream
    async fn read_next_monitor_line(
        device_manager: &Arc<crate::device::DeviceManager>,
        buffer: &mut String,
    ) -> Result<Option<String>, String> {
        // 1. If we already have a complete line in the buffer, return it immediately (no new read)
        if let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].to_string();
            buffer.drain(..=newline_pos);
            return Ok(Some(line));
        }

        // 2. Otherwise read more data (short timeout) and then attempt to extract a line
        let data = device_manager.read_monitor_data(20).await?; // shorter timeout to reduce latency
        if !data.is_empty() {
            buffer.push_str(&data);
            // Drain as many blank leading newlines / returns as possible
            loop {
                if let Some(newline_pos) = buffer.find('\n') {
                    // Extract first line (could be empty if leading newline)
                    let line = buffer[..newline_pos].to_string();
                    buffer.drain(..=newline_pos);
                    if line.trim().is_empty() {
                        // Skip empty line and continue scanning
                        continue;
                    }
                    return Ok(Some(line));
                } else {
                    break;
                }
            }
        }

        Ok(None)
    }


    /// Process a line from the monitoring stream
    fn process_monitor_line(
        line: &str,
        app_handle: &tauri::AppHandle,
    ) {
        let line = line.trim();
        let parse_start = if crate::raw_state::ENABLE_PERFORMANCE_METRICS { Some(Instant::now()) } else { None };
        
        if line.starts_with("GPIO_STATES:") {
            if let Some(gpio_states) = parse_gpio_response(line) {
                // Debug the actual GPIO values
                if crate::raw_state::ENABLE_DEBUG_LOGGING {
                    log::info!("GPIO state parsed - mask: 0x{:08X} ({:032b})", gpio_states.gpio_mask, gpio_states.gpio_mask);
                }
                // Always print to stdout for high-precision latency tracing (bypasses log buffering)
                // Format: RAW_GPIO_EMIT <unix_nanos> <mask_hex>
                if crate::raw_state::ENABLE_DEBUG_LOGGING {
                    use std::sync::atomic::{AtomicU32, Ordering};
                    static LAST_MASK: AtomicU32 = AtomicU32::new(0xFFFFFFFF);
                    let prev = LAST_MASK.load(Ordering::Relaxed);
                    if prev != 0xFFFFFFFF && prev != gpio_states.gpio_mask {
                        let changed = prev ^ gpio_states.gpio_mask;
                        let mut set_bits = Vec::new();
                        let mut cleared_bits = Vec::new();
                        for bit in 0..32 { let bit_mask = 1u32 << bit; if (changed & bit_mask)!=0 { if (gpio_states.gpio_mask & bit_mask)!=0 { set_bits.push(bit);} else { cleared_bits.push(bit);} } }
                        log::debug!("GPIO change mask=0x{:08X} set={:?} cleared={:?}", gpio_states.gpio_mask, set_bits, cleared_bits);
                    }
                    LAST_MASK.store(gpio_states.gpio_mask, Ordering::Relaxed);
                }
                
                // Calculate latency from firmware timestamp
                if crate::raw_state::ENABLE_PERFORMANCE_METRICS {
                    let firmware_time_us = gpio_states.timestamp;
                    log::debug!("GPIO state received - firmware timestamp: {}µs", firmware_time_us);
                }
                
                // Emit immediately without throttling
                if let Err(e) = app_handle.emit("raw-gpio-changed", &gpio_states) {
                    log::warn!("Failed to emit GPIO state: {}", e);
                }
            }
        } else if line.starts_with("MATRIX_STATE:") {
            // Parse single matrix line
            if let Some((row, col, state, timestamp)) = parse_single_matrix_line(line) {
                let connection = MatrixConnection { row, col, is_connected: state };
                
                if crate::raw_state::ENABLE_PERFORMANCE_METRICS {
                    log::debug!("Matrix state received - R{}C{}: {} @ {}µs", row, col, state, timestamp);
                }
                if crate::raw_state::ENABLE_DEBUG_LOGGING {
                    use std::sync::{OnceLock, Mutex};
                    static LAST_MATRIX: OnceLock<Mutex<std::collections::HashMap<(u8,u8), bool>>> = OnceLock::new();
                    let map = LAST_MATRIX.get_or_init(|| Mutex::new(std::collections::HashMap::new()));
                    let mut guard = map.lock().unwrap();
                    let key = (row,col);
                    if let Some(prev) = guard.get(&key) { if *prev != state { log::debug!("Matrix change R{}C{} -> {}", row, col, state); } } else { log::debug!("Matrix baseline R{}C{} = {}", row, col, state); }
                    guard.insert(key, state);
                }
                
                // Emit as a single connection update immediately
                let matrix_update = MatrixState {
                    connections: vec![connection],
                    timestamp,
                };
                
                if let Err(e) = app_handle.emit("raw-matrix-changed", &matrix_update) {
                    log::warn!("Failed to emit matrix state: {}", e);
                }
            }
        } else if line.starts_with("SHIFT_REG:") {
            if let Some((register_id, value, timestamp)) = parse_single_shift_line(line) {
                let shift_state = ShiftRegisterState { register_id, value, timestamp };
                
                if crate::raw_state::ENABLE_PERFORMANCE_METRICS {
                    log::debug!("Shift register state received - Reg{}: 0x{:02X} @ {}µs", register_id, value, timestamp);
                }
                if crate::raw_state::ENABLE_DEBUG_LOGGING {
                    use std::sync::{OnceLock, Mutex};
                    static LAST_SHIFT: OnceLock<Mutex<std::collections::HashMap<u8,u8>>> = OnceLock::new();
                    let map = LAST_SHIFT.get_or_init(|| Mutex::new(std::collections::HashMap::new()));
                    let mut guard = map.lock().unwrap();
                    if let Some(prev) = guard.get(&register_id) { if *prev != value { log::debug!("Shift reg change R{} 0x{:02X} -> 0x{:02X}", register_id, prev, value); } } else { log::debug!("Shift reg baseline R{} = 0x{:02X}", register_id, value); }
                    guard.insert(register_id, value);
                }
                
                // Emit as array for consistency immediately
                if let Err(e) = app_handle.emit("raw-shift-changed", &vec![shift_state]) {
                    log::warn!("Failed to emit shift register state: {}", e);
                }
            }
        }
        
        if let Some(start) = parse_start {
            if crate::raw_state::ENABLE_PERFORMANCE_METRICS {
                let parse_time = start.elapsed();
                if parse_time.as_micros() > 100 {
                    log::debug!("Line parsing took: {:?} for: {}", parse_time, line);
                }
            }
        }
    }
}

/// Parse a single matrix line for continuous monitoring
fn parse_single_matrix_line(line: &str) -> Option<(u8, u8, bool, u64)> {
    // Format: MATRIX_STATE:row:col:state:timestamp
    let parts: Vec<&str> = line.split(':').collect();
    if parts.len() >= 5 && parts[0] == "MATRIX_STATE" {
        let row = parts[1].parse().ok()?;
        let col = parts[2].parse().ok()?;
        let state = parts[3] == "1";
        let timestamp = parts[4].parse().ok()?;
        Some((row, col, state, timestamp))
    } else {
        None
    }
}

/// Parse a single shift register line for continuous monitoring
fn parse_single_shift_line(line: &str) -> Option<(u8, u8, u64)> {
    // Format: SHIFT_REG:reg_id:0xHH:timestamp
    let parts: Vec<&str> = line.split(':').collect();
    if parts.len() >= 4 && parts[0] == "SHIFT_REG" {
        let register_id = parts[1].parse().ok()?;
        let value_str = parts[2].strip_prefix("0x")?;
        let value = u8::from_str_radix(value_str, 16).ok()?;
        let timestamp = parts[3].parse().ok()?;
        Some((register_id, value, timestamp))
    } else {
        None
    }
}

/// Global monitor instance
static MONITOR: once_cell::sync::Lazy<RawStateMonitor> = 
    once_cell::sync::Lazy::new(|| RawStateMonitor::new());

/// Get the global monitor instance
pub fn get_monitor() -> &'static RawStateMonitor {
    &MONITOR
}