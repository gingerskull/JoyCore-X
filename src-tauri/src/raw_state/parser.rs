use crate::raw_state::types::*;

/// Parse GPIO_STATES response from firmware
/// Format: GPIO_STATES:0x[32-bit-hex]:[timestamp]
pub fn parse_gpio_response(line: &str) -> Option<RawGpioStates> {
    let parts: Vec<&str> = line.split(':').collect();
    if parts.len() != 3 || parts[0] != "GPIO_STATES" {
        return None;
    }

    // Parse hex value (remove 0x prefix)
    let hex_str = parts[1].strip_prefix("0x")?;
    let gpio_mask = u32::from_str_radix(hex_str, 16).ok()?;
    
    // Parse timestamp
    let timestamp = parts[2].parse::<u64>().ok()?;

    Some(RawGpioStates { gpio_mask, timestamp })
}

/// Parse MATRIX_STATE response from firmware
/// Format: MATRIX_STATE:[row]:[col]:[state]:[timestamp]
/// Special: MATRIX_STATE:NO_MATRIX_CONFIGURED or MATRIX_STATE:NO_MATRIX_PINS_CONFIGURED
pub fn parse_matrix_response(line: &str) -> Result<Option<MatrixConnection>, ConfigurationStatus> {
    let parts: Vec<&str> = line.split(':').collect();
    
    if parts.len() >= 2 {
        if parts[1] == "NO_MATRIX_CONFIGURED" {
            return Err(ConfigurationStatus::NotConfigured);
        }
        if parts[1] == "NO_MATRIX_PINS_CONFIGURED" {
            return Err(ConfigurationStatus::PinsNotConfigured);
        }
    }

    if parts.len() != 5 || parts[0] != "MATRIX_STATE" {
        return Ok(None);
    }

    let row = parts[1].parse::<u8>().ok();
    let col = parts[2].parse::<u8>().ok();
    let state = parts[3].parse::<u8>().ok();

    if let (Some(row), Some(col), Some(state)) = (row, col, state) {
        Ok(Some(MatrixConnection {
            row,
            col,
            is_connected: state == 1,
        }))
    } else {
        Ok(None)
    }
}

/// Parse SHIFT_REG response from firmware
/// Format: SHIFT_REG:[reg_id]:[8-bit-hex]:[timestamp]
/// Special: SHIFT_REG:NO_SHIFT_REG_CONFIGURED
pub fn parse_shift_reg_response(line: &str) -> Result<Option<ShiftRegisterState>, ConfigurationStatus> {
    let parts: Vec<&str> = line.split(':').collect();
    
    if parts.len() >= 2 && parts[1] == "NO_SHIFT_REG_CONFIGURED" {
        return Err(ConfigurationStatus::NotConfigured);
    }

    if parts.len() != 4 || parts[0] != "SHIFT_REG" {
        return Ok(None);
    }

    let register_id = parts[1].parse::<u8>().ok();
    
    // Parse hex value (remove 0x prefix if present)
    let hex_str = parts[2].strip_prefix("0x").unwrap_or(parts[2]);
    let value = u8::from_str_radix(hex_str, 16).ok();
    
    let timestamp = parts[3].parse::<u64>().ok();

    if let (Some(register_id), Some(value), Some(timestamp)) = (register_id, value, timestamp) {
        Ok(Some(ShiftRegisterState {
            register_id,
            value,
            timestamp,
        }))
    } else {
        Ok(None)
    }
}

/// Parse multiple matrix responses into a complete MatrixState
pub fn parse_matrix_responses(lines: Vec<String>) -> Result<MatrixState, ConfigurationStatus> {
    let mut connections = Vec::new();
    let mut timestamp = 0u64;

    for line in lines {
        match parse_matrix_response(&line) {
            Ok(Some(connection)) => {
                connections.push(connection);
            }
            Ok(None) => {
                // Ignore unparseable lines
            }
            Err(status) => {
                return Err(status);
            }
        }
    }

    // Use current time if no timestamp available
    if timestamp == 0 {
        timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_micros() as u64;
    }

    Ok(MatrixState {
        connections,
        timestamp,
    })
}

/// Parse multiple shift register responses
pub fn parse_shift_reg_responses(lines: Vec<String>) -> Result<Vec<ShiftRegisterState>, ConfigurationStatus> {
    let mut registers = Vec::new();

    for line in lines {
        match parse_shift_reg_response(&line) {
            Ok(Some(reg_state)) => {
                registers.push(reg_state);
            }
            Ok(None) => {
                // Ignore unparseable lines
            }
            Err(status) => {
                return Err(status);
            }
        }
    }

    // Sort by register ID for consistent ordering
    registers.sort_by_key(|r| r.register_id);
    
    Ok(registers)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_gpio_response() {
        let line = "GPIO_STATES:0x00001090:1234567890";
        let result = parse_gpio_response(line).unwrap();
        assert_eq!(result.gpio_mask, 0x00001090);
        assert_eq!(result.timestamp, 1234567890);
    }

    #[test]
    fn test_parse_matrix_response() {
        let line = "MATRIX_STATE:2:1:1:1234567890";
        let result = parse_matrix_response(line).unwrap().unwrap();
        assert_eq!(result.row, 2);
        assert_eq!(result.col, 1);
        assert_eq!(result.is_connected, true);
    }

    #[test]
    fn test_parse_shift_reg_response() {
        let line = "SHIFT_REG:0:0xFF:1234567890";
        let result = parse_shift_reg_response(line).unwrap().unwrap();
        assert_eq!(result.register_id, 0);
        assert_eq!(result.value, 0xFF);
        assert_eq!(result.timestamp, 1234567890);
    }

    #[test]
    fn test_parse_matrix_not_configured() {
        let line = "MATRIX_STATE:NO_MATRIX_CONFIGURED";
        let result = parse_matrix_response(line);
        assert!(matches!(result, Err(ConfigurationStatus::NotConfigured)));
    }
}