import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PinFunction, PinConfiguration } from '@/lib/types';

interface PinDropdownProps {
  pinConfig: PinConfiguration;
  onFunctionChange: (pinNumber: number, newFunction: PinFunction) => void;
  size?: 'xs' | 'default';
}

export function PinDropdown({ pinConfig, onFunctionChange, size = 'xs' }: PinDropdownProps) {
  const { pinNumber, currentFunction, availableFunctions, isConfigurable } = pinConfig;

  if (!isConfigurable) {
    return (
      <div className="p-1 text-xs font-mono text-muted-foreground bg-muted rounded">
        {pinConfig.defaultLabel}
      </div>
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

  const getFunctionColor = (func: PinFunction): string => {
    if (func === 'PIN_UNUSED') return 'text-muted-foreground';
    if (func.startsWith('BTN')) return 'text-blue-600';
    if (func.startsWith('SHIFTREG')) return 'text-purple-600';
    if (func === 'ANALOG_AXIS') return 'text-green-600';
    if (func.startsWith('SPI')) return 'text-orange-600';
    if (func.startsWith('I2C')) return 'text-red-600';
    if (func.startsWith('UART')) return 'text-yellow-600';
    if (func.startsWith('PWM')) return 'text-pink-600';
    return 'text-foreground';
  };

  return (
    <Select value={currentFunction} onValueChange={handleValueChange}>
      <SelectTrigger size={size} className={`w-36 ${getFunctionColor(currentFunction)}`}>
        <SelectValue>
          <span className="text-xs font-mono">
            {getFunctionDisplayName(currentFunction)}
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {availableFunctions.map((func) => (
          <SelectItem key={func} value={func}>
            <span className={`text-xs font-mono ${getFunctionColor(func)}`}>
              {getFunctionDisplayName(func)}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}