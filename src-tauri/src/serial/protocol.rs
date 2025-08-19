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

        log::info!("Protocol initialized successfully");
        Ok(())
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
        // log::info!("Device status: firmware={}, device={}", firmware_version, device_name);
        
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
        // Note: The firmware might not support a direct LOAD command.
        // Configuration is automatically loaded from /config.bin at boot.
        // For now, we'll just log and return success.
        log::info!("Note: Device automatically loads configuration from /config.bin at boot");
        log::info!("To reload configuration, you may need to reset the device");
        Ok(())
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
        
        // Parse the response - filter out protocol markers
        let files: Vec<String> = response
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty() && line != "FILES:" && line != "END_FILES")
            .collect();
        
        Ok(files)
    }

    /// Read a file from the device storage
    pub async fn read_file(&mut self, filename: &str) -> Result<Vec<u8>> {
        log::info!("Reading file: {}", filename);
        let command = format!("READ_FILE {}", filename);
        let response = self.interface.send_command(&command).await?;
        
        log::info!("Raw response length: {} chars", response.len());
        log::info!("Raw response: '{}'", response);
        
        // Parse firmware response format: FILE_DATA:/config.bin:606:[hex_data]
        let (expected_size, hex_data) = if response.starts_with("FILE_DATA:") {
            // Find the third colon which separates size from hex data
            let after_prefix = response.strip_prefix("FILE_DATA:").unwrap_or(&response);
            let parts: Vec<&str> = after_prefix.splitn(3, ':').collect();
            if parts.len() >= 3 {
                let expected_size = parts[1].parse::<usize>()
                    .map_err(|_| SerialError::ProtocolError("Invalid file size in response".to_string()))?;
                (Some(expected_size), parts[2].trim()) // The hex data part
            } else {
                return Err(SerialError::ProtocolError(format!("Invalid FILE_DATA response format: {}", response)));
            }
        } else {
            (None, response.trim())
        };

        log::info!("Processing hex data: '{}'", hex_data);
        
        // Validate hex data - should only contain hex characters
        if !hex_data.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(SerialError::ProtocolError(format!("Response contains non-hex characters: '{}'", hex_data)));
        }
        
        // Must be even length for valid hex encoding
        if hex_data.len() % 2 != 0 {
            return Err(SerialError::ProtocolError(format!("Hex data has odd length: {}", hex_data.len())));
        }
        
        let mut bytes = Vec::new();
        
        // Parse hex string to bytes
        for chunk in hex_data.as_bytes().chunks(2) {
            let hex_str = std::str::from_utf8(chunk)
                .map_err(|_| SerialError::ProtocolError("Invalid hex response".to_string()))?;
            let byte = u8::from_str_radix(hex_str, 16)
                .map_err(|e| SerialError::ProtocolError(format!("Invalid hex byte '{}': {}", hex_str, e)))?;
            bytes.push(byte);
        }
        
        log::info!("Decoded {} bytes from hex response", bytes.len());
        
        // Validate size if we have expected size from FILE_DATA response
        if let Some(expected) = expected_size {
            if bytes.len() != expected {
                return Err(SerialError::ProtocolError(format!(
                    "Size mismatch: decoded {} bytes, expected {} bytes", 
                    bytes.len(), expected
                )));
            }
            log::info!("Size validation passed: {} bytes", bytes.len());
        }
        
        Ok(bytes)
    }

    /// Save current configuration to device storage
    pub async fn save_config(&mut self) -> Result<()> {
        let _response = self.interface.send_command("SAVE_CONFIG").await?;
        log::info!("Configuration saved to device");
        Ok(())
    }

    /// Write a file to the device storage with raw binary data
    pub async fn write_raw_file(&mut self, _filename: &str, _data: &[u8]) -> Result<()> {
        // Note: WRITE_FILE is a suggested extension not yet implemented in firmware
        return Err(SerialError::ProtocolError(
            "WRITE_FILE command not implemented in firmware. Use SAVE_CONFIG for configuration updates.".to_string()
        ));
    }

    /// Delete a file from the device storage
    pub async fn delete_file(&mut self, _filename: &str) -> Result<()> {
        // Note: DELETE_FILE is a suggested extension not yet implemented in firmware
        return Err(SerialError::ProtocolError(
            "DELETE_FILE command not implemented in firmware. Use FORMAT_STORAGE to clear all files.".to_string()
        ));
    }

    /// Format the device storage (deletes all files)
    pub async fn format_storage(&mut self) -> Result<()> {
        // Note: FORMAT_STORAGE is a suggested extension not yet implemented in firmware
        // Try using FORCE_DEFAULT_CONFIG which is the actual firmware command
        let _response = self.interface.send_command("FORCE_DEFAULT_CONFIG").await?;
        log::warn!("Used FORCE_DEFAULT_CONFIG to reset device (FORMAT_STORAGE not available)");
        Ok(())
    }

    /// Reset device configuration to defaults
    pub async fn reset_to_defaults(&mut self) -> Result<()> {
        // Note: RESET_DEFAULTS is a suggested extension not yet implemented in firmware
        // Use FORCE_DEFAULT_CONFIG which is the actual firmware command
        let _response = self.interface.send_command("FORCE_DEFAULT_CONFIG").await?;
        log::info!("Device reset to default configuration using FORCE_DEFAULT_CONFIG");
        Ok(())
    }

    /// Get detailed storage information
    pub async fn get_storage_details(&mut self) -> Result<StorageInfo> {
        // Note: STORAGE_INFO is a suggested extension not yet implemented in firmware
        // For now, we'll return estimated values based on what we know
        log::warn!("STORAGE_INFO command not implemented in firmware, using defaults");
        
        // Try to list files to get an accurate count
        let file_count = match self.list_files().await {
            Ok(files) => files.len() as u8,
            Err(_) => 0,
        };
        
        // Estimate storage usage based on typical sizes
        let estimated_used = if file_count > 0 {
            // File table overhead + typical file sizes
            64 + (file_count as usize * 256)
        } else {
            64 // Just the file table
        };
        
        Ok(StorageInfo {
            used_bytes: estimated_used,
            total_bytes: 4096, // RP2040 EEPROM emulation size
            available_bytes: 4096_usize.saturating_sub(estimated_used),
            file_count,
            max_files: 8, // From firmware documentation
        })
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageInfo {
    pub used_bytes: usize,
    pub total_bytes: usize,
    pub available_bytes: usize,
    pub file_count: u8,
    pub max_files: u8,
}