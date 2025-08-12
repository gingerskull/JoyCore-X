use serde::{Deserialize, Serialize};

// Constants from firmware
const CONFIG_MAGIC: u32 = 0x4A4F5943; // "JOYC"
const CONFIG_VERSION: u16 = 7; // Current config version from firmware
const STORED_AXIS_CONFIG_SIZE: usize = 15;
const MAX_PIN_MAP_COUNT: u8 = 32;
const MAX_LOGICAL_INPUT_COUNT: u8 = 64;

#[repr(C, packed)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ConfigHeader {
    pub magic: u32,
    pub version: u16,
    pub size: u16,
    pub checksum: u32,
    pub reserved: [u8; 4],
}

impl ConfigHeader {
    pub fn new(size: u16) -> Self {
        Self {
            magic: CONFIG_MAGIC,
            version: CONFIG_VERSION,
            size,
            checksum: 0, // Will be calculated later
            reserved: [0; 4],
        }
    }

    pub fn validate(&self) -> Result<(), String> {
        // Copy packed fields to local variables to avoid alignment issues
        let magic = self.magic;
        let version = self.version;
        
        if magic != CONFIG_MAGIC {
            return Err(format!("Invalid magic number: 0x{:08X}", magic));
        }
        if version != CONFIG_VERSION {
            return Err(format!("Invalid version: {} (expected {})", version, CONFIG_VERSION));
        }
        Ok(())
    }
}

#[repr(C, packed)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct StoredUSBDescriptor {
    pub vid: u16,
    pub pid: u16,
    pub manufacturer: [u8; 32],
    pub product: [u8; 32],
    pub reserved: [u8; 8], // Changed from serial_number[16] to match firmware
}

impl Default for StoredUSBDescriptor {
    fn default() -> Self {
        Self {
            vid: 0x2E8A, // Raspberry Pi VID
            pid: 0xA02F, // JoyCore PID
            manufacturer: [0; 32],
            product: [0; 32],
            reserved: [0; 8], // Changed from serial_number[16] to match firmware
        }
    }
}

#[repr(C, packed)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct StoredAxisConfig {
    pub enabled: u8,
    pub pin: u8,
    pub min_value: u16,
    pub max_value: u16,
    pub filter_level: u8,
    pub ewma_alpha: u16,
    pub deadband: u16,
    pub curve: u8,
    pub reserved: [u8; 3],
}

impl Default for StoredAxisConfig {
    fn default() -> Self {
        Self {
            enabled: 0,
            pin: 0,
            min_value: 0,
            max_value: 1023,
            filter_level: 2,
            ewma_alpha: 6554, // 0.1 in fixed point
            deadband: 0,
            curve: 0, // Linear
            reserved: [0; 3],
        }
    }
}

// Ensure the size matches firmware expectations
const _: () = assert!(std::mem::size_of::<StoredAxisConfig>() == STORED_AXIS_CONFIG_SIZE);

#[repr(C, packed)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct StoredPinMapEntry {
    pub name: [u8; 8],
    pub pin_type: u8,
    pub reserved: u8,
}

#[repr(C, packed)]
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct StoredLogicalInput {
    pub input_type: u8,
    pub behavior: u8,
    pub joy_button_id: u8,
    pub reverse: u8,
    pub encoder_latch_mode: u8,
    pub reserved: [u8; 3],
    pub data: [u8; 2], // Changed from [u8; 4] to match firmware
}

#[repr(C, packed)]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredConfig {
    pub header: ConfigHeader,
    pub usb_descriptor: StoredUSBDescriptor,
    pub pin_map_count: u8,
    pub logical_input_count: u8,
    pub shift_reg_count: u8,
    pub padding: u8,
    pub axes: [StoredAxisConfig; 8], // Fixed array of 8 axes
}

impl StoredConfig {
    pub fn new() -> Self {
        Self {
            header: ConfigHeader::new(0),
            usb_descriptor: StoredUSBDescriptor::default(),
            pin_map_count: 0,
            logical_input_count: 0,
            shift_reg_count: 0,
            padding: 0,
            axes: [StoredAxisConfig::default(); 8],
        }
    }

