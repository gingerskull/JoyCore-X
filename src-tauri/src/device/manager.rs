use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;
use semver::Version;
use tauri::AppHandle;

use crate::serial::{SerialInterface, ConfigProtocol, StorageInfo};
use crate::update::{UpdateService, VersionCheckResult};
use crate::config::BinaryConfig;
use crate::hid::{HidReader, ButtonStates};
use super::{Device, ConnectionState, ProfileManager, DeviceError, Result, FirmwareUpdateSettings};

/// Central device management system
/// Handles device discovery, connection management, and configuration
pub struct DeviceManager {
    devices: Arc<RwLock<HashMap<Uuid, Device>>>,
    connected_device: Arc<Mutex<Option<(Uuid, ConfigProtocol)>>>,
    profile_manager: Arc<Mutex<ProfileManager>>,
    hid_reader: Arc<Mutex<HidReader>>,
}

impl DeviceManager {
    pub fn new() -> Self {
        // Try to initialize HID reader, log error if it fails
        let hid_reader = HidReader::new().unwrap_or_else(|e| {
            log::warn!("Failed to initialize HID reader: {}. Button state reading will not be available.", e);
            // Return a reader that will work but won't be able to connect
            HidReader::new().expect("Second HID initialization attempt failed")
        });
        
        Self {
            devices: Arc::new(RwLock::new(HashMap::new())),
            connected_device: Arc::new(Mutex::new(None)),
            profile_manager: Arc::new(Mutex::new(ProfileManager::new())),
            hid_reader: Arc::new(Mutex::new(hid_reader)),
        }
    }
    
    /// Set the Tauri app handle for event emission
    pub async fn set_app_handle(&self, handle: AppHandle) {
        let hid_reader = self.hid_reader.lock().await;
        hid_reader.set_app_handle(handle);
    }

    /// Discover available JoyCore devices
    pub async fn discover_devices(&self) -> Result<Vec<Device>> {
        let serial_devices = SerialInterface::discover_devices()
            .map_err(DeviceError::SerialError)?;

        let mut devices_guard = self.devices.write().await;
        let mut discovered_devices = Vec::new();

        for serial_info in serial_devices {
            // Create or update device entry
            let device = Device::from_serial_info(&serial_info);
            let device_id = device.id;
            
            // Check if we already know about this device (by port name)
            let existing_device_id = devices_guard.values()
                .find(|d| d.port_name == serial_info.port_name)
                .map(|d| d.id);
            
            if let Some(existing_id) = existing_device_id {
                // Update existing device info but preserve current connection state
                let existing = devices_guard.get(&existing_id).unwrap().clone();
                let mut updated_device = existing;
                updated_device.serial_number = serial_info.serial_number;
                updated_device.manufacturer = serial_info.manufacturer;
                updated_device.product = serial_info.product;
                updated_device.last_seen = chrono::Utc::now();
                // Update device status with firmware version if we have it
                if let Some(ref fw_version) = serial_info.firmware_version {
                    if let Some(ref mut status) = updated_device.device_status {
                        status.firmware_version = fw_version.clone();
                    }
                }
                // Keep existing connection state - don't reset to Disconnected
                
                devices_guard.insert(existing_id, updated_device.clone());
                discovered_devices.push(updated_device);
            } else {
                // Add new device
                devices_guard.insert(device_id, device.clone());
                discovered_devices.push(device);
            }
        }

        Ok(discovered_devices)
    }

    /// Clean up devices that are no longer present (separate from discovery)
    pub async fn cleanup_disconnected_devices(&self) -> Result<Vec<Uuid>> {
        let serial_devices = SerialInterface::discover_devices()
            .map_err(DeviceError::SerialError)?;

        let mut devices_guard = self.devices.write().await;
        
        // Get list of currently found port names
        let found_ports: std::collections::HashSet<String> = serial_devices.iter()
            .map(|info| info.port_name.clone())
            .collect();

        // Remove devices that are no longer present
        let mut devices_to_remove = Vec::new();
        let connected_device_id = {
            let connected_guard = self.connected_device.lock().await;
            connected_guard.as_ref().map(|(id, _)| *id)
        };
        
        for (device_id, device) in devices_guard.iter() {
            if !found_ports.contains(&device.port_name) {
                match device.connection_state {
                    // For connected devices, verify the connection is still active
                    ConnectionState::Connected => {
                        if let Some(connected_id) = connected_device_id {
                            if connected_id == *device_id {
                                // Try to verify if the connection is still active by checking the protocol
                                let mut should_disconnect = false;
                                {
                                    let mut connected_guard = self.connected_device.lock().await;
                                    if let Some((_, protocol)) = &mut *connected_guard {
                                        // Try a simple status read to verify connection is still alive
                                        if let Err(_) = protocol.get_device_status().await {
                                            log::info!("Connected device {} failed status check - was physically disconnected", device.port_name);
                                            should_disconnect = true;
                                        }
                                    } else {
                                        should_disconnect = true;
                                    }
                                }
                                
                                if should_disconnect {
                                    log::info!("Connected device {} was physically disconnected", device.port_name);
                                    // Clear the connected device immediately
                                    let mut connected_guard = self.connected_device.lock().await;
                                    *connected_guard = None;
                                    // Mark device for removal
                                    devices_to_remove.push(*device_id);
                                    continue;
                                } else {
                                    log::debug!("Connected device {} not found in discovery but status check successful, keeping it", device.port_name);
                                    continue;
                                }
                            }
                        }
                        // If we get here, connected device is not the active one, remove it
                        devices_to_remove.push(*device_id);
                        log::info!("Marking connected device {} for removal (was physically disconnected)", device.port_name);
                    },
                    // Don't remove device if it's currently connecting (might be temporarily unavailable)
                    ConnectionState::Connecting => {
                        log::debug!("Device {} not found during cleanup but is connecting, keeping it", device.port_name);
                        continue;
                    },
                    // Remove disconnected devices that are no longer present
                    ConnectionState::Disconnected => {
                        devices_to_remove.push(*device_id);
                        log::info!("Marking disconnected device {} for removal (was physically disconnected)", device.port_name);
                    },
                    // Remove error state devices that are no longer present
                    ConnectionState::Error(_) => {
                        devices_to_remove.push(*device_id);
                        log::info!("Marking error state device {} for removal (was physically disconnected)", device.port_name);
                    },
                }
            }
        }
        
        // Remove disconnected devices
        for device_id in devices_to_remove.clone() {
            devices_guard.remove(&device_id);
            log::info!("Removed disconnected device: {:?}", device_id);
        }

        Ok(devices_to_remove)
    }

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
                let mut protocol = ConfigProtocol::new(serial_interface);
                
