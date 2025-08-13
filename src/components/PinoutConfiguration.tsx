import React, { useState, useCallback } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PicoSVG } from './PicoSVG';
import type { PinConfiguration, PinFunction, PinoutState } from '@/lib/types';

// Default pin configuration data for RP2040 Pico
const createDefaultPinConfigurations = (): Record<number, PinConfiguration> => {
  const digitalPinFunctions: PinFunction[] = [
    'PIN_UNUSED',
    'BTN',
    'BTN_ROW',
    'BTN_COL',
    'SHIFTREG_PL',
    'SHIFTREG_CLK',
    'SHIFTREG_QH',
  ];

  const analogPinFunctions: PinFunction[] = [
    ...digitalPinFunctions,
    'ANALOG_AXIS',
  ];

  const spiI2cUartPwmFunctions: PinFunction[] = [
    'SPI0_RX', 'SPI0_CSn', 'SPI0_SCK', 'SPI0_TX',
    'SPI1_RX', 'SPI1_CSn', 'SPI1_SCK', 'SPI1_TX',
    'I2C0_SDA', 'I2C0_SCL', 'I2C1_SDA', 'I2C1_SCL',
    'UART0_TX', 'UART0_RX', 'UART1_TX', 'UART1_RX',
    'PWM0_A', 'PWM0_B', 'PWM1_A', 'PWM1_B',
    'PWM2_A', 'PWM2_B', 'PWM3_A', 'PWM3_B',
    'PWM4_A', 'PWM4_B', 'PWM5_A', 'PWM5_B',
    'PWM6_A', 'PWM6_B', 'PWM7_A', 'PWM7_B',
  ];

  return {
    1: { pinNumber: 1, gpioNumber: 0, pinType: 'GPIO', defaultLabel: 'GP0', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    2: { pinNumber: 2, gpioNumber: 1, pinType: 'GPIO', defaultLabel: 'GP1', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    3: { pinNumber: 3, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    4: { pinNumber: 4, gpioNumber: 2, pinType: 'GPIO', defaultLabel: 'GP2', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    5: { pinNumber: 5, gpioNumber: 3, pinType: 'GPIO', defaultLabel: 'GP3', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    6: { pinNumber: 6, gpioNumber: 4, pinType: 'GPIO', defaultLabel: 'GP4', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    7: { pinNumber: 7, gpioNumber: 5, pinType: 'GPIO', defaultLabel: 'GP5', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    8: { pinNumber: 8, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    9: { pinNumber: 9, gpioNumber: 6, pinType: 'GPIO', defaultLabel: 'GP6', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    10: { pinNumber: 10, gpioNumber: 7, pinType: 'GPIO', defaultLabel: 'GP7', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    11: { pinNumber: 11, gpioNumber: 8, pinType: 'GPIO', defaultLabel: 'GP8', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    12: { pinNumber: 12, gpioNumber: 9, pinType: 'GPIO', defaultLabel: 'GP9', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    13: { pinNumber: 13, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    14: { pinNumber: 14, gpioNumber: 10, pinType: 'GPIO', defaultLabel: 'GP10', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    15: { pinNumber: 15, gpioNumber: 11, pinType: 'GPIO', defaultLabel: 'GP11', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    16: { pinNumber: 16, gpioNumber: 12, pinType: 'GPIO', defaultLabel: 'GP12', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    17: { pinNumber: 17, gpioNumber: 13, pinType: 'GPIO', defaultLabel: 'GP13', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    18: { pinNumber: 18, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    19: { pinNumber: 19, gpioNumber: 14, pinType: 'GPIO', defaultLabel: 'GP14', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    20: { pinNumber: 20, gpioNumber: 15, pinType: 'GPIO', defaultLabel: 'GP15', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    21: { pinNumber: 21, gpioNumber: 16, pinType: 'GPIO', defaultLabel: 'GP16', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    22: { pinNumber: 22, gpioNumber: 17, pinType: 'GPIO', defaultLabel: 'GP17', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    23: { pinNumber: 23, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    24: { pinNumber: 24, gpioNumber: 18, pinType: 'GPIO', defaultLabel: 'GP18', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    25: { pinNumber: 25, gpioNumber: 19, pinType: 'GPIO', defaultLabel: 'GP19', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    26: { pinNumber: 26, gpioNumber: 20, pinType: 'GPIO', defaultLabel: 'GP20', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    27: { pinNumber: 27, gpioNumber: 21, pinType: 'GPIO', defaultLabel: 'GP21', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    28: { pinNumber: 28, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    29: { pinNumber: 29, gpioNumber: 22, pinType: 'GPIO', defaultLabel: 'GP22', currentFunction: 'PIN_UNUSED', availableFunctions: [...digitalPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    30: { pinNumber: 30, pinType: 'CONTROL', defaultLabel: 'RUN', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    31: { pinNumber: 31, gpioNumber: 26, pinType: 'ADC', defaultLabel: 'GP26/ADC0', currentFunction: 'PIN_UNUSED', availableFunctions: [...analogPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    32: { pinNumber: 32, gpioNumber: 27, pinType: 'ADC', defaultLabel: 'GP27/ADC1', currentFunction: 'PIN_UNUSED', availableFunctions: [...analogPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    33: { pinNumber: 33, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    34: { pinNumber: 34, gpioNumber: 28, pinType: 'ADC', defaultLabel: 'GP28/ADC2', currentFunction: 'PIN_UNUSED', availableFunctions: [...analogPinFunctions, ...spiI2cUartPwmFunctions], isConfigurable: true },
    35: { pinNumber: 35, pinType: 'POWER', defaultLabel: 'ADC_VREF', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    36: { pinNumber: 36, pinType: 'POWER', defaultLabel: '3V3(OUT)', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    37: { pinNumber: 37, pinType: 'POWER', defaultLabel: '3V3_EN', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    38: { pinNumber: 38, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    39: { pinNumber: 39, pinType: 'POWER', defaultLabel: 'VSYS', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    40: { pinNumber: 40, pinType: 'POWER', defaultLabel: 'VBUS', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
  };
};

export function PinoutConfiguration() {
  const [pinoutState, setPinoutState] = useState<PinoutState>({
    pins: createDefaultPinConfigurations(),
    lastModified: undefined,
  });
  const [showLegend, setShowLegend] = useState(false);

  const handlePinFunctionChange = useCallback((pinNumber: number, newFunction: PinFunction) => {
    setPinoutState(prev => ({
      pins: {
        ...prev.pins,
        [pinNumber]: {
          ...prev.pins[pinNumber],
          currentFunction: newFunction,
        },
      },
      lastModified: new Date(),
    }));
  }, []);

  return (
    <div className="h-full flex flex-col">
      {/* Pin Configuration Diagram - Full height */}
      <Card className="flex-1">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">RP2040 Pico Pinout</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLegend(!showLegend)}
            >
              <Info className="w-4 h-4 mr-2" />
              {showLegend ? 'Hide Legend' : 'Show Legend'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col p-4">
          <div className="flex-1 flex items-center justify-center">
            <PicoSVG
              pinConfigurations={pinoutState.pins}
              onPinFunctionChange={handlePinFunctionChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Collapsible Legend */}
      {showLegend && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-sm">Pin Function Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="space-y-1">
                <div className="font-semibold text-blue-600">Button Functions</div>
                <div>BTN - Single button input</div>
                <div>BTN_ROW - Button matrix row</div>
                <div>BTN_COL - Button matrix column</div>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-purple-600">Shift Register</div>
                <div>SHIFTREG_PL - Parallel load</div>
                <div>SHIFTREG_CLK - Clock</div>
                <div>SHIFTREG_QH - Serial data out</div>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-green-600">Analog</div>
                <div>ANALOG_AXIS - Analog axis input</div>
              </div>
              <div className="space-y-1">
                <div className="font-semibold text-orange-600">Communication</div>
                <div>SPI - Serial Peripheral Interface</div>
                <div className="text-red-600">I2C - Inter-Integrated Circuit</div>
                <div className="text-yellow-600">UART - Serial communication</div>
                <div className="text-pink-600">PWM - Pulse Width Modulation</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}