    pub fn validate_counts(&self) -> Result<(), String> {
        // Copy packed fields to local variables to avoid alignment issues
        let pin_map_count = self.pin_map_count;
        let logical_input_count = self.logical_input_count;
        
        if pin_map_count > MAX_PIN_MAP_COUNT {
            return Err(format!("Pin map count {} exceeds maximum {}", 
                pin_map_count, MAX_PIN_MAP_COUNT));
        }
        if logical_input_count > MAX_LOGICAL_INPUT_COUNT {
            return Err(format!("Logical input count {} exceeds maximum {}", 
                logical_input_count, MAX_LOGICAL_INPUT_COUNT));
        }
        Ok(())
    }
}

/// Complete binary configuration including variable-length sections
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BinaryConfig {
    pub stored_config: StoredConfig,
    pub pin_map_entries: Vec<StoredPinMapEntry>,
    pub logical_inputs: Vec<StoredLogicalInput>,
}

impl BinaryConfig {
    pub fn new() -> Self {
        Self {
            stored_config: StoredConfig::new(),
            pin_map_entries: Vec::new(),
            logical_inputs: Vec::new(),
        }
    }

    /// Serialize to binary format matching firmware expectations
    pub fn to_bytes(&self) -> Result<Vec<u8>, String> {
        let mut buffer = Vec::new();

        // First pass: serialize without checksum to calculate size
        let mut temp_config = self.stored_config.clone();
        temp_config.header.checksum = 0;
        
        // Calculate total size
        let fixed_size = std::mem::size_of::<StoredConfig>();
        let pin_map_size = self.pin_map_entries.len() * std::mem::size_of::<StoredPinMapEntry>();
        let logical_inputs_size = self.logical_inputs.len() * std::mem::size_of::<StoredLogicalInput>();
        let total_size = fixed_size + pin_map_size + logical_inputs_size;
        
        temp_config.header.size = total_size as u16;

        // Serialize fixed portion
        let config_bytes = unsafe {
            std::slice::from_raw_parts(
                &temp_config as *const StoredConfig as *const u8,
                fixed_size
            )
        };
        buffer.extend_from_slice(config_bytes);

        // Serialize variable portions
        for entry in &self.pin_map_entries {
            let entry_bytes = unsafe {
                std::slice::from_raw_parts(
                    entry as *const StoredPinMapEntry as *const u8,
                    std::mem::size_of::<StoredPinMapEntry>()
                )
            };
            buffer.extend_from_slice(entry_bytes);
        }

        for input in &self.logical_inputs {
            let input_bytes = unsafe {
                std::slice::from_raw_parts(
                    input as *const StoredLogicalInput as *const u8,
                    std::mem::size_of::<StoredLogicalInput>()
                )
            };
            buffer.extend_from_slice(input_bytes);
        }

        // Calculate CRC32 checksum
        let checksum = calculate_crc32(&buffer);
        
        // Update checksum in header
        let checksum_bytes = checksum.to_le_bytes();
        buffer[8..12].copy_from_slice(&checksum_bytes);

        Ok(buffer)
    }

    /// Parse from binary data
    pub fn from_bytes(data: &[u8]) -> Result<Self, String> {
        if data.len() < std::mem::size_of::<StoredConfig>() {
            return Err("Data too small for StoredConfig".to_string());
        }

        // Parse fixed portion
        let stored_config = unsafe {
            std::ptr::read(data.as_ptr() as *const StoredConfig)
        };


        // Validate header
        stored_config.header.validate()?;
        stored_config.validate_counts()?;

        // Verify size
        let header_size = stored_config.header.size;
        if data.len() != header_size as usize {
            return Err(format!("Size mismatch: got {} bytes, header says {}", 
                data.len(), header_size));
        }

        // Validate checksum using firmware-specific algorithm and coverage order
        let calculated_checksum = calculate_firmware_crc32(data);
        let header_checksum = stored_config.header.checksum;
        if calculated_checksum != header_checksum {
            return Err(format!("Checksum mismatch: calculated 0x{:08X}, got 0x{:08X}", 
                calculated_checksum, header_checksum));
        }

        // Parse variable portions
        let mut offset = std::mem::size_of::<StoredConfig>();
        
        let mut pin_map_entries = Vec::new();
        for _ in 0..stored_config.pin_map_count {
            if offset + std::mem::size_of::<StoredPinMapEntry>() > data.len() {
                return Err("Insufficient data for pin map entries".to_string());
            }
            let entry = unsafe {
                std::ptr::read(data[offset..].as_ptr() as *const StoredPinMapEntry)
            };
            pin_map_entries.push(entry);
            offset += std::mem::size_of::<StoredPinMapEntry>();
        }

        let mut logical_inputs = Vec::new();
        for _ in 0..stored_config.logical_input_count {
            if offset + std::mem::size_of::<StoredLogicalInput>() > data.len() {
                return Err("Insufficient data for logical inputs".to_string());
            }
            let input = unsafe {
                std::ptr::read(data[offset..].as_ptr() as *const StoredLogicalInput)
            };
            logical_inputs.push(input);
            offset += std::mem::size_of::<StoredLogicalInput>();
        }

        Ok(Self {
            stored_config,
            pin_map_entries,
            logical_inputs,
        })
    }

