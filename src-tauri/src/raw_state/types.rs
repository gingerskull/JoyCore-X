use serde::{Deserialize, Serialize};

/// Raw GPIO state information from firmware
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawGpioStates {
    /// 32-bit mask representing GPIO pin states (bit 0 = GPIO0, etc.)
    /// 1 = HIGH (3.3V), 0 = LOW (0V)
    pub gpio_mask: u32,
    /// Timestamp in microseconds since boot
    pub timestamp: u64,
}

/// Single matrix intersection state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixConnection {
    /// Matrix row number (0-based)
    pub row: u8,
    /// Matrix column number (0-based)  
    pub col: u8,
    /// True if electrical connection detected (button pressed)
    pub is_connected: bool,
}

/// Complete matrix state information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatrixState {
    /// All matrix intersection states
    pub connections: Vec<MatrixConnection>,
    /// Timestamp in microseconds since boot
    pub timestamp: u64,
}

/// Single shift register state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShiftRegisterState {
    /// Register ID in the chain (0-based)
    pub register_id: u8,
    /// 8-bit register value (0x00-0xFF)
    pub value: u8,
    /// Timestamp in microseconds since boot
    pub timestamp: u64,
}

/// Complete raw hardware state snapshot
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawHardwareState {
    /// GPIO pin states
    pub gpio: Option<RawGpioStates>,
    /// Matrix button states
    pub matrix: Option<MatrixState>,
    /// Shift register states
    pub shift_registers: Vec<ShiftRegisterState>,
}

/// Event payload for real-time updates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RawStateEvent {
    /// Device ID this event belongs to
    pub device_id: String,
    /// Updated hardware state
    pub state: RawHardwareState,
}

/// Configuration status from firmware
#[derive(Debug, Clone, PartialEq)]
pub enum ConfigurationStatus {
    /// Hardware is configured and available
    Configured,
    /// No configuration found in firmware
    NotConfigured,
    /// Configuration present but pins not set
    PinsNotConfigured,
}