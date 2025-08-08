use std::time::Duration;
use serialport::{SerialPort, SerialPortType};
use tokio::time::timeout;

use super::{Result, SerialError, SerialDeviceInfo};

// JoyCore device identifiers (RP2040-based)
pub const JOYCORE_VID: u16 = 0x2E8A; // Raspberry Pi Foundation
pub const JOYCORE_PID: u16 = 0xA02F; // RP2040 CDC
pub const BAUD_RATE: u32 = 115200;

pub struct SerialInterface {
    port: Option<Box<dyn SerialPort>>,
    device_info: Option<SerialDeviceInfo>,
}

impl SerialInterface {
    pub fn new() -> Self {
        Self {
            port: None,
            device_info: None,
        }
    }

    /// Discover available JoyCore devices
    pub fn discover_devices() -> Result<Vec<SerialDeviceInfo>> {
        let ports = serialport::available_ports()?;
        let mut devices = Vec::new();

        for port in ports {
            if let SerialPortType::UsbPort(usb_info) = port.port_type {
                // Check for JoyCore devices (RP2040-based)
                if usb_info.vid == JOYCORE_VID && usb_info.pid == JOYCORE_PID {
                    let device = SerialDeviceInfo {
                        port_name: port.port_name.clone(),
                        vid: usb_info.vid,
                        pid: usb_info.pid,
                        serial_number: usb_info.serial_number.clone(),
                        manufacturer: usb_info.manufacturer.clone(),
                        product: usb_info.product.clone(),
                    };
                    devices.push(device);
                }
            }
        }

        Ok(devices)
    }

    /// Connect to a specific device
    pub fn connect(&mut self, port_name: &str) -> Result<()> {
        let port = serialport::new(port_name, BAUD_RATE)
            .timeout(Duration::from_millis(1000))
            .open()
            .map_err(|e| SerialError::ConnectionFailed(e.to_string()))?;

        // Verify this is a JoyCore device by checking VID/PID
        let available_ports = serialport::available_ports()?;
        let device_info = available_ports
            .iter()
            .find(|p| p.port_name == port_name)
            .and_then(|p| {
                if let SerialPortType::UsbPort(ref usb_info) = p.port_type {
                    if usb_info.vid == JOYCORE_VID && usb_info.pid == JOYCORE_PID {
                        Some(SerialDeviceInfo {
                            port_name: p.port_name.clone(),
                            vid: usb_info.vid,
                            pid: usb_info.pid,
                            serial_number: usb_info.serial_number.clone(),
                            manufacturer: usb_info.manufacturer.clone(),
                            product: usb_info.product.clone(),
                        })
                    } else {
                        None
                    }
                } else {
                    None
                }
            })
            .ok_or_else(|| SerialError::PortNotFound(port_name.to_string()))?;

        self.port = Some(port);
        self.device_info = Some(device_info);
        
        log::info!("Connected to JoyCore device on {}", port_name);
        Ok(())
    }

    /// Disconnect from the current device
    pub fn disconnect(&mut self) {
        if let Some(device) = &self.device_info {
            log::info!("Disconnecting from {}", device.port_name);
        }
        self.port = None;
        self.device_info = None;
    }

    /// Check if currently connected
    pub fn is_connected(&self) -> bool {
        self.port.is_some()
    }

    /// Get current device info
    pub fn device_info(&self) -> Option<&SerialDeviceInfo> {
        self.device_info.as_ref()
    }

    /// Send data to the connected device
    pub async fn send_data(&mut self, data: &[u8]) -> Result<usize> {
        let port = self.port.as_mut()
            .ok_or(SerialError::ConnectionFailed("Not connected".to_string()))?;

        let bytes_written = port.write(data)
            .map_err(SerialError::IoError)?;
        
        port.flush().map_err(SerialError::IoError)?;
        
        Ok(bytes_written)
    }

    /// Read data from the connected device with timeout
    pub async fn read_data(&mut self, buffer: &mut [u8], timeout_ms: u64) -> Result<usize> {
        let port = self.port.as_mut()
            .ok_or(SerialError::ConnectionFailed("Not connected".to_string()))?;

        let read_operation = async {
            let mut total_read = 0;
            let mut attempts = 0;
            const MAX_ATTEMPTS: usize = 100;

            while total_read == 0 && attempts < MAX_ATTEMPTS {
                match port.bytes_to_read() {
                    Ok(0) => {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                        attempts += 1;
                    }
                    Ok(_) => {
                        match port.read(&mut buffer[total_read..]) {
                            Ok(bytes_read) => {
                                total_read += bytes_read;
                                break;
                            }
                            Err(ref e) if e.kind() == std::io::ErrorKind::TimedOut => {
                                attempts += 1;
                            }
                            Err(e) => return Err(SerialError::IoError(e)),
                        }
                    }
                    Err(e) => return Err(SerialError::SerialportError(e)),
                }
            }

            if total_read == 0 {
                Err(SerialError::Timeout)
            } else {
                Ok(total_read)
            }
        };

        timeout(Duration::from_millis(timeout_ms), read_operation)
            .await
            .map_err(|_| SerialError::Timeout)?
    }

    /// Send a command and wait for response
    pub async fn send_command(&mut self, command: &str) -> Result<String> {
        let command_with_newline = format!("{}\n", command);
        self.send_data(command_with_newline.as_bytes()).await?;

        let mut buffer = [0u8; 1024];
        let bytes_read = self.read_data(&mut buffer, 2000).await?;
        
        let response = String::from_utf8_lossy(&buffer[..bytes_read]).trim().to_string();
        Ok(response)
    }
}

impl Default for SerialInterface {
    fn default() -> Self {
        Self::new()
    }
}