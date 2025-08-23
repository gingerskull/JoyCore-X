pub mod types;
pub mod parser;
pub mod reader;
pub mod monitor;

pub use types::*;
pub use reader::*;

use std::sync::atomic::{AtomicU8, Ordering};

// Runtime display mode (was compile-time). Now supports Both to allow concurrent HID + Raw.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DisplayMode {
    HID = 0,
    Raw = 1,
    Both = 2,
}

impl DisplayMode {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "hid" => Some(DisplayMode::HID),
            "raw" => Some(DisplayMode::Raw),
            "both" => Some(DisplayMode::Both),
            _ => None,
        }
    }
    pub fn as_str(&self) -> &'static str {
        match self { DisplayMode::HID => "hid", DisplayMode::Raw => "raw", DisplayMode::Both => "both" }
    }
}

// Global mutable state for current mode (default to Raw to preserve previous behavior)
static DISPLAY_MODE_ATOMIC: AtomicU8 = AtomicU8::new(DisplayMode::Raw as u8);

pub fn get_display_mode() -> DisplayMode {
    match DISPLAY_MODE_ATOMIC.load(Ordering::Relaxed) {
        0 => DisplayMode::HID,
        1 => DisplayMode::Raw,
        2 => DisplayMode::Both,
        _ => DisplayMode::Raw,
    }
}

pub fn set_display_mode(mode: DisplayMode) {
    DISPLAY_MODE_ATOMIC.store(mode as u8, Ordering::Relaxed);
    log::info!("Display mode set to {}", mode.as_str());
}

// Performance configuration
pub const RAW_STATE_POLLING_MS: u64 = 50; // Firmware sends updates every 50ms in continuous mode
pub const ENABLE_DEBUG_LOGGING: bool = false;
pub const ENABLE_PERFORMANCE_METRICS: bool = false;

// Helper function to get display mode as string for frontend
pub fn get_display_mode_string() -> String { get_display_mode().as_str().to_string() }