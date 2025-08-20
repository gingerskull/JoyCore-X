pub mod types;
pub mod parser;
pub mod reader;

pub use types::*;
pub use reader::*;

// Developer configuration (compile-time)
#[derive(Debug, Clone, PartialEq)]
pub enum DisplayMode {
    HID,     // Show only HID states (default)
    Raw,     // Show only raw hardware states
    Both,    // Show both HID and raw states
}

// Change this constant to switch display modes - no UI control needed
pub const DISPLAY_MODE: DisplayMode = DisplayMode::Raw;

// Performance configuration
pub const RAW_STATE_POLLING_MS: u64 = 50;
pub const ENABLE_DEBUG_LOGGING: bool = false;

// Helper function to get display mode as string for frontend
pub fn get_display_mode_string() -> String {
    match DISPLAY_MODE {
        DisplayMode::HID => "hid".to_string(),
        DisplayMode::Raw => "raw".to_string(),
        DisplayMode::Both => "both".to_string(),
    }
}