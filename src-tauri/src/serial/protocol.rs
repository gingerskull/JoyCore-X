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
        let response = self.interface.send_command("INIT").await?;
        
        if response.starts_with("OK") {
            log::info!("Protocol initialized successfully");
            Ok(())
        } else {
            Err(SerialError::ProtocolError(format!("Init failed: {}", response)))
        }
    }

    /// Get device status and capabilities
    pub async fn get_device_status(&mut self) -> Result<DeviceStatus> {
        let version_response = self.interface.send_command("VERSION").await?;
        let info_response = self.interface.send_command("INFO").await?;
        
        // Parse responses (simplified - actual implementation would be more robust)
        let firmware_version = version_response.strip_prefix("VERSION:")
            .unwrap_or("Unknown")
            .trim()
            .to_string();
        
        // Parse device info (format: "INFO:name,axes,buttons")
        let info_parts: Vec<&str> = info_response
            .strip_prefix("INFO:")
            .unwrap_or("Unknown,0,0")
            .split(',')
            .collect();
        
        let status = DeviceStatus {
            firmware_version,
            device_name: info_parts.get(0).unwrap_or(&"Unknown").to_string(),
            axes_count: info_parts.get(1).unwrap_or(&"0").parse().unwrap_or(0),
            buttons_count: info_parts.get(2).unwrap_or(&"0").parse().unwrap_or(0),
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

    /// Save current configuration to device flash
    pub async fn save_config(&mut self) -> Result<()> {
        let response = self.interface.send_command("SAVE").await?;
        
        if response.starts_with("OK") {
            log::info!("Configuration saved to device");
            Ok(())
        } else {
            Err(SerialError::ProtocolError(format!("Save failed: {}", response)))
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

    /// Reset device to factory defaults
    pub async fn factory_reset(&mut self) -> Result<()> {
        let response = self.interface.send_command("FACTORY_RESET").await?;
        
        if response.starts_with("OK") {
            log::warn!("Device reset to factory defaults");
            Ok(())
        } else {
            Err(SerialError::ProtocolError(format!("Factory reset failed: {}", response)))
        }
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