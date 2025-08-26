import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from './Badge';
import type { BadgeVariant } from './Badge';
import { RAW_STATE_CONFIG } from '@/lib/dev-config';
import { useRawStateConfig } from '@/contexts/RawStateConfigContext';

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

  // Map mode/state to variants
  const resolveVariant = (): { variant: BadgeVariant; inactive?: boolean } => {
    const activeVariant: Record<RawStateBadgeMode, BadgeVariant> = {
      gpio: 'green',
      matrix: 'green',
      shiftreg: 'blue'
    };
    if (state === 'inactive') {
      return { variant: 'gray', inactive: true };
    }
    return { variant: activeVariant[mode] };
  };
  const { variant, inactive } = resolveVariant();

  return (
    <Badge
      size="md"
      variant={variant}
      inactive={inactive}
      className={cn(isChanging && '', className)}
      title={tooltip}
    >
      {label}
    </Badge>
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
  const { gpioPullMode } = useRawStateConfig();
  const physicalHigh = (gpioMask & (1 << pin)) !== 0; // voltage level
  // Interpretation: if pull-up, logical active when LOW (0V). If pull-down, logical active when HIGH (3.3V)
  const isHigh = gpioPullMode === 'pull-up' ? !physicalHigh : physicalHigh;
  const displayLabel = label || pin.toString();
  const tooltip = `GPIO ${pin}: ${physicalHigh ? 'HIGH (3.3V)' : 'LOW (0V)'} | Logical: ${isHigh ? 'ACTIVE' : 'inactive'} (${gpioPullMode})${label ? ` (${label})` : ''}`;

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
  const { shiftRegPullMode } = useRawStateConfig();
  const bitValue = (registerValue >> bitIndex) & 1; // physical level (1=HIGH)
  const isHigh = shiftRegPullMode === 'pull-up' ? bitValue === 0 : bitValue === 1; // logical active
  const displayLabel = label || bitIndex.toString();
  const tooltip = `Register ${registerId}, Bit ${bitIndex}: ${bitValue ? 'HIGH' : 'LOW'} | Logical: ${isHigh ? 'ACTIVE' : 'inactive'} (${shiftRegPullMode})${label ? ` (${label})` : ''}`;

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