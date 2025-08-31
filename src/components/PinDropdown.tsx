// Removed unused React default import (automatic JSX runtime)
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PinFunction, PinConfiguration } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PinDropdownProps {
  pinConfig: PinConfiguration;
  onFunctionChange: (pinNumber: number, newFunction: PinFunction) => void;
  size?: 'xs' | 'default';
}

// Map pin function categories to brand/status color utility classes
function functionColor(func: PinFunction): string {
  if (func === 'PIN_UNUSED') return 'bg-muted text-muted-foreground';
  if (func.startsWith('BTN')) return 'bg-brand-1 text-brand-1-foreground';
  if (func.startsWith('SHIFTREG')) return 'bg-brand-2 text-brand-2-foreground';
  if (func === 'ANALOG_AXIS') return 'bg-brand-3 text-brand-3-foreground';
  if (func.startsWith('SPI')) return 'bg-brand-4 text-brand-4-foreground';
  if (func.startsWith('I2C')) return 'bg-destructive text-destructive-foreground';
  if (func.startsWith('UART')) return 'bg-brand-4 text-brand-4-foreground';
  if (func.startsWith('PWM')) return 'bg-brand-5 text-brand-5-foreground';
  return 'bg-muted text-muted-foreground';
}

export function PinDropdown({ pinConfig, onFunctionChange, size = 'xs' }: PinDropdownProps) {
  const { pinNumber, currentFunction, availableFunctions, isConfigurable } = pinConfig;

  if (!isConfigurable) {
    return (
      <span className={cn('w-24 text-center rounded-sm px-2 py-1.5 text-xs font-mono font-semibold', functionColor('PIN_UNUSED'))}>{pinConfig.defaultLabel}</span>
    );
  }

  const handleValueChange = (value: string) => {
    onFunctionChange(pinNumber, value as PinFunction);
  };

  const getFunctionDisplayName = (func: PinFunction): string => {
    switch (func) {
      case 'PIN_UNUSED':
        return 'Unused';
      case 'BTN':
        return 'Button';
      case 'BTN_ROW':
        return 'Button Row';
      case 'BTN_COL':
        return 'Button Col';
      case 'SHIFTREG_PL':
        return 'Shift Reg PL';
      case 'SHIFTREG_CLK':
        return 'Shift Reg CLK';
      case 'SHIFTREG_QH':
        return 'Shift Reg QH';
      case 'ANALOG_AXIS':
        return 'Analog Axis';
      case 'SPI0_RX':
        return 'SPI0 RX';
      case 'SPI0_CSn':
        return 'SPI0 CS';
      case 'SPI0_SCK':
        return 'SPI0 SCK';
      case 'SPI0_TX':
        return 'SPI0 TX';
      case 'SPI1_RX':
        return 'SPI1 RX';
      case 'SPI1_CSn':
        return 'SPI1 CS';
      case 'SPI1_SCK':
        return 'SPI1 SCK';
      case 'SPI1_TX':
        return 'SPI1 TX';
      case 'I2C0_SDA':
        return 'I2C0 SDA';
      case 'I2C0_SCL':
        return 'I2C0 SCL';
      case 'I2C1_SDA':
        return 'I2C1 SDA';
      case 'I2C1_SCL':
        return 'I2C1 SCL';
      case 'UART0_TX':
        return 'UART0 TX';
      case 'UART0_RX':
        return 'UART0 RX';
      case 'UART1_TX':
        return 'UART1 TX';
      case 'UART1_RX':
        return 'UART1 RX';
      case 'PWM0_A':
        return 'PWM0 A';
      case 'PWM0_B':
        return 'PWM0 B';
      case 'PWM1_A':
        return 'PWM1 A';
      case 'PWM1_B':
        return 'PWM1 B';
      case 'PWM2_A':
        return 'PWM2 A';
      case 'PWM2_B':
        return 'PWM2 B';
      case 'PWM3_A':
        return 'PWM3 A';
      case 'PWM3_B':
        return 'PWM3 B';
      case 'PWM4_A':
        return 'PWM4 A';
      case 'PWM4_B':
        return 'PWM4 B';
      case 'PWM5_A':
        return 'PWM5 A';
      case 'PWM5_B':
        return 'PWM5 B';
      case 'PWM6_A':
        return 'PWM6 A';
      case 'PWM6_B':
        return 'PWM6 B';
      case 'PWM7_A':
        return 'PWM7 A';
      case 'PWM7_B':
        return 'PWM7 B';
      default:
        return func;
    }
  };

  return (
    <Select value={currentFunction} onValueChange={handleValueChange}>
      {(() => {
        const triggerClasses = functionColor(currentFunction);
        return (
          <SelectTrigger
            size={size}
            className={cn('w-36 font-mono font-semibold text-xs border-transparent focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-offset-0', triggerClasses)}
          >
            <SelectValue>{getFunctionDisplayName(currentFunction)}</SelectValue>
          </SelectTrigger>
        );
      })()}
      <SelectContent>
        {availableFunctions.map((func) => {
          const itemClasses = functionColor(func);
          return (
            <SelectItem
              key={func}
              value={func}
              className={cn('rounded-sm px-2 py-1.5 text-xs font-mono font-semibold flex items-center gap-2 cursor-pointer select-none', itemClasses)}
            >
              {getFunctionDisplayName(func)}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}