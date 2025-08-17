import { MousePointer } from 'lucide-react';
import { useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import type { DeviceStatus, ParsedButtonConfig } from '@/lib/types';

interface ButtonConfigurationProps {
  deviceStatus: DeviceStatus | null;
  isConnected?: boolean;
  parsedButtons?: ParsedButtonConfig[];
  isLoading?: boolean;
}

interface ParsedButtonInfo {
  type: 'direct' | 'shiftreg' | 'matrix';
  label: string;
}

function parseButtonName(name: string): ParsedButtonInfo {
  // Based on actual backend formats from src-tauri/src/config/binary.rs:
  
  // Direct pin pattern: "Button X (pin Y)" or "Button X (Pin Y)" - case insensitive
  const directPinMatch = name.match(/Button\s+\d+\s+\([Pp]in\s+(\d+)\)/);
  if (directPinMatch) {
    return {
      type: 'direct',
      label: `Direct ${directPinMatch[1]}`
    };
  }

  // Shift Register pattern: "Button X (ShiftReg[Y].bitZ)"
  const shiftRegMatch = name.match(/Button\s+\d+\s+\(ShiftReg\[(\d+)\]\.bit(\d+)\)/);
  if (shiftRegMatch) {
    return {
      type: 'shiftreg',
      label: `ShiftReg ${shiftRegMatch[1]}-${shiftRegMatch[2]}`
    };
  }

  // Matrix pattern: "Button X (Matrix[Y,Z])"
  const matrixMatch = name.match(/Button\s+\d+\s+\(Matrix\[(\d+),(\d+)\]\)/);
  if (matrixMatch) {
    return {
      type: 'matrix',
      label: `Matrix ${matrixMatch[1]}x${matrixMatch[2]}`
    };
  }

  // Fallback - if we can't parse, return the original name
  return {
    type: 'direct',
    label: name
  };
}

export function ButtonConfiguration({ deviceStatus, isConnected = false, parsedButtons = [], isLoading = false }: ButtonConfigurationProps) {
  const [buttonStates, setButtonStates] = useState<Record<number, { enabled: boolean; function: string }>>({});

  const handleEnabledChange = (buttonId: number, checked: boolean) => {
    const button = parsedButtons.find(b => b.id === buttonId);
    setButtonStates(prev => ({
      ...prev,
      [buttonId]: {
        enabled: checked,
        function: prev[buttonId]?.function ?? button?.function ?? 'normal'
      }
    }));
  };

  const handleFunctionChange = (buttonId: number, func: string) => {
    const button = parsedButtons.find(b => b.id === buttonId);
    setButtonStates(prev => ({
      ...prev,
      [buttonId]: {
        enabled: prev[buttonId]?.enabled ?? button?.enabled ?? true,
        function: func
      }
    }));
  };

  const getButtonState = (button: ParsedButtonConfig) => {
    return buttonStates[button.id] || {
      enabled: button.enabled,
      function: button.function
    };
  };

  if (!deviceStatus || !isConnected) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MousePointer className="w-5 h-5 mr-2" />
            Button Configuration
          </CardTitle>
          <CardDescription>Configure button functions and behavior</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">No device connected</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MousePointer className="w-5 h-5 mr-2" />
            Button Configuration
          </CardTitle>
          <CardDescription>Configure button functions and behavior</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">Reading configuration from device...</p>
        </CardContent>
      </Card>
    );
  }

  if (parsedButtons.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MousePointer className="w-5 h-5 mr-2" />
            Button Configuration
          </CardTitle>
          <CardDescription>Configure button functions and behavior</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">No buttons configured on device</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <MousePointer className="w-5 h-5 mr-2" />
          Button Configuration
        </CardTitle>
        <CardDescription>
          Showing {parsedButtons.length} buttons from device configuration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-[600px] gap-4">
          {/* Left half - placeholder for future button details */}
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p>Select a button to configure</p>
          </div>
          
          {/* Vertical separator */}
          <Separator orientation="vertical" className="h-full" />
          
          {/* Right half - scrollable button list */}
          <div className="flex-1">
            <ScrollArea className="h-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">On</TableHead>
                    <TableHead>Physical Button</TableHead>
                    <TableHead className="w-[50px]">ID</TableHead>
                    <TableHead className="w-[120px]">Function</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {parsedButtons.map((button) => {
                  const state = getButtonState(button);
                  return (
                    <TableRow 
                      key={button.id} 
                      className={!state.enabled ? 'opacity-50' : ''}
                    >
                      <TableCell className="p-2">
                        <Checkbox
                          checked={state.enabled}
                          onCheckedChange={(checked) => handleEnabledChange(button.id, checked as boolean)}
                          disabled={!isConnected}
                          className="h-4 w-4 rounded"
                        />
                      </TableCell>
                      <TableCell className="p-2">
                        {(() => {
                          const buttonInfo = parseButtonName(button.name);
                          
                          // Map button types to badge variants
                          const variantMap = {
                            direct: 'blue',
                            shiftreg: 'teal',
                            matrix: 'purple'
                          };
                          
                          const variant = variantMap[buttonInfo.type] || 'blue';
                          
                          return (
                            <Badge variant={variant as "blue" | "teal" | "purple"} className="font-mono">
                              {buttonInfo.label}
                            </Badge>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="p-2">
                        <Badge variant="secondary" className="font-mono">
                          {button.id}
                        </Badge>
                      </TableCell>
                      <TableCell className="p-2">
                        <Select
                          value={state.function}
                          onValueChange={(value) => handleFunctionChange(button.id, value)}
                          disabled={!state.enabled || !isConnected}
                        >
                          <SelectTrigger size="xs" className="w-[120px]">
                            <SelectValue>
                              <span className="text-xs font-mono">
                                {state.function === 'normal' ? 'Normal' :
                                 state.function === 'momentary' ? 'Momentary' :
                                 state.function === 'encoder_a' ? 'Encoder A' :
                                 state.function === 'encoder_b' ? 'Encoder B' :
                                 state.function}
                              </span>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normal">
                              <span className="text-xs font-mono">Normal</span>
                            </SelectItem>
                            <SelectItem value="momentary">
                              <span className="text-xs font-mono">Momentary</span>
                            </SelectItem>
                            <SelectItem value="encoder_a">
                              <span className="text-xs font-mono">Encoder A</span>
                            </SelectItem>
                            <SelectItem value="encoder_b">
                              <span className="text-xs font-mono">Encoder B</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}