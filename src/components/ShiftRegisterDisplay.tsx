import { cn } from '@/lib/utils';
import { type ShiftRegisterState, RAW_STATE_CONFIG } from '@/lib/dev-config';
import { useRawStateConfig } from '@/contexts/RawStateConfigContext';

interface ShiftRegisterDisplayProps {
  registerState: ShiftRegisterState;
  labels?: string[];  // Labels for each bit (bit 0 to bit 7)
  className?: string;
}

/**
 * Visual display for 74HC165 shift register state
 * Shows individual bit states and overall register value
 */
export function ShiftRegisterDisplay({ 
  registerState, 
  labels = [], 
  className 
}: ShiftRegisterDisplayProps) {
  const { shiftRegPullMode } = useRawStateConfig();
  return (
    <div className={cn("shift-register-display p-3 bg-gray-50 rounded-lg border", className)}>
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-sm font-medium text-gray-700">
          Register {registerState.register_id}
        </h5>
        <div className="text-xs font-mono text-gray-500">
          0x{registerState.value.toString(16).toUpperCase().padStart(2, '0')}
        </div>
      </div>
      
      {/* Bit display - showing bits 7 to 0 (left to right) */}
      <div className="flex gap-1 justify-center">
        {Array.from({ length: 8 }, (_, i) => {
          const bitIndex = 7 - i; // Display from bit 7 to bit 0
          const physicalBit = (registerState.value >> bitIndex) & 1; // 1=HIGH
          const logicalActive = shiftRegPullMode === 'pull-up' ? physicalBit === 0 : physicalBit === 1;
          const label = labels[bitIndex];
          
          return (
            <div
              key={bitIndex}
              className={cn(
                "flex flex-col items-center justify-center",
                "w-10 h-12 rounded text-xs font-medium transition-all",
                "border shadow-sm",
                logicalActive 
                  ? "bg-blue-500 text-white border-blue-600" 
                  : "bg-white text-gray-600 border-gray-300"
              )}
              title={`Bit ${bitIndex}: Physical ${physicalBit ? 'HIGH' : 'LOW'} | Logical ${logicalActive ? 'ACTIVE' : 'inactive'} (${shiftRegPullMode})${label ? ` (${label})` : ''}`}
            >
              <span className="font-bold text-sm">{logicalActive ? 1 : 0}</span>
              <span className="text-[10px] opacity-80 mt-1">B{bitIndex}</span>
              {label && (
                <span className="text-[9px] opacity-70 truncate max-w-full px-1">
                  {label}
                </span>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Binary representation */}
      <div className="mt-2 text-center">
        <div className="text-xs font-mono text-gray-600" title={`Logical pattern (${shiftRegPullMode})`}>
          {registerState.value
            .toString(2)
            .padStart(8, '0')
            .split('')
            .map(b => (shiftRegPullMode === 'pull-up' ? (b === '1' ? '0' : '1') : b))
            .join(' ')}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Decimal: {registerState.value}
        </div>
      </div>
      
      {RAW_STATE_CONFIG.showTimestamps && (
        <div className="mt-2 text-xs text-gray-400 text-center">
          {new Date(registerState.timestamp / 1000).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

// Display for multiple shift registers
interface ShiftRegisterArrayProps {
  shiftRegStates: ShiftRegisterState[];
  registerLabels?: Record<number, string[]>;  // Labels per register
  className?: string;
}

export function ShiftRegisterArray({ 
  shiftRegStates, 
  registerLabels = {},
  className 
}: ShiftRegisterArrayProps) {
  if (shiftRegStates.length === 0) {
    return (
      <div className={cn("shift-register-array", className)}>
        <div className="text-center text-gray-500 py-4">
          <p className="text-sm">No shift registers configured</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("shift-register-array space-y-3", className)}>
      {shiftRegStates
        .sort((a, b) => a.register_id - b.register_id) // Sort by register ID
        .map((regState) => (
          <ShiftRegisterDisplay
            key={regState.register_id}
            registerState={regState}
            labels={registerLabels[regState.register_id]}
          />
        ))}
        
      {/* Summary */}
      <div className="mt-4 p-2 bg-gray-100 rounded text-xs text-gray-600">
        <div className="flex justify-between items-center">
          <span>Total Registers: {shiftRegStates.length}</span>
          <span>
            Active Bits: {shiftRegStates.reduce((sum, reg) => {
              // Count set bits
              let count = 0;
              let value = reg.value;
              while (value) {
                count += value & 1;
                value >>= 1;
              }
              return sum + count;
            }, 0)}
          </span>
        </div>
      </div>
    </div>
  );
}

// Compact shift register display for small spaces
interface CompactShiftRegDisplayProps {
  shiftRegStates: ShiftRegisterState[];
  className?: string;
}

export function CompactShiftRegDisplay({ shiftRegStates, className }: CompactShiftRegDisplayProps) {
  if (shiftRegStates.length === 0) {
    return (
      <div className={cn("compact-shift-reg-display", className)}>
        <span className="text-gray-500 text-sm">No shift registers</span>
      </div>
    );
  }

  const totalBits = shiftRegStates.reduce((sum, reg) => {
    let count = 0;
    let value = reg.value;
    while (value) {
      count += value & 1;
      value >>= 1;
    }
    return sum + count;
  }, 0);

  return (
    <div className={cn("compact-shift-reg-display flex items-center gap-2", className)}>
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 rounded bg-blue-500"></div>
        <span className="text-sm font-medium">{totalBits}</span>
      </div>
      <span className="text-xs text-gray-500">bits active</span>
      <span className="text-xs text-gray-400">({shiftRegStates.length} regs)</span>
    </div>
  );
}