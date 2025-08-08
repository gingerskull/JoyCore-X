use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

use crate::serial::{SerialInterface, ConfigProtocol};
use super::{Device, ConnectionState, ProfileManager, DeviceError, Result};

/// Central device management system
/// Handles device discovery, connection management, and configuration
pub struct DeviceManager {
    devices: Arc<RwLock<HashMap<Uuid, Device>>>,
    connected_device: Arc<Mutex<Option<(Uuid, ConfigProtocol)>>>,
    profile_manager: Arc<Mutex<ProfileManager>>,
}

impl DeviceManager {
    pub fn new() -> Self {
        Self {
            devices: Arc::new(RwLock::new(HashMap::new())),
            connected_device: Arc::new(Mutex::new(None)),
            profile_manager: Arc::new(Mutex::new(ProfileManager::new())),
        }
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
                // Update existing device info
                let existing = devices_guard.get(&existing_id).unwrap().clone();
                let mut updated_device = existing;
                updated_device.serial_number = serial_info.serial_number;
                updated_device.manufacturer = serial_info.manufacturer;
                updated_device.product = serial_info.product;
                updated_device.last_seen = chrono::Utc::now();
                
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

        // Attempt connection
        let mut serial_interface = SerialInterface::new();
        match serial_interface.connect(&device.port_name) {
            Ok(()) => {
                // Create protocol handler
                let mut protocol = ConfigProtocol::new(serial_interface);
                
                // Initialize protocol
                match protocol.init().await {
                    Ok(()) => {
                        // Get device status
                        match protocol.get_device_status().await {
                            Ok(status) => {
                                // Update device with status info
                                self.update_device_status(device_id, status).await;
                                self.update_device_connection_state(device_id, ConnectionState::Connected).await;
                                
                                // Store connected device
                                {
                                    let mut connected_guard = self.connected_device.lock().await;
                                    *connected_guard = Some((*device_id, protocol));
                                }
                                
                                log::info!("Successfully connected to device: {}", device.port_name);
                                Ok(())
                            }
                            Err(e) => {
                                let error_msg = format!("Failed to get device status: {}", e);
                                self.update_device_connection_state(device_id, ConnectionState::Error(error_msg.clone())).await;
                                Err(DeviceError::SerialError(e))
                            }
                        }
                    }
                    Err(e) => {
                        let error_msg = format!("Protocol initialization failed: {}", e);
                        self.update_device_connection_state(device_id, ConnectionState::Error(error_msg)).await;
                        Err(DeviceError::SerialError(e))
                    }
                }
            }
            Err(e) => {
                let error_msg = format!("Connection failed: {}", e);
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
}

impl Default for DeviceManager {
    fn default() -> Self {
        Self::new()
    }
}