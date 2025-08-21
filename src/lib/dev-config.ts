// Developer configuration for raw hardware state display
// Change these constants to control the raw state display behavior

export const RAW_STATE_CONFIG = {
  // Display mode control - change this to switch between modes (no UI control)
  // HID: Show only HID button states, Raw: Show only raw hardware states
  displayMode: 'raw' as 'hid' | 'raw',
  
  // Performance tuning
  pollingRate: 50,        // milliseconds between polls
  
  // Visual options
  showVoltageLabels: true,
  showGpioNumbers: true,
  highlightChanges: true,
  changeHighlightDuration: 100, // ms
  
  // Debug options
  logStateChanges: false,
  showTimestamps: true,
  enableConsoleAPI: true,  // Enables window.__rawState for debugging
  enableRawEventLogging: true, // Enables per-event console timing logs for raw monitoring
} as const;

// Types for raw state data
export interface RawGpioStates {
  gpio_mask: number;
  timestamp: number;
}

export interface MatrixConnection {
  row: number;
  col: number;
  is_connected: boolean;
}

export interface MatrixState {
  connections: MatrixConnection[];
  timestamp: number;
}

export interface ShiftRegisterState {
  register_id: number;
  value: number;
  timestamp: number;
}

export interface RawHardwareState {
  gpio?: RawGpioStates;
  matrix?: MatrixState;
  shift_registers: ShiftRegisterState[];
}