                // Initialize protocol
                match protocol.init().await {
                    Ok(()) => {
                        log::info!("Protocol initialization successful, getting device status");
                        // Get device status
                        match protocol.get_device_status().await {
                            Ok(status) => {
                                log::info!("Device status retrieved successfully: {:?}", status);
                                // Update device with status info
                                self.update_device_status(device_id, status).await;
                                self.update_device_connection_state(device_id, ConnectionState::Connected).await;
                                
                                // Store connected device
                                {
                                    let mut connected_guard = self.connected_device.lock().await;
                                    *connected_guard = Some((*device_id, protocol));
                                }
                                
                                // Try to connect HID device for button state reading
                                let _ = self.connect_hid().await;
                                
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
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((device_id, mut protocol)) = connected_guard.take() {
            // Disconnect the serial interface
            protocol.interface_mut().disconnect();
            
            // Disconnect HID device
            let _ = self.disconnect_hid().await;
            
            // Update device state
            self.update_device_connection_state(&device_id, ConnectionState::Disconnected).await;
            
            log::info!("Disconnected from device");
            Ok(())
        } else {
            Err(DeviceError::NotConnected)
        }
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
        let mut devices_guard = self.devices.write().await;
        if let Some(device) = devices_guard.get_mut(device_id) {
            device.update_connection_state(state);
        }
    }

    /// Helper method to update device status
    async fn update_device_status(&self, device_id: &Uuid, status: crate::serial::protocol::DeviceStatus) {
        let mut devices_guard = self.devices.write().await;
        if let Some(device) = devices_guard.get_mut(device_id) {
            device.update_device_status(status);
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
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            let data = protocol.read_file("/config.bin").await
                .map_err(DeviceError::SerialError)?;
            Ok(data)
        } else {
            Err(DeviceError::NotConnected)
        }
    }

    /// Write raw binary configuration to device
    pub async fn write_config_binary(&self, data: &[u8]) -> Result<()> {
        // First validate the binary data
        let config = BinaryConfig::from_bytes(data)
            .map_err(|e| DeviceError::ProtocolError(format!("Invalid config data: {}", e)))?;
        
        // Serialize back to ensure it's valid
        let validated_data = config.to_bytes()
            .map_err(|e| DeviceError::ProtocolError(format!("Failed to serialize config: {}", e)))?;
        
        let mut connected_guard = self.connected_device.lock().await;
        
        if let Some((_, protocol)) = connected_guard.as_mut() {
            // The firmware automatically creates a backup before writing
            protocol.write_raw_file("/config.bin", &validated_data).await
                .map_err(DeviceError::SerialError)?;
            log::info!("Successfully wrote binary configuration to device");
            Ok(())
        } else {
            Err(DeviceError::NotConnected)
        }
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
        let hid_reader = self.hid_reader.lock().await;
        hid_reader.debug_hid_mapping().await
    }

    /// Debug helper: get last full HID report (len, hex)
    pub async fn hid_full_report(&self) -> Option<(usize, String)> {
        let hid_reader = self.hid_reader.lock().await;
        hid_reader.debug_full_report().await
    }

    /// Detailed HID mapping info if supported by firmware
    pub async fn hid_mapping_details(&self) -> Option<serde_json::Value> {
        let hid_reader = self.hid_reader.lock().await;
        hid_reader.mapping_details().await
    }

    /// Diagnostic: raw vs logical button bits (first 16) for offset debugging
    pub async fn hid_button_bit_diagnostics(&self) -> Option<serde_json::Value> {
        let hid_reader = self.hid_reader.lock().await;
        hid_reader.debug_button_bit_diagnostics().await
    }
    
    /// Connect HID device (called automatically when connecting via serial)
    async fn connect_hid(&self) -> Result<()> {
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
    async fn disconnect_hid(&self) -> Result<()> {
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
}

impl Default for DeviceManager {
    fn default() -> Self {
        Self::new()
    }
}