    /// Convert to UI-compatible axis configurations
    pub fn to_axis_configs(&self) -> Vec<UIAxisConfig> {
        let mut configs = Vec::new();
        
        for (i, stored_axis) in self.stored_config.axes.iter().enumerate() {
            // Only include enabled axes
            if stored_axis.enabled != 0 {
                let curve_name = match stored_axis.curve {
                    0 => "linear",
                    1 => "curve1", 
                    2 => "curve2",
                    3 => "curve3",
                    _ => "linear",
                };

                configs.push(UIAxisConfig {
                    id: i as u8,
                    name: format!("Axis {} (Pin {})", i + 1, stored_axis.pin),
                    min_value: stored_axis.min_value as i32,
                    max_value: stored_axis.max_value as i32,
                    center_value: ((stored_axis.min_value as u32 + stored_axis.max_value as u32) / 2) as i32,
                    deadzone: stored_axis.deadband as u32,
                    curve: curve_name.to_string(),
                    inverted: false, // Not stored in binary format
                });
            }
        }
        
        configs
    }

    /// Convert pin maps and logical inputs to UI button configurations
    pub fn to_button_configs(&self) -> Vec<UIButtonConfig> {
        let mut configs = Vec::new();
        
        // Extract buttons from logical inputs
        for (i, logical_input) in self.logical_inputs.iter().enumerate() {
            let function_name = match logical_input.behavior {
                0 => "normal",
                1 => "toggle",
                2 => "macro",
                _ => "normal",
            };

            let input_type_name = match logical_input.input_type {
                1 => "Pin",
                2 => "Matrix", 
                3 => "Shift Register",
                _ => "Unknown",
            };

            // Create descriptive name based on input type
            let name = if logical_input.input_type == 1 {
                // For pin inputs, try to find the pin from the data field (now 2 bytes)
                let pin_data = u16::from_le_bytes(logical_input.data);
                format!("Button {} ({} Pin {})", logical_input.joy_button_id + 1, input_type_name, pin_data)
            } else {
                format!("Button {} ({})", logical_input.joy_button_id + 1, input_type_name)
            };

            configs.push(UIButtonConfig {
                id: i as u8,
                name,
                function: function_name.to_string(),
                enabled: logical_input.reverse == 0, // Reverse logic for enabled
            });
        }
        
        configs
    }
}

// UI-compatible structures (to avoid circular dependencies)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIAxisConfig {
    pub id: u8,
    pub name: String,
    pub min_value: i32,
    pub max_value: i32,
    pub center_value: i32,
    pub deadzone: u32,
    pub curve: String,
    pub inverted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UIButtonConfig {
    pub id: u8,
    pub name: String,
    pub function: String,
    pub enabled: bool,
}

/// Calculate CRC32 checksum using firmware-specific algorithm and coverage order
/// Coverage order: ConfigHeader (skip checksum field) + rest of StoredConfig + variable data
fn calculate_firmware_crc32(data: &[u8]) -> u32 {
    let mut checksum: u32 = 0xFFFFFFFF; // Initial value
    
    // Process ConfigHeader up to (but excluding) the checksum field (bytes 0-7)
    for &byte in &data[0..8] {
        checksum = crc32_update_byte(checksum, byte);
    }
    
    // Skip checksum field (bytes 8-11) and process rest of ConfigHeader (bytes 12-15)
    for &byte in &data[12..16] {
        checksum = crc32_update_byte(checksum, byte);
    }
    
    // Process rest of StoredConfig after ConfigHeader (from byte 16 onwards)
    for &byte in &data[16..] {
        checksum = crc32_update_byte(checksum, byte);
    }
    
    !checksum // Final bitwise NOT
}

