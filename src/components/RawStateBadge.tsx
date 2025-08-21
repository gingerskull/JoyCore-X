import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { RAW_STATE_CONFIG } from '@/lib/dev-config';

type RawStateBadgeMode = 'gpio' | 'matrix' | 'shiftreg';
type RawStateBadgeState = 'inactive' | 'active';

interface RawStateBadgeProps {
  mode: RawStateBadgeMode;
  state: RawStateBadgeState;
  label: string;
  tooltip: string;
  className?: string;
}

export function RawStateBadge({ mode, state, label, tooltip, className }: RawStateBadgeProps) {
  const [isChanging, setIsChanging] = useState(false);
  const prevState = useRef(state);

  // Handle state change animation
  useEffect(() => {
    if (RAW_STATE_CONFIG.highlightChanges && prevState.current !== state) {
      setIsChanging(true);
      const timer = setTimeout(() => {
        setIsChanging(false);
      }, RAW_STATE_CONFIG.changeHighlightDuration);
      
      prevState.current = state;
      return () => clearTimeout(timer);
    }
  }, [state]);

  // Color schemes for different modes
  const colorSchemes = {
    gpio: {
      active: "bg-green-500 text-white border border-green-400",
      inactive: "bg-gray-600 text-white border border-gray-500"
    },
    matrix: {
      active: "bg-green-500 text-white border border-green-400",
      inactive: "bg-gray-600 text-white border border-gray-500"
    },
    shiftreg: {
      active: "bg-blue-500 text-white border border-blue-400",
      inactive: "bg-gray-600 text-white border border-gray-500"
    }
  };

  return (
    <div
      className={cn(
        "w-12 h-12 rounded flex items-center justify-center text-[12px] font-mono font-bold transition-colors duration-100 select-none",
        colorSchemes[mode][state],
        isChanging && "ring-2 ring-yellow-400",
        className
      )}
      title={tooltip}
    >
      {label}
    </div>
  );
}

// GPIO Pin Badge - shows pin number, state from bitmask
interface GpioPinBadgeProps {
  pin: number;
  gpioMask: number;
  label?: string;
  className?: string;
}

export function GpioPinBadge({ pin, gpioMask, label, className }: GpioPinBadgeProps) {
  const isHigh = (gpioMask & (1 << pin)) !== 0;
  const displayLabel = label || pin.toString();
  const tooltip = `GPIO ${pin}: ${isHigh ? 'HIGH (3.3V)' : 'LOW (0V)'}${label ? ` (${label})` : ''}`;

  return (
    <RawStateBadge
      mode="gpio"
      state={isHigh ? 'active' : 'inactive'}
      label={displayLabel.replace(/[^0-9]/g, '') || pin.toString()}
      tooltip={tooltip}
      className={className}
    />
  );
}

// Matrix Connection Badge - shows row,col position and connection state
interface MatrixConnectionBadgeProps {
  row: number;
  col: number;
  isConnected: boolean;
  className?: string;
}

export function MatrixConnectionBadge({ row, col, isConnected, className }: MatrixConnectionBadgeProps) {
  const label = `${row},${col}`;
  const tooltip = `Row ${row}, Col ${col}: ${isConnected ? 'Connected' : 'Open'}`;

  return (
    <RawStateBadge
      mode="matrix"
      state={isConnected ? 'active' : 'inactive'}
      label={`${row}${col}`} // Compact display: "01" instead of "0,1"
      tooltip={tooltip}
      className={className}
    />
  );
}

// Shift Register Bit Badge - shows bit number and state from register value
interface ShiftRegBitBadgeProps {
  registerId: number;
  bitIndex: number;
  registerValue: number;
  label?: string;
  className?: string;
}

export function ShiftRegBitBadge({ registerId, bitIndex, registerValue, label, className }: ShiftRegBitBadgeProps) {
  const bitValue = (registerValue >> bitIndex) & 1;
  const isHigh = bitValue === 1;
  const displayLabel = label || bitIndex.toString();
  const tooltip = `Register ${registerId}, Bit ${bitIndex}: ${isHigh ? 'HIGH' : 'LOW'}${label ? ` (${label})` : ''}`;

  return (
    <RawStateBadge
      mode="shiftreg"
      state={isHigh ? 'active' : 'inactive'}
      label={displayLabel.replace(/[^0-9]/g, '') || bitIndex.toString()}
      tooltip={tooltip}
      className={className}
    />
  );
}