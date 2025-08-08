use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

// Re-export serial protocol models
pub use crate::serial::protocol::{AxisConfig, ButtonConfig, DeviceStatus, ProfileConfig};

/// Device connection state
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConnectionState {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

/// Complete device information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: Uuid,
    pub port_name: String,
    pub serial_number: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub connection_state: ConnectionState,
    pub device_status: Option<DeviceStatus>,
    pub last_seen: DateTime<Utc>,
}

impl Device {
    pub fn new(port_name: String) -> Self {
        Self {
            id: Uuid::new_v4(),
            port_name,
            serial_number: None,
            manufacturer: None,
            product: None,
            connection_state: ConnectionState::Disconnected,
            device_status: None,
            last_seen: Utc::now(),
        }
    }

    pub fn from_serial_info(info: &crate::serial::SerialDeviceInfo) -> Self {
        Self {
            id: Uuid::new_v4(),
            port_name: info.port_name.clone(),
            serial_number: info.serial_number.clone(),
            manufacturer: info.manufacturer.clone(),
            product: info.product.clone(),
            connection_state: ConnectionState::Disconnected,
            device_status: None,
            last_seen: Utc::now(),
        }
    }

    pub fn is_connected(&self) -> bool {
        matches!(self.connection_state, ConnectionState::Connected)
    }

    pub fn update_connection_state(&mut self, state: ConnectionState) {
        self.connection_state = state;
        self.last_seen = Utc::now();
    }

    pub fn update_device_status(&mut self, status: DeviceStatus) {
        self.device_status = Some(status);
        self.last_seen = Utc::now();
    }
}

/// Configuration profile management
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileManager {
    pub profiles: Vec<ProfileConfig>,
    pub active_profile_id: Option<String>,
}

impl ProfileManager {
    pub fn new() -> Self {
        Self {
            profiles: Vec::new(),
            active_profile_id: None,
        }
    }

    pub fn add_profile(&mut self, profile: ProfileConfig) {
        self.profiles.push(profile);
    }

    pub fn remove_profile(&mut self, profile_id: &str) -> bool {
        if let Some(pos) = self.profiles.iter().position(|p| p.id == profile_id) {
            self.profiles.remove(pos);
            
            // Clear active profile if it was removed
            if self.active_profile_id.as_ref() == Some(&profile_id.to_string()) {
                self.active_profile_id = None;
            }
            
            true
        } else {
            false
        }
    }

    pub fn get_profile(&self, profile_id: &str) -> Option<&ProfileConfig> {
        self.profiles.iter().find(|p| p.id == profile_id)
    }

    pub fn get_profile_mut(&mut self, profile_id: &str) -> Option<&mut ProfileConfig> {
        self.profiles.iter_mut().find(|p| p.id == profile_id)
    }

    pub fn set_active_profile(&mut self, profile_id: &str) -> bool {
        if self.profiles.iter().any(|p| p.id == profile_id) {
            self.active_profile_id = Some(profile_id.to_string());
            true
        } else {
            false
        }
    }

    pub fn get_active_profile(&self) -> Option<&ProfileConfig> {
        self.active_profile_id.as_ref()
            .and_then(|id| self.get_profile(id))
    }

    pub fn create_default_profile(device_status: &DeviceStatus) -> ProfileConfig {
        let now = Utc::now();
        
        // Create default axis configurations
        let mut axes = Vec::new();
        for i in 0..device_status.axes_count {
            axes.push(AxisConfig {
                id: i,
                name: format!("Axis {}", i + 1),
                min_value: -32768,
                max_value: 32767,
                center_value: 0,
                deadzone: 100,
                curve: "linear".to_string(),
                inverted: false,
            });
        }

        // Create default button configurations
        let mut buttons = Vec::new();
        for i in 0..device_status.buttons_count {
            buttons.push(ButtonConfig {
                id: i,
                name: format!("Button {}", i + 1),
                function: "normal".to_string(),
                enabled: true,
            });
        }

        ProfileConfig {
            id: Uuid::new_v4().to_string(),
            name: "Default Profile".to_string(),
            description: format!("Default configuration for {}", device_status.device_name),
            axes,
            buttons,
            created_at: now,
            modified_at: now,
        }
    }
}

impl Default for ProfileManager {
    fn default() -> Self {
        Self::new()
    }
}

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub auto_connect: bool,
    pub auto_save: bool,
    pub log_level: String,
    pub theme: String, // "light", "dark", "system"
    pub language: String,
    pub update_rate_ms: u64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            auto_connect: true,
            auto_save: true,
            log_level: "info".to_string(),
            theme: "system".to_string(),
            language: "en".to_string(),
            update_rate_ms: 100,
        }
    }
}