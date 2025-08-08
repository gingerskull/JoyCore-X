pub mod interface;
pub mod protocol;

pub use interface::SerialInterface;
pub use protocol::ConfigProtocol;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SerialDeviceInfo {
    pub port_name: String,
    pub vid: u16,
    pub pid: u16,
    pub serial_number: Option<String>,
    pub manufacturer: Option<String>,
    pub product: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum SerialError {
    #[error("Port not found: {0}")]
    PortNotFound(String),
    
    #[error("Connection failed: {0}")]
    ConnectionFailed(String),
    
    #[error("Communication timeout")]
    Timeout,
    
    #[error("Protocol error: {0}")]
    ProtocolError(String),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Serialport error: {0}")]
    SerialportError(#[from] serialport::Error),
}

pub type Result<T> = std::result::Result<T, SerialError>;