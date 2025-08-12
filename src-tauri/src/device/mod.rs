pub mod manager;
pub mod models;

pub use manager::DeviceManager;
pub use models::*;


#[derive(Debug, thiserror::Error)]
pub enum DeviceError {
    #[error("Device not found")]
    NotFound,
    
    #[error("Device already connected")]
    AlreadyConnected,
    
    #[error("Device not connected")]
    NotConnected,
    
    #[error("Invalid device configuration: {0}")]
    InvalidConfiguration(String),
    
    #[error("Serial communication error: {0}")]
    SerialError(#[from] crate::serial::SerialError),
    
    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
    
    #[error("Update error: {0}")]
    UpdateError(String),
}

pub type Result<T> = std::result::Result<T, DeviceError>;