use serde::{Deserialize, Serialize};
use super::{Result, SerialError, SerialInterface};

/// JoyCore configuration protocol implementation
/// Based on the Qt C++ implementation, this handles the text-based protocol
/// for communicating with RP2040-based HOTAS controllers
pub struct ConfigProtocol {
    interface: SerialInterface,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceStatus {
    pub firmware_version: String,
    pub device_name: String,
    pub axes_count: u8,
    pub buttons_count: u8,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AxisConfig {
    pub id: u8,
    pub name: String,
    pub min_value: i16,
    pub max_value: i16,
    pub center_value: i16,
    pub deadzone: u16,
    pub curve: String, // "linear", "curve1", "curve2", etc.
    pub inverted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ButtonConfig {
    pub id: u8,
    pub name: String,
    pub function: String, // "normal", "toggle", "macro", etc.
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileConfig {
    pub id: String,
    pub name: String,
    pub description: String,
    pub axes: Vec<AxisConfig>,
    pub buttons: Vec<ButtonConfig>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub modified_at: chrono::DateTime<chrono::Utc>,
}

impl ConfigProtocol {
    pub fn new(interface: SerialInterface) -> Self {
        Self { interface }
    }

    /// Initialize communication with the device
    pub async fn init(&mut self) -> Result<()> {
        if !self.interface.is_connected() {
            return Err(SerialError::ConnectionFailed("Device not connected".to_string()));
        }

        // Send initialization command
        match self.interface.send_command("INIT").await {
            Ok(response) => {
                if response.starts_with("OK") || response.is_empty() {
                    log::info!("Protocol initialized successfully");
                    Ok(())
                } else {
                    log::warn!("Unexpected init response: '{}', continuing anyway", response);
                    // Some devices might not implement INIT command but still work
                    Ok(())
                }
            }
            Err(SerialError::Timeout) => {
                log::warn!("Init command timed out, device might not support INIT - continuing anyway");
                // Device might not support INIT command, but serial connection works
                Ok(())
            }
            Err(e) => Err(e)
        }
    }

    /// Get device status and capabilities using actual JoyCore-FW protocol
    pub async fn get_device_status(&mut self) -> Result<DeviceStatus> {
        // Get firmware version from device info if available
        let firmware_version = self.interface.device_info()
            .and_then(|info| info.firmware_version.clone())
            .unwrap_or_else(|| "Unknown".to_string());

        // Get device name from device info
        let device_name = self.interface.device_info()
            .and_then(|info| info.product.clone())
            .unwrap_or_else(|| "JoyCore HOTAS Controller".to_string());

        // Use the actual STATUS command from the firmware
        let status_response = self.interface.send_command("STATUS").await?;
        
        log::debug!("Raw status response: {}", status_response);
        log::info!("Device status: firmware={}, device={}", firmware_version, device_name);
        
        // For now, create a basic status since we just need to verify connection
        // In the future, we could parse the actual status response format
        let status = DeviceStatus {
            firmware_version,
            device_name,
            axes_count: 8, // JoyCore supports up to 8 axes (X,Y,Z,RX,RY,RZ,S1,S2)
            buttons_count: 64, // JoyCore supports up to 64 logical inputs
            connected: true,
        };

        Ok(status)
    }

    /// Read current axis configuration
    pub async fn read_axis_config(&mut self, axis_id: u8) -> Result<AxisConfig> {
        let command = format!("AXIS_GET:{}", axis_id);
        let response = self.interface.send_command(&command).await?;
        
        // Parse axis configuration from response
        // Format: "AXIS:id,name,min,max,center,deadzone,curve,inverted"
        let config_str = response.strip_prefix("AXIS:")
            .ok_or_else(|| SerialError::ProtocolError("Invalid axis response".to_string()))?;
        
        let parts: Vec<&str> = config_str.split(',').collect();
        if parts.len() < 8 {
            return Err(SerialError::ProtocolError("Incomplete axis data".to_string()));
        }

        let config = AxisConfig {
            id: parts[0].parse().map_err(|_| SerialError::ProtocolError("Invalid axis ID".to_string()))?,
            name: parts[1].to_string(),
            min_value: parts[2].parse().map_err(|_| SerialError::ProtocolError("Invalid min value".to_string()))?,
            max_value: parts[3].parse().map_err(|_| SerialError::ProtocolError("Invalid max value".to_string()))?,
            center_value: parts[4].parse().map_err(|_| SerialError::ProtocolError("Invalid center value".to_string()))?,
            deadzone: parts[5].parse().map_err(|_| SerialError::ProtocolError("Invalid deadzone".to_string()))?,
            curve: parts[6].to_string(),
            inverted: parts[7].parse().map_err(|_| SerialError::ProtocolError("Invalid inverted flag".to_string()))?,
        };

        Ok(config)
    }

    /// Write axis configuration to device
    pub async fn write_axis_config(&mut self, config: &AxisConfig) -> Result<()> {
        let command = format!(
            "AXIS_SET:{},{},{},{},{},{},{},{}",
            config.id,
            config.name,
            config.min_value,
            config.max_value,
            config.center_value,
            config.deadzone,
            config.curve,
            config.inverted
        );
        
        let response = self.interface.send_command(&command).await?;
        
        if response.starts_with("OK") {
            Ok(())
        } else {
            Err(SerialError::ProtocolError(format!("Axis config write failed: {}", response)))
        }
    }

    /// Read button configuration
    pub async fn read_button_config(&mut self, button_id: u8) -> Result<ButtonConfig> {
        let command = format!("BUTTON_GET:{}", button_id);
        let response = self.interface.send_command(&command).await?;
        
        // Parse button configuration from response
        // Format: "BUTTON:id,name,function,enabled"
        let config_str = response.strip_prefix("BUTTON:")
            .ok_or_else(|| SerialError::ProtocolError("Invalid button response".to_string()))?;
        
        let parts: Vec<&str> = config_str.split(',').collect();
        if parts.len() < 4 {
            return Err(SerialError::ProtocolError("Incomplete button data".to_string()));
        }

        let config = ButtonConfig {
            id: parts[0].parse().map_err(|_| SerialError::ProtocolError("Invalid button ID".to_string()))?,
            name: parts[1].to_string(),
            function: parts[2].to_string(),
            enabled: parts[3].parse().map_err(|_| SerialError::ProtocolError("Invalid enabled flag".to_string()))?,
        };

        Ok(config)
    }

    /// Write button configuration to device
    pub async fn write_button_config(&mut self, config: &ButtonConfig) -> Result<()> {
        let command = format!(
            "BUTTON_SET:{},{},{},{}",
            config.id,
            config.name,
            config.function,
            config.enabled
        );
        
        let response = self.interface.send_command(&command).await?;
        
        if response.starts_with("OK") {
            Ok(())
        } else {
            Err(SerialError::ProtocolError(format!("Button config write failed: {}", response)))
        }
    }


    /// Load configuration from device flash
    pub async fn load_config(&mut self) -> Result<()> {
        let response = self.interface.send_command("LOAD").await?;
        
        if response.starts_with("OK") {
            log::info!("Configuration loaded from device");
            Ok(())
        } else {
            Err(SerialError::ProtocolError(format!("Load failed: {}", response)))
        }
    }

    /// Reset device to factory defaults using actual JoyCore-FW command
    pub async fn factory_reset(&mut self) -> Result<()> {
        let _response = self.interface.send_command("FORCE_DEFAULT_CONFIG").await?;
        log::warn!("Device reset to factory defaults");
        Ok(())
    }

    /// Get storage information from the device
    pub async fn get_storage_info(&mut self) -> Result<String> {
        let response = self.interface.send_command("STORAGE_INFO").await?;
        Ok(response)
    }

    /// List files available on the device
    pub async fn list_files(&mut self) -> Result<Vec<String>> {
        let response = self.interface.send_command("LIST_FILES").await?;
        let files: Vec<String> = response
            .lines()
            .filter(|line| line.starts_with('/'))
            .map(|line| line.to_string())
            .collect();
        Ok(files)
    }

    /// Read a file from the device storage
    pub async fn read_file(&mut self, filename: &str) -> Result<Vec<u8>> {
        let command = format!("READ_FILE {}", filename);
        let response = self.interface.send_command(&command).await?;
        
        if response.starts_with("ERROR:") {
            return Err(SerialError::ProtocolError(response));
        }
        
        // Parse FILE_DATA response
        // Format: FILE_DATA:<filename>:<bytes_read>:<hex_data>
        if let Some(data_part) = response.strip_prefix("FILE_DATA:") {
            let parts: Vec<&str> = data_part.split(':').collect();
            if parts.len() >= 3 {
                let hex_data = parts[2];
                // Convert hex string to bytes
                let mut bytes = Vec::new();
                for chunk in hex_data.chars().collect::<Vec<_>>().chunks(2) {
                    if chunk.len() == 2 {
                        let hex_byte = format!("{}{}", chunk[0], chunk[1]);
                        if let Ok(byte) = u8::from_str_radix(&hex_byte, 16) {
                            bytes.push(byte);
                        }
                    }
                }
                return Ok(bytes);
            }
        }
        
        Err(SerialError::ProtocolError("Invalid file data response".to_string()))
    }

    /// Save current configuration to device storage
    pub async fn save_config(&mut self) -> Result<()> {
        let _response = self.interface.send_command("SAVE_CONFIG").await?;
        log::info!("Configuration saved to device");
        Ok(())
    }

    /// Get reference to the serial interface
    pub fn interface(&self) -> &SerialInterface {
        &self.interface
    }

    /// Get mutable reference to the serial interface
    pub fn interface_mut(&mut self) -> &mut SerialInterface {
        &mut self.interface
    }
}