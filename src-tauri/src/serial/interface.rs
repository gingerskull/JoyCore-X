use std::time::Duration;
use serialport::SerialPort;
use tokio::time::timeout;

use super::{Result, SerialError, SerialDeviceInfo};

// JoyCore device identification constants
pub const DEVICE_SIGNATURE: &str = "JOYCORE-FW";
pub const MAGIC_NUMBER: u32 = 0x4A4F5943; // "JOYC" in hex
pub const IDENTIFY_COMMAND: &str = "IDENTIFY";
pub const IDENTIFY_RESPONSE_PREFIX: &str = "JOYCORE_ID";
pub const BAUD_RATE: u32 = 115200;
pub const IDENTIFY_TIMEOUT_MS: u64 = 500;
pub const PORT_OPEN_DELAY_MS: u64 = 100;

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

    /// Discover available JoyCore devices using IDENTIFY command
    pub fn discover_devices() -> Result<Vec<SerialDeviceInfo>> {
        let ports = serialport::available_ports()?;
        let mut devices = Vec::new();

        for port_info in ports {
            // Try to identify each port as a potential JoyCore device
            match Self::identify_device(&port_info.port_name) {
                Ok(Some(mut device_info)) => {
                    // Enhance device info with USB details if available
                    if let serialport::SerialPortType::UsbPort(usb_info) = &port_info.port_type {
                        device_info.serial_number = usb_info.serial_number.clone();
                        if device_info.manufacturer.is_none() {
                            device_info.manufacturer = usb_info.manufacturer.clone();
                        }
                        if device_info.product.is_none() {
                            device_info.product = usb_info.product.clone();
                        }
                        device_info.vid = usb_info.vid;
                        device_info.pid = usb_info.pid;
                    }
                    
                    // log::info!("Found JoyCore device on port: {} (S/N: {:?})", 
                    //           port_info.port_name, device_info.serial_number);
                    devices.push(device_info);
                }
                Ok(None) => {
                    // Not a JoyCore device, continue
                    log::debug!("Port {} is not a JoyCore device", port_info.port_name);
                }
                Err(e) => {
                    // Connection failed, port might be in use or not available
                    log::debug!("Failed to identify port {}: {}", port_info.port_name, e);
                }
            }
        }

        Ok(devices)
    }

    /// Connect to a specific device
    pub fn connect(&mut self, port_name: &str) -> Result<()> {
        // Open the port for persistent connection
        let port = serialport::new(port_name, BAUD_RATE)
            .timeout(Duration::from_millis(500))
            .open()
            .map_err(|e| SerialError::ConnectionFailed(e.to_string()))?;

        // Re-identify device to get fresh firmware version
        let device_info = match Self::identify_device(port_name)? {
            Some(info) => info,
            None => {
                // Fallback to basic device info if identification fails
                crate::serial::SerialDeviceInfo {
                    port_name: port_name.to_string(),
                    vid: 0, // Legacy field, not used anymore
                    pid: 0, // Legacy field, not used anymore
                    serial_number: None,
                    manufacturer: Some("JoyCore".to_string()),
                    product: Some("HOTAS Controller".to_string()),
                    firmware_version: Some("JoyCore-FW".to_string()),
                    device_signature: Some(DEVICE_SIGNATURE.to_string()),
                }
            }
        };

        self.port = Some(port);
        self.device_info = Some(device_info);
        
        log::info!("Connected to JoyCore device on {}", port_name);
        Ok(())
    }

    /// Connect to a specific device with known device info
    pub fn connect_with_info(&mut self, device_info: SerialDeviceInfo) -> Result<()> {
        let port = serialport::new(&device_info.port_name, BAUD_RATE)
            .timeout(Duration::from_millis(500))
            .open()
            .map_err(|e| SerialError::ConnectionFailed(e.to_string()))?;

        self.port = Some(port);
        self.device_info = Some(device_info.clone());
        
        log::info!("Connected to JoyCore device on {}", device_info.port_name);
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
        log::debug!("Sending command: {}", command);
        let command_with_newline = format!("{}\n", command);
        self.send_data(command_with_newline.as_bytes()).await?;

        // Use larger buffer and line-by-line reading similar to Python implementation
        let mut response_lines = Vec::new();
        let mut accumulated_data = Vec::new();
        let start_time = std::time::Instant::now();
        let timeout_duration = std::time::Duration::from_secs_f32(0.5);
        
        // Give device a moment to start responding - reduced delay
        tokio::time::sleep(std::time::Duration::from_millis(20)).await;
        
        while start_time.elapsed() < timeout_duration {
            let mut buffer = [0u8; 4096]; // Increased buffer size
            
            match timeout(std::time::Duration::from_millis(100), self.read_data(&mut buffer, 100)).await {
                Ok(Ok(bytes_read)) => {
                    if bytes_read > 0 {
                        accumulated_data.extend_from_slice(&buffer[..bytes_read]);
                        
                        // Process complete lines
                        while let Some(line_end) = accumulated_data.iter().position(|&b| b == b'\n' || b == b'\r') {
                            let line_bytes = accumulated_data.drain(..=line_end).collect::<Vec<u8>>();
                            let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
                            
                            if !line.is_empty() {
                                log::debug!("Received line: {}", line);
                                response_lines.push(line.clone());
                                
                                // Check for termination conditions like Python script
                                if line == "END_FILES" || line.starts_with("ERROR:") || line.starts_with("FILE_DATA:") {
                                    log::debug!("Found termination condition: {}", line);
                                    // For FILE_DATA, this should be the complete response
                                    break;
                                }
                            }
                        }
                    } else {
                        // No more data, wait a bit
                        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                    }
                }
                Ok(Err(_)) => {
                    // Serial read error, wait a bit
                    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                }
                Err(_) => {
                    // Timeout on this read, continue
                    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                }
            }
        }
        
        // Process any remaining data as a final line
        if !accumulated_data.is_empty() {
            let line = String::from_utf8_lossy(&accumulated_data).trim().to_string();
            if !line.is_empty() {
                response_lines.push(line);
            }
        }
        
        let full_response = response_lines.join("\n");
        log::debug!("Complete response ({} lines): {}", response_lines.len(), full_response);
        Ok(full_response)
    }

    /// Identify a device on the given port using IDENTIFY command
    /// Returns Ok(Some(device_info)) if it's a JoyCore device
    /// Returns Ok(None) if it's not a JoyCore device
    /// Returns Err if connection or communication failed
    fn identify_device(port_name: &str) -> Result<Option<SerialDeviceInfo>> {
        // Try to open the port
        let mut port = match serialport::new(port_name, BAUD_RATE)
            .timeout(Duration::from_millis(IDENTIFY_TIMEOUT_MS))
            .open()
        {
            Ok(port) => port,
            Err(_) => return Ok(None), // Port unavailable, not an error for discovery
        };

        // Give the device a moment after opening
        std::thread::sleep(Duration::from_millis(PORT_OPEN_DELAY_MS));

        // Send IDENTIFY command
        let identify_command = format!("{}\n", IDENTIFY_COMMAND);
        if port.write_all(identify_command.as_bytes()).is_err() {
            return Ok(None);
        }
        
        if port.flush().is_err() {
            return Ok(None);
        }

        // Wait for response
        let mut buffer = [0u8; 256];
        let mut total_read = 0;
        let start_time = std::time::Instant::now();
        
        while total_read == 0 && start_time.elapsed().as_millis() < IDENTIFY_TIMEOUT_MS as u128 {
            match port.bytes_to_read() {
                Ok(0) => {
                    std::thread::sleep(Duration::from_millis(10));
                    continue;
                }
                Ok(_) => {
                    match port.read(&mut buffer[total_read..]) {
                        Ok(bytes_read) => {
                            total_read += bytes_read;
                            if total_read > 0 {
                                break;
                            }
                        }
                        Err(_) => break,
                    }
                }
                Err(_) => break,
            }
        }

        if total_read == 0 {
            return Ok(None); // No response, not a JoyCore device
        }

        let response_string = String::from_utf8_lossy(&buffer[..total_read]);
        let response = response_string.trim();
        log::debug!("IDENTIFY response from {}: {}", port_name, response);

        // Parse the response: JOYCORE_ID:JOYCORE-FW:4A4F5943:<FIRMWARE_VERSION>
        if let Some(device_info) = Self::parse_identify_response(port_name, response) {
            Ok(Some(device_info))
        } else {
            Ok(None)
        }
    }

    /// Parse IDENTIFY command response
    fn parse_identify_response(port_name: &str, response: &str) -> Option<SerialDeviceInfo> {
        let parts: Vec<&str> = response.split(':').collect();
        
        if parts.len() >= 4 && 
           parts[0] == IDENTIFY_RESPONSE_PREFIX && 
           parts[1] == DEVICE_SIGNATURE {
            
            // Verify magic number
            if let Ok(magic) = u32::from_str_radix(parts[2], 16) {
                if magic == MAGIC_NUMBER {
                    let firmware_version = parts[3].to_string();
                    
                    return Some(SerialDeviceInfo {
                        port_name: port_name.to_string(),
                        vid: 0, // Legacy field, not used for identification
                        pid: 0, // Legacy field, not used for identification  
                        serial_number: None,
                        manufacturer: Some("JoyCore".to_string()),
                        product: Some("HOTAS Controller".to_string()),
                        firmware_version: Some(firmware_version),
                        device_signature: Some(DEVICE_SIGNATURE.to_string()),
                    });
                }
            }
        }
        
        None
    }
}

impl Default for SerialInterface {
    fn default() -> Self {
        Self::new()
    }
}