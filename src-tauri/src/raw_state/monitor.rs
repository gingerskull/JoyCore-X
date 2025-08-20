use crate::raw_state::types::*;
use crate::raw_state::parser::*;
use crate::raw_state::reader::RawStateReader;
use crate::serial::protocol::ConfigProtocol;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::{interval, Duration};
use tauri::Manager;

/// Raw state monitoring manager
pub struct RawStateMonitor {
    /// Currently monitored devices
    monitored_devices: Arc<Mutex<HashMap<String, MonitoringSession>>>,
}

/// Monitoring session for a single device
struct MonitoringSession {
    /// Task handle for the monitoring loop
    task_handle: tokio::task::JoinHandle<()>,
    /// Flag to stop monitoring
    stop_flag: Arc<Mutex<bool>>,
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
        // Check if already monitoring
        {
            let monitored = self.monitored_devices.lock().await;
            if monitored.contains_key(&device_id) {
                return Err("Device already being monitored".to_string());
            }
        }

        // Create stop flag
        let stop_flag = Arc::new(Mutex::new(false));
        let stop_flag_clone = stop_flag.clone();

        // Spawn monitoring task
        let device_id_clone = device_id.clone();
        let app_handle_clone = app_handle.clone();

        let task_handle = tokio::spawn(async move {
            Self::monitoring_loop_with_manager(
                device_id_clone, 
                app_handle_clone, 
                device_manager,
                stop_flag_clone
            ).await;
        });

        // Store monitoring session
        let session = MonitoringSession {
            task_handle,
            stop_flag,
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
            // Set stop flag
            {
                let mut stop_flag = session.stop_flag.lock().await;
                *stop_flag = true;
            }

            // Cancel monitoring task
            session.task_handle.abort();

            Ok(())
        } else {
            Err("Device not being monitored".to_string())
        }
    }

    /// Monitoring loop using DeviceManager's protocol
    async fn monitoring_loop_with_manager(
        device_id: String,
        app_handle: tauri::AppHandle,
        device_manager: Arc<crate::device::DeviceManager>,
        stop_flag: Arc<Mutex<bool>>,
    ) {
        let mut interval = interval(Duration::from_millis(crate::raw_state::RAW_STATE_POLLING_MS));

        loop {
            // Check stop flag
            {
                let should_stop = *stop_flag.lock().await;
                if should_stop {
                    break;
                }
            }

            // Wait for next interval
            interval.tick().await;

            // Try to read raw states through the device manager
            match Self::read_raw_states_from_manager(&device_manager).await {
                Ok(hardware_state) => {
                    // Emit events for each type of state change
                    if let Some(gpio_states) = &hardware_state.gpio {
                        app_handle.emit_all(
                            &format!("raw-gpio-changed-{}", device_id),
                            gpio_states,
                        ).ok();
                    }

                    if let Some(matrix_state) = &hardware_state.matrix {
                        app_handle.emit_all(
                            &format!("raw-matrix-changed-{}", device_id),
                            matrix_state,
                        ).ok();
                    }

                    if !hardware_state.shift_registers.is_empty() {
                        app_handle.emit_all(
                            &format!("raw-shift-changed-{}", device_id),
                            &hardware_state.shift_registers,
                        ).ok();
                    }

                    // Emit complete state update
                    app_handle.emit_all(
                        &format!("raw-state-update-{}", device_id),
                        &hardware_state,
                    ).ok();
                }
                Err(e) => {
                    if crate::raw_state::ENABLE_DEBUG_LOGGING {
                        eprintln!("Raw state monitoring error for {}: {}", device_id, e);
                    }
                    // On error, wait a bit longer before retrying
                    tokio::time::sleep(Duration::from_millis(500)).await;
                }
            }
        }

        if crate::raw_state::ENABLE_DEBUG_LOGGING {
            println!("Raw state monitoring stopped for device: {}", device_id);
        }
    }

    /// Read raw states from the device manager's connected protocol
    async fn read_raw_states_from_manager(
        device_manager: &Arc<crate::device::DeviceManager>,
    ) -> Result<RawHardwareState, String> {
        // Access the connected device's protocol
        let connected_protocol = device_manager.get_connected_protocol().await
            .ok_or("No device connected")?;

        // We need a way to get a mutable reference to the protocol
        // This is a simplified approach - in practice we might need to restructure
        // the DeviceManager to support this use case
        RawStateReader::read_all_states(&mut *connected_protocol.lock().await).await
    }
}

/// Global monitor instance
static MONITOR: once_cell::sync::Lazy<RawStateMonitor> = 
    once_cell::sync::Lazy::new(|| RawStateMonitor::new());

/// Get the global monitor instance
pub fn get_monitor() -> &'static RawStateMonitor {
    &MONITOR
}