use crate::raw_state::types::*;
use crate::raw_state::parser::*;
use crate::serial::protocol::ConfigProtocol;

/// Raw state reading commands
pub struct RawStateReader;

impl RawStateReader {
    /// Read current GPIO states from device
    pub async fn read_gpio_states(protocol: &mut ConfigProtocol) -> Result<RawGpioStates, String> {
        // Send command via the interface
    let response = protocol.send_locked("READ_GPIO_STATES").await.map_err(|e| format!("Failed to send GPIO command: {}", e))?;

        // Parse response
        parse_gpio_response(&response)
            .ok_or_else(|| format!("Failed to parse GPIO response: {}", response))
    }

    /// Read current matrix states from device
    pub async fn read_matrix_state(protocol: &mut ConfigProtocol) -> Result<MatrixState, String> {
        // Send command and get response (the send_command method handles multiple lines)
    let response = protocol.send_locked("READ_MATRIX_STATE").await.map_err(|e| format!("Failed to send matrix command: {}", e))?;

        // Split response into lines for parsing
        let lines: Vec<String> = response.lines().map(|s| s.to_string()).collect();

        if lines.is_empty() {
            return Err("No matrix response received".to_string());
        }

        // Parse all responses
        match parse_matrix_responses(lines) {
            Ok(matrix_state) => Ok(matrix_state),
            Err(ConfigurationStatus::NotConfigured) => {
                Err("Matrix not configured in firmware".to_string())
            }
            Err(ConfigurationStatus::PinsNotConfigured) => {
                Err("Matrix configured but pins not set".to_string())
            }
            Err(_) => Err("Unknown matrix configuration error".to_string()),
        }
    }

    /// Read current shift register states from device
    pub async fn read_shift_reg_state(protocol: &mut ConfigProtocol) -> Result<Vec<ShiftRegisterState>, String> {
        // Send command and get response
    let response = protocol.send_locked("READ_SHIFT_REG").await.map_err(|e| format!("Failed to send shift register command: {}", e))?;

        // Split response into lines for parsing
        let lines: Vec<String> = response.lines().map(|s| s.to_string()).collect();

        if lines.is_empty() {
            return Err("No shift register response received".to_string());
        }

        // Parse all responses
        match parse_shift_reg_responses(lines) {
            Ok(shift_states) => Ok(shift_states),
            Err(ConfigurationStatus::NotConfigured) => {
                Err("Shift registers not configured in firmware".to_string())
            }
            Err(_) => Err("Unknown shift register configuration error".to_string()),
        }
    }

    /// Read all raw hardware states in one operation
    pub async fn read_all_states(protocol: &mut ConfigProtocol) -> Result<RawHardwareState, String> {
        let mut hardware_state = RawHardwareState {
            gpio: None,
            matrix: None,
            shift_registers: Vec::new(),
        };

        // Read GPIO states (always available)
        match Self::read_gpio_states(protocol).await {
            Ok(gpio_states) => hardware_state.gpio = Some(gpio_states),
            Err(e) => {
                if crate::raw_state::ENABLE_DEBUG_LOGGING {
                    eprintln!("Failed to read GPIO states: {}", e);
                }
            }
        }

        // Read matrix states (may not be configured)
        match Self::read_matrix_state(protocol).await {
            Ok(matrix_state) => hardware_state.matrix = Some(matrix_state),
            Err(e) => {
                if crate::raw_state::ENABLE_DEBUG_LOGGING {
                    eprintln!("Failed to read matrix states: {}", e);
                }
            }
        }

        // Read shift register states (may not be configured)
        match Self::read_shift_reg_state(protocol).await {
            Ok(shift_states) => hardware_state.shift_registers = shift_states,
            Err(e) => {
                if crate::raw_state::ENABLE_DEBUG_LOGGING {
                    eprintln!("Failed to read shift register states: {}", e);
                }
            }
        }

        Ok(hardware_state)
    }

    /// Start raw state monitoring on device
    pub async fn start_monitoring(protocol: &mut ConfigProtocol) -> Result<(), String> {
        // Send start command
    let response = protocol.send_locked("START_RAW_MONITOR").await.map_err(|e| format!("Failed to start monitoring: {}", e))?;

        if response.contains("OK:RAW_MONITOR_STARTED") {
            Ok(())
        } else {
            Err(format!("Unexpected start response: {}", response))
        }
    }

    /// Stop raw state monitoring on device
    pub async fn stop_monitoring(protocol: &mut ConfigProtocol) -> Result<(), String> {
        // Send stop command
    let response = protocol.send_locked("STOP_RAW_MONITOR").await.map_err(|e| format!("Failed to stop monitoring: {}", e))?;

        if response.contains("OK:RAW_MONITOR_STOPPED") {
            Ok(())
        } else {
            Err(format!("Unexpected stop response: {}", response))
        }
    }
}