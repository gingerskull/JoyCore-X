import React from 'react';
import { PinDropdown } from './PinDropdown';
import { Badge } from '@/components/ui/badge';
import type { PinConfiguration, PinFunction } from '@/lib/types';

interface PicoSVGProps {
  pinConfigurations: Record<number, PinConfiguration>;
  onPinFunctionChange: (pinNumber: number, newFunction: PinFunction) => void;
}

export function PicoSVG({ pinConfigurations, onPinFunctionChange }: PicoSVGProps) {
  // Pin positions for dropdowns - these correspond to the physical pin locations
  // Left side pins: 1-20 going from top to bottom
  // Right side pins: 21-40 going from bottom to top (40 at top, 21 at bottom)
  const leftPinPositions = [
    { pin: 1, x: 4.565, y: 9.544 },     // Pin 1
    { pin: 2, x: 4.565, y: 16.744 },    // Pin 2
    { pin: 3, x: 4.565, y: 23.944 },    // Pin 3
    { pin: 4, x: 4.565, y: 31.144 },    // Pin 4
    { pin: 5, x: 4.565, y: 38.344 },    // Pin 5
    { pin: 6, x: 4.565, y: 45.544 },    // Pin 6
    { pin: 7, x: 4.565, y: 52.744 },    // Pin 7
    { pin: 8, x: 4.565, y: 59.944 },    // Pin 8
    { pin: 9, x: 4.565, y: 67.144 },    // Pin 9
    { pin: 10, x: 4.565, y: 74.344 },   // Pin 10
    { pin: 11, x: 4.565, y: 81.544 },   // Pin 11
    { pin: 12, x: 4.565, y: 88.744 },   // Pin 12
    { pin: 13, x: 4.565, y: 95.944 },   // Pin 13
    { pin: 14, x: 4.565, y: 103.144 },  // Pin 14
    { pin: 15, x: 4.565, y: 110.344 },  // Pin 15
    { pin: 16, x: 4.565, y: 117.544 },  // Pin 16
    { pin: 17, x: 4.565, y: 124.744 },  // Pin 17
    { pin: 18, x: 4.565, y: 131.944 },  // Pin 18
    { pin: 19, x: 4.565, y: 139.144 },  // Pin 19
    { pin: 20, x: 4.565, y: 146.344 },  // Pin 20
  ];

  const rightPinPositions = [
    { pin: 40, x: 54.965, y: 9.544 },    // Pin 40
    { pin: 39, x: 54.965, y: 16.744 },   // Pin 39
    { pin: 38, x: 54.965, y: 23.944 },   // Pin 38
    { pin: 37, x: 54.965, y: 31.144 },   // Pin 37
    { pin: 36, x: 54.965, y: 38.344 },   // Pin 36
    { pin: 35, x: 54.965, y: 45.544 },   // Pin 35
    { pin: 34, x: 54.965, y: 52.744 },   // Pin 34
    { pin: 33, x: 54.965, y: 59.944 },   // Pin 33
    { pin: 32, x: 54.965, y: 67.144 },   // Pin 32
    { pin: 31, x: 54.965, y: 74.344 },   // Pin 31
    { pin: 30, x: 54.965, y: 81.544 },   // Pin 30
    { pin: 29, x: 54.965, y: 88.744 },   // Pin 29
    { pin: 28, x: 54.965, y: 95.944 },   // Pin 28
    { pin: 27, x: 54.965, y: 103.144 },  // Pin 27
    { pin: 26, x: 54.965, y: 110.344 },  // Pin 26
    { pin: 25, x: 54.965, y: 117.544 },  // Pin 25
    { pin: 24, x: 54.965, y: 124.744 },  // Pin 24
    { pin: 23, x: 54.965, y: 131.944 },  // Pin 23
    { pin: 22, x: 54.965, y: 139.144 },  // Pin 22
    { pin: 21, x: 54.965, y: 146.344 },  // Pin 21
  ];

  // SVG viewBox dimensions
  const svgWidth = 59.529;
  const svgHeight = 150.239;

  return (
    <div className="flex items-center justify-center w-full h-full p-6">
      <div className="relative max-w-4xl">
        {/* Main SVG - sized to use available space optimally */}
        <svg 
          viewBox="0 0 59.529 150.239"
          className="w-full h-auto mx-auto"
          style={{ minHeight: '400px', maxHeight: '70vh', maxWidth: '400px' }}
        >
          <image 
            href="/src/assets/raspberry-pi-pico-V2.svg" 
            width="100%" 
            height="100%"
          />
        </svg>

        {/* Left side pin dropdowns */}
        {leftPinPositions.map(({ pin, y }) => {
          const pinConfig = pinConfigurations[pin];
          const isConfigurable = pinConfig?.isConfigurable ?? false;
          
          return (
            <div
              key={`left-${pin}`}
              className="absolute flex items-center"
              style={{
                left: `${((0 / svgWidth) * 100)-3}%`,
                top: `${(y / svgHeight) * 100}%`,
                transform: 'translate(-100%, -50%)'
              }}
            >
              <div className="flex items-center space-x-2">
                {isConfigurable ? (
                  <>
                    <PinDropdown
                      pinConfig={pinConfig}
                      onFunctionChange={onPinFunctionChange}
                      size="xs"
                    />
                    {pinConfig.gpioNumber !== undefined && (
                      <Badge variant="blue" className="font-mono min-w-[2.5rem] text-center">
                        GP{pinConfig.gpioNumber}
                      </Badge>
                    )}
                    <Badge variant="info" className="font-mono min-w-[2rem] text-center">
                      {pin}
                    </Badge>
                  </>
                ) : (
                  <Badge variant="secondary" className="font-mono min-w-[5rem] text-center">
                    {pinConfig?.defaultLabel || `Pin ${pin}`}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}

        {/* Right side pin dropdowns */}
        {rightPinPositions.map(({ pin, y }) => {
          const pinConfig = pinConfigurations[pin];
          const isConfigurable = pinConfig?.isConfigurable ?? false;
          
          return (
            <div
              key={`right-${pin}`}
              className="absolute flex items-center"
              style={{
                left: `${((svgWidth / svgWidth) * 100)+3}%`,
                top: `${(y / svgHeight) * 100}%`,
                transform: 'translate(0%, -50%)'
              }}
            >
              <div className="flex items-center space-x-2">
                {isConfigurable ? (
                  <>
                    <Badge variant="info" className="font-mono min-w-[2rem] text-center">
                      {pin}
                    </Badge>
                    {pinConfig.gpioNumber !== undefined && (
                      <Badge variant="blue" className="font-mono min-w-[2.5rem] text-center">
                        GP{pinConfig.gpioNumber}
                      </Badge>
                    )}
                    <PinDropdown
                      pinConfig={pinConfig}
                      onFunctionChange={onPinFunctionChange}
                      size="xs"
                    />
                  </>
                ) : (
                  <Badge variant="secondary" className="font-mono min-w-[5rem] text-center">
                    {pinConfig?.defaultLabel || `Pin ${pin}`}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}