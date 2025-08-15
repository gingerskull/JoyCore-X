// JoyCore-X TypeScript definitions for Tauri commands

export interface SerialDeviceInfo {
  port_name: string;
  vid: number;
  pid: number;
  serial_number?: string;
  manufacturer?: string;
  product?: string;
}

export type ConnectionState = 
  | "Disconnected" 
  | "Connecting" 
  | "Connected" 
  | { Error: string };

export interface Device {
  id: string;
  port_name: string;
  serial_number?: string;
  manufacturer?: string;
  product?: string;
  connection_state: ConnectionState;
  device_status?: DeviceStatus;
  last_seen: string; // ISO timestamp
}

export interface DeviceStatus {
  firmware_version: string;
  device_name: string;
  axes_count: number;
  buttons_count: number;
  connected: boolean;
}

export interface AxisConfig {
  id: number;
  name: string;
  min_value: number;
  max_value: number;
  center_value: number;
  deadzone: number;
  curve: string;
  inverted: boolean;
}

export interface ButtonConfig {
  id: number;
  name: string;
  function: string;
  enabled: boolean;
}

export interface ProfileConfig {
  id: string;
  name: string;
  description: string;
  axes: AxisConfig[];
  buttons: ButtonConfig[];
  created_at: string; // ISO timestamp
  modified_at: string; // ISO timestamp
}

export interface ProfileManager {
  profiles: ProfileConfig[];
  active_profile_id?: string;
}

// Utility types for connection states
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface ConnectionInfo {
  status: ConnectionStatus;
  device?: Device;
  error?: string;
}

// Binary configuration types
export interface StorageInfo {
  used_bytes: number;
  total_bytes: number;
  available_bytes: number;
  file_count: number;
  max_files: number;
}

export interface BinaryConfigHeader {
  magic: number;
  version: number;
  size: number;
  checksum: number;
}

export interface StoredAxisConfig {
  enabled: number;
  pin: number;
  min_value: number;
  max_value: number;
  filter_level: number;
  ewma_alpha: number;
  deadband: number;
  curve: number;
}

export interface BinaryConfig {
  header: BinaryConfigHeader;
  axes: StoredAxisConfig[];
  pin_map_count: number;
  logical_input_count: number;
  shift_reg_count: number;
  // Variable sections would be parsed separately
}

// Real configuration from parsed binary data
export interface ParsedAxisConfig {
  id: number;
  name: string;
  min_value: number;
  max_value: number;
  center_value: number;
  deadzone: number;
  curve: string;
  inverted: boolean;
}

export interface ParsedButtonConfig {
  id: number;      // The actual joyButtonID from firmware
  name: string;     // Descriptive name including source (Pin/Matrix/ShiftReg)
  function: 'normal' | 'momentary' | 'encoder_a' | 'encoder_b';  // Firmware behavior values
  enabled: boolean;
}

// Pin configuration types for RP2040 Pico pinout
export type PinFunction = 
  | 'PIN_UNUSED'
  | 'BTN'
  | 'BTN_ROW'
  | 'BTN_COL'
  | 'SHIFTREG_PL'
  | 'SHIFTREG_CLK'
  | 'SHIFTREG_QH'
  | 'ANALOG_AXIS'
  | 'SPI0_RX'
  | 'SPI0_CSn'
  | 'SPI0_SCK'
  | 'SPI0_TX'
  | 'SPI1_RX'
  | 'SPI1_CSn'
  | 'SPI1_SCK'
  | 'SPI1_TX'
  | 'I2C0_SDA'
  | 'I2C0_SCL'
  | 'I2C1_SDA'
  | 'I2C1_SCL'
  | 'UART0_TX'
  | 'UART0_RX'
  | 'UART1_TX'
  | 'UART1_RX'
  | 'PWM0_A'
  | 'PWM0_B'
  | 'PWM1_A'
  | 'PWM1_B'
  | 'PWM2_A'
  | 'PWM2_B'
  | 'PWM3_A'
  | 'PWM3_B'
  | 'PWM4_A'
  | 'PWM4_B'
  | 'PWM5_A'
  | 'PWM5_B'
  | 'PWM6_A'
  | 'PWM6_B'
  | 'PWM7_A'
  | 'PWM7_B';

export type PinType = 'GPIO' | 'ADC' | 'POWER' | 'GROUND' | 'CONTROL';

export interface PinConfiguration {
  pinNumber: number;
  gpioNumber?: number; // Only for GPIO pins
  pinType: PinType;
  defaultLabel: string; // e.g., "GP0", "VBUS", "GND"
  currentFunction: PinFunction;
  availableFunctions: PinFunction[];
  isConfigurable: boolean;
  description?: string;
}

export interface PinoutState {
  pins: Record<number, PinConfiguration>; // keyed by physical pin number
  lastModified?: Date;
}