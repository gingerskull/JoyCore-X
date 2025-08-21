pub mod types;
pub mod parser;
pub mod reader;

pub use types::*;
pub use reader::*;

// Developer configuration (compile-time)
#[derive(Debug, Clone, PartialEq)]
pub enum DisplayMode {
    HID,     // Show only HID states and run HID monitoring
    Raw,     // Show only raw hardware states and run raw monitoring
}

// Change this constant to switch monitoring modes - controls which backend systems are active
// HID: Only HID monitoring runs, no raw state polling
// Raw: Only raw state monitoring runs, no HID connection
pub const DISPLAY_MODE: DisplayMode = DisplayMode::Raw;

// Performance configuration
pub const RAW_STATE_POLLING_MS: u64 = 50;
pub const ENABLE_DEBUG_LOGGING: bool = false;

// Helper function to get display mode as string for frontend
pub fn get_display_mode_string() -> String {
    match DISPLAY_MODE {
        DisplayMode::HID => "hid".to_string(),
        DisplayMode::Raw => "raw".to_string(),
    }
}