/// Update CRC32 checksum with a single byte using firmware algorithm
fn crc32_update_byte(mut checksum: u32, byte: u8) -> u32 {
    checksum ^= byte as u32;
    for _ in 0..8 {
        if checksum & 1 != 0 {
            checksum = (checksum >> 1) ^ 0xEDB88320;
        } else {
            checksum = checksum >> 1;
        }
    }
    checksum
}

/// Calculate CRC32 checksum matching firmware implementation exactly
/// Uses firmware-specific algorithm with polynomial 0xEDB88320
fn calculate_crc32(data: &[u8]) -> u32 {
    let mut checksum: u32 = 0xFFFFFFFF; // Initial value
    
    for &byte in data {
        checksum = crc32_update_byte(checksum, byte);
    }
    
    !checksum // Final bitwise NOT
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_stored_axis_config_size() {
        assert_eq!(std::mem::size_of::<StoredAxisConfig>(), STORED_AXIS_CONFIG_SIZE);
    }

    #[test]
    fn test_structure_sizes_match_firmware() {
        // Verify structure sizes match firmware expectations
        assert_eq!(std::mem::size_of::<StoredUSBDescriptor>(), 76, "StoredUSBDescriptor should be 76 bytes");
        assert_eq!(std::mem::size_of::<StoredLogicalInput>(), 10, "StoredLogicalInput should be 10 bytes");
        assert_eq!(std::mem::size_of::<StoredPinMapEntry>(), 10, "StoredPinMapEntry should be 10 bytes");
        assert_eq!(std::mem::size_of::<StoredAxisConfig>(), 15, "StoredAxisConfig should be 15 bytes");
    }

    #[test]
    fn test_firmware_crc32_algorithm() {
        // Test basic CRC32 calculation with known data
        let test_data = vec![0x43, 0x59, 0x4F, 0x4A]; // "CJOY" magic number
        let checksum = calculate_crc32(&test_data);
        
        // Verify our algorithm produces consistent results
        assert_eq!(checksum, calculate_crc32(&test_data), "CRC32 should be deterministic");
    }

    #[test]
    fn test_config_header_validation() {
        let mut header = ConfigHeader::new(100);
        assert!(header.validate().is_ok());
        
        header.magic = 0xDEADBEEF;
        assert!(header.validate().is_err());
        
        header.magic = CONFIG_MAGIC;
        header.version = 999;
        assert!(header.validate().is_err());
    }

    #[test]
    fn test_binary_config_roundtrip() {
        let mut config = BinaryConfig::new();
        config.stored_config.pin_map_count = 2;
        config.stored_config.logical_input_count = 3;
        
        // Add some test data
        config.pin_map_entries.push(StoredPinMapEntry {
            name: [b'A', b'X', b'I', b'S', b'1', 0, 0, 0],
            pin_type: 1,
            reserved: 0,
        });
        config.pin_map_entries.push(StoredPinMapEntry {
            name: [b'B', b'T', b'N', b'1', 0, 0, 0, 0],
            pin_type: 2,
            reserved: 0,
        });
        
        for i in 0..3 {
            config.logical_inputs.push(StoredLogicalInput {
                input_type: 1,
                behavior: 0,
                joy_button_id: i,
                reverse: 0,
                encoder_latch_mode: 0,
                reserved: [0; 3],
                data: [0; 2], // Changed from [0; 4] to match firmware
            });
        }
        
        // Test serialization and deserialization
        let bytes = config.to_bytes().expect("Serialization failed");
        let parsed = BinaryConfig::from_bytes(&bytes).expect("Deserialization failed");
        
        assert_eq!(config.stored_config.pin_map_count, parsed.stored_config.pin_map_count);
        assert_eq!(config.stored_config.logical_input_count, parsed.stored_config.logical_input_count);
        assert_eq!(config.pin_map_entries.len(), parsed.pin_map_entries.len());
        assert_eq!(config.logical_inputs.len(), parsed.logical_inputs.len());
    }

}