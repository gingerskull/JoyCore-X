import { useState, useCallback, useEffect } from 'react';
import { Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PicoSVG } from './PicoSVG';
import type { PinConfiguration, PinFunction, PinoutState } from '@/lib/types';

interface DevicePinAssignments {
  [gpioPin: number]: PinFunction;
}

interface PinoutConfigurationProps {
  devicePinAssignments?: DevicePinAssignments;
}

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

  // Pin-specific peripheral functions based on RP2040 pinout
  const getPinFunctions = (gpioNumber: number): PinFunction[] => {
    const baseFunctions = [...digitalPinFunctions];
    
    switch (gpioNumber) {
      case 0: return [...baseFunctions, 'SPI0_RX', 'I2C0_SDA', 'UART0_TX', 'PWM0_A'];
      case 1: return [...baseFunctions, 'SPI0_CSn', 'I2C0_SCL', 'UART0_RX', 'PWM0_B'];
      case 2: return [...baseFunctions, 'SPI0_SCK', 'I2C1_SDA', 'PWM1_A'];
      case 3: return [...baseFunctions, 'SPI0_TX', 'I2C1_SCL', 'PWM1_B'];
      case 4: return [...baseFunctions, 'SPI0_RX', 'I2C0_SDA', 'UART1_TX', 'PWM2_A'];
      case 5: return [...baseFunctions, 'SPI0_CSn', 'I2C0_SCL', 'UART1_RX', 'PWM2_B'];
      case 6: return [...baseFunctions, 'SPI0_SCK', 'I2C1_SDA', 'PWM3_A'];
      case 7: return [...baseFunctions, 'SPI0_TX', 'I2C1_SCL', 'PWM3_B'];
      case 8: return [...baseFunctions, 'SPI1_RX', 'I2C0_SDA', 'UART1_TX', 'PWM4_A'];
      case 9: return [...baseFunctions, 'SPI1_CSn', 'I2C0_SCL', 'UART1_RX', 'PWM4_B'];
      case 10: return [...baseFunctions, 'SPI1_SCK', 'I2C1_SDA', 'PWM5_A'];
      case 11: return [...baseFunctions, 'SPI1_TX', 'I2C1_SCL', 'PWM5_B'];
      case 12: return [...baseFunctions, 'SPI1_RX', 'I2C0_SDA', 'UART0_TX', 'PWM6_A'];
      case 13: return [...baseFunctions, 'SPI1_CSn', 'I2C0_SCL', 'UART0_RX', 'PWM6_B'];
      case 14: return [...baseFunctions, 'SPI1_SCK', 'I2C1_SDA', 'PWM7_A'];
      case 15: return [...baseFunctions, 'SPI1_TX', 'I2C1_SCL', 'PWM7_B'];
      case 16: return [...baseFunctions, 'SPI0_RX', 'I2C0_SDA', 'UART0_TX', 'PWM0_A'];
      case 17: return [...baseFunctions, 'SPI0_CSn', 'I2C0_SCL', 'UART0_RX', 'PWM0_B'];
      case 18: return [...baseFunctions, 'SPI0_SCK', 'I2C1_SDA', 'PWM1_A'];
      case 19: return [...baseFunctions, 'SPI0_TX', 'I2C1_SCL', 'PWM1_B'];
      case 20: return [...baseFunctions, 'SPI0_RX', 'I2C0_SDA', 'UART1_TX', 'PWM2_A'];
      case 21: return [...baseFunctions, 'SPI0_CSn', 'I2C0_SCL', 'UART1_RX', 'PWM2_B'];
      case 22: return [...baseFunctions, 'SPI0_SCK', 'I2C1_SDA', 'PWM3_A'];
      case 26: return [...analogPinFunctions, 'SPI1_SCK', 'I2C1_SDA', 'PWM5_A'];
      case 27: return [...analogPinFunctions, 'SPI1_TX', 'I2C1_SCL', 'PWM5_B'];
      case 28: return [...analogPinFunctions, 'SPI1_RX', 'I2C0_SDA', 'UART0_TX', 'PWM6_A'];
      default: return baseFunctions;
    }
  };

  return {
    1: { pinNumber: 1, gpioNumber: 0, pinType: 'GPIO', defaultLabel: 'GP0', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(0), isConfigurable: true },
    2: { pinNumber: 2, gpioNumber: 1, pinType: 'GPIO', defaultLabel: 'GP1', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(1), isConfigurable: true },
    3: { pinNumber: 3, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    4: { pinNumber: 4, gpioNumber: 2, pinType: 'GPIO', defaultLabel: 'GP2', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(2), isConfigurable: true },
    5: { pinNumber: 5, gpioNumber: 3, pinType: 'GPIO', defaultLabel: 'GP3', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(3), isConfigurable: true },
    6: { pinNumber: 6, gpioNumber: 4, pinType: 'GPIO', defaultLabel: 'GP4', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(4), isConfigurable: true },
    7: { pinNumber: 7, gpioNumber: 5, pinType: 'GPIO', defaultLabel: 'GP5', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(5), isConfigurable: true },
    8: { pinNumber: 8, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    9: { pinNumber: 9, gpioNumber: 6, pinType: 'GPIO', defaultLabel: 'GP6', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(6), isConfigurable: true },
    10: { pinNumber: 10, gpioNumber: 7, pinType: 'GPIO', defaultLabel: 'GP7', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(7), isConfigurable: true },
    11: { pinNumber: 11, gpioNumber: 8, pinType: 'GPIO', defaultLabel: 'GP8', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(8), isConfigurable: true },
    12: { pinNumber: 12, gpioNumber: 9, pinType: 'GPIO', defaultLabel: 'GP9', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(9), isConfigurable: true },
    13: { pinNumber: 13, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    14: { pinNumber: 14, gpioNumber: 10, pinType: 'GPIO', defaultLabel: 'GP10', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(10), isConfigurable: true },
    15: { pinNumber: 15, gpioNumber: 11, pinType: 'GPIO', defaultLabel: 'GP11', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(11), isConfigurable: true },
    16: { pinNumber: 16, gpioNumber: 12, pinType: 'GPIO', defaultLabel: 'GP12', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(12), isConfigurable: true },
    17: { pinNumber: 17, gpioNumber: 13, pinType: 'GPIO', defaultLabel: 'GP13', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(13), isConfigurable: true },
    18: { pinNumber: 18, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    19: { pinNumber: 19, gpioNumber: 14, pinType: 'GPIO', defaultLabel: 'GP14', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(14), isConfigurable: true },
    20: { pinNumber: 20, gpioNumber: 15, pinType: 'GPIO', defaultLabel: 'GP15', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(15), isConfigurable: true },
    21: { pinNumber: 21, gpioNumber: 16, pinType: 'GPIO', defaultLabel: 'GP16', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(16), isConfigurable: true },
    22: { pinNumber: 22, gpioNumber: 17, pinType: 'GPIO', defaultLabel: 'GP17', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(17), isConfigurable: true },
    23: { pinNumber: 23, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    24: { pinNumber: 24, gpioNumber: 18, pinType: 'GPIO', defaultLabel: 'GP18', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(18), isConfigurable: true },
    25: { pinNumber: 25, gpioNumber: 19, pinType: 'GPIO', defaultLabel: 'GP19', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(19), isConfigurable: true },
    26: { pinNumber: 26, gpioNumber: 20, pinType: 'GPIO', defaultLabel: 'GP20', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(20), isConfigurable: true },
    27: { pinNumber: 27, gpioNumber: 21, pinType: 'GPIO', defaultLabel: 'GP21', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(21), isConfigurable: true },
    28: { pinNumber: 28, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    29: { pinNumber: 29, gpioNumber: 22, pinType: 'GPIO', defaultLabel: 'GP22', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(22), isConfigurable: true },
    30: { pinNumber: 30, pinType: 'CONTROL', defaultLabel: 'RUN', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    31: { pinNumber: 31, gpioNumber: 26, pinType: 'ADC', defaultLabel: 'GP26/ADC0', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(26), isConfigurable: true },
    32: { pinNumber: 32, gpioNumber: 27, pinType: 'ADC', defaultLabel: 'GP27/ADC1', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(27), isConfigurable: true },
    33: { pinNumber: 33, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    34: { pinNumber: 34, gpioNumber: 28, pinType: 'ADC', defaultLabel: 'GP28/ADC2', currentFunction: 'PIN_UNUSED', availableFunctions: getPinFunctions(28), isConfigurable: true },
    35: { pinNumber: 35, pinType: 'POWER', defaultLabel: 'ADC_VREF', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    36: { pinNumber: 36, pinType: 'POWER', defaultLabel: '3V3(OUT)', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    37: { pinNumber: 37, pinType: 'POWER', defaultLabel: '3V3_EN', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    38: { pinNumber: 38, pinType: 'GROUND', defaultLabel: 'GND', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    39: { pinNumber: 39, pinType: 'POWER', defaultLabel: 'VSYS', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
    40: { pinNumber: 40, pinType: 'POWER', defaultLabel: 'VBUS', currentFunction: 'PIN_UNUSED', availableFunctions: [], isConfigurable: false },
  };
};

// Merge device pin assignments with default configurations
const mergePinConfigurations = (
  defaults: Record<number, PinConfiguration>,
  deviceAssignments?: DevicePinAssignments
): Record<number, PinConfiguration> => {
  if (!deviceAssignments) {
    return defaults;
  }

  const merged = { ...defaults };

  // Apply device pin assignments to the corresponding physical pins
  Object.entries(deviceAssignments).forEach(([gpioPin, pinFunction]) => {
    const gpioNumber = parseInt(gpioPin, 10);
    
    // Find the physical pin that corresponds to this GPIO
    Object.keys(merged).forEach(physicalPinStr => {
      const physicalPin = parseInt(physicalPinStr, 10);
      const pinConfig = merged[physicalPin];
      
      // Check if this physical pin corresponds to the GPIO pin
      if (pinConfig.gpioNumber === gpioNumber && pinConfig.isConfigurable) {
        // Verify the pin function is available for this pin
        if (pinConfig.availableFunctions.includes(pinFunction)) {
          merged[physicalPin] = {
            ...pinConfig,
            currentFunction: pinFunction,
          };
        }
      }
    });
  });

  return merged;
};

export function PinoutConfiguration({ devicePinAssignments }: PinoutConfigurationProps) {
  const [pinoutState, setPinoutState] = useState<PinoutState>({
    pins: createDefaultPinConfigurations(),
    lastModified: undefined,
  });
  const [showLegend, setShowLegend] = useState(false);

  // Update pin configuration when device assignments change
  useEffect(() => {
    const defaultPins = createDefaultPinConfigurations();
    const mergedPins = mergePinConfigurations(defaultPins, devicePinAssignments);
    
    setPinoutState({
      pins: mergedPins,
      lastModified: devicePinAssignments ? new Date() : undefined,
    });
  }, [devicePinAssignments]);

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
              <div className="space-y-2">
                <Badge variant="blue" className="font-semibold">Button Functions</Badge>
                <div className="space-y-1 text-xs">
                  <div>BTN - Single button input</div>
                  <div>BTN_ROW - Button matrix row</div>
                  <div>BTN_COL - Button matrix column</div>
                </div>
              </div>
              <div className="space-y-2">
                <Badge variant="purple" className="font-semibold">Shift Register</Badge>
                <div className="space-y-1 text-xs">
                  <div>SHIFTREG_PL - Parallel load</div>
                  <div>SHIFTREG_CLK - Clock</div>
                  <div>SHIFTREG_QH - Serial data out</div>
                </div>
              </div>
              <div className="space-y-2">
                <Badge variant="teal" className="font-semibold">Analog</Badge>
                <div className="space-y-1 text-xs">
                  <div>ANALOG_AXIS - Analog axis input</div>
                </div>
              </div>
              <div className="space-y-2">
                <Badge variant="yellow" className="font-semibold">Communication</Badge>
                <div className="space-y-1 text-xs">
                  <div><Badge variant="yellow" className="mr-2">SPI</Badge>Serial Peripheral Interface</div>
                  <div><Badge variant="red" className="mr-2">I2C</Badge>Inter-Integrated Circuit</div>
                  <div><Badge variant="yellow" className="mr-2">UART</Badge>Serial communication</div>
                  <div><Badge variant="pink" className="mr-2">PWM</Badge>Pulse Width Modulation</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}