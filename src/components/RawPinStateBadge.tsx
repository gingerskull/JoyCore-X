import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from './Badge';
import { RAW_STATE_CONFIG } from '@/lib/dev-config';
import { useRawStateConfig } from '@/contexts/RawStateConfigContext';

interface RawPinStateBadgeProps {
  gpio: number;
  state: boolean;
  label?: string;
  showVoltage?: boolean;
  className?: string;
}

/**
 * Visual indicator for raw GPIO pin state
 * Shows HIGH (3.3V) in success (green), LOW (0V) in muted/gray
 * Includes change highlighting animation
 */
export function RawPinStateBadge({ 
  gpio, 
  state, 
  label, 
  showVoltage = RAW_STATE_CONFIG.showVoltageLabels,
  className 
}: RawPinStateBadgeProps) {
  const { gpioPullMode } = useRawStateConfig();
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

  // Physical voltage: state (true=HIGH)
  // Logical active depends on pull mode: pull-up => LOW means button pressed/active
  const logicalActive = gpioPullMode === 'pull-up' ? !state : state;

  return (
    <Badge
      size="lg"
      variant={logicalActive ? 'success' : 'gray'}
      className={cn(
        'raw-pin-badge min-w-[80px] shadow-sm transition-transform',
        isChanging && 'ring-2 ring-brand-4/70 animate-pulse scale-105',
        className
      )}
      title={`GPIO ${gpio}: Physical ${state ? 'HIGH (3.3V)' : 'LOW (0V)'} | Logical ${logicalActive ? 'ACTIVE' : 'inactive'} (${gpioPullMode})`}
    >
      <div className="flex flex-col items-center gap-1">
        {RAW_STATE_CONFIG.showGpioNumbers && (
          <span className="font-bold text-xs">GPIO {gpio}</span>
        )}
        
        {label && (
          <span className="text-xs opacity-90 truncate max-w-full">
            {label}
          </span>
        )}
        
        <div className="flex items-center gap-1">
          <span className="font-mono font-bold" title={`Logical (${gpioPullMode}) interpretation`}>
            {logicalActive ? 'ACTIVE' : 'idle'}
          </span>
          
          {showVoltage && (
            <span className="text-xs">
              {state ? '⚡ 3.3V' : '○ 0V'}
            </span>
          )}
        </div>
      </div>
    </Badge>
  );
}

// Component for displaying multiple GPIO pins in a grid
interface GpioPinGridProps {
  gpioMask: number;
  pinLabels?: Record<number, string>;
  activePins?: number[];  // Only show these pins if specified
  className?: string;
}

export function GpioPinGrid({ 
  gpioMask, 
  pinLabels = {}, 
  activePins,
  className 
}: GpioPinGridProps) {
  // Determine which pins to show
  const pinsToShow = activePins || Array.from({ length: 30 }, (_, i) => i);

  return (
    <div className={cn("gpio-pin-grid", className)}>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
        {pinsToShow.map(pin => {
          const physicalHigh = (gpioMask & (1 << pin)) !== 0;
          const label = pinLabels[pin];
          return (
            <RawPinStateBadge
              key={pin}
              gpio={pin}
              state={physicalHigh}
              label={label}
              className="text-xs px-2 py-1"
            />
          );
        })}
      </div>
    </div>
  );
}