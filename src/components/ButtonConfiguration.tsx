import { MousePointer } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ButtonStateBadge } from '@/components/ButtonStateBadge';
import { useDeviceContext } from '@/contexts/DeviceContext';

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
  index?: number; // For direct pins
  register?: number; // For shift register
  bit?: number; // For shift register bit
  row?: number; // For matrix
  col?: number; // For matrix
}

interface ButtonStates {
  buttons: number; // Serialized u64; may lose precision >53 bits but current usage <53. Will treat via BigInt.
  timestamp: string;
}

interface ButtonEvent {
  button_id: number;
  pressed: boolean;
  timestamp: string;
}

// (Mapping details interface removed after optimization; reintroduce if advanced mapping UI needed.)

function parseButtonName(name: string): ParsedButtonInfo {
  // Based on actual backend formats from src-tauri/src/config/binary.rs:
  
  // Direct pin pattern: "Button X (pin Y)" or "Button X (Pin Y)" - case insensitive
  const directPinMatch = name.match(/Button\s+\d+\s+\([Pp]in\s+(\d+)\)/);
  if (directPinMatch) {
    return {
      type: 'direct',
      label: `Direct #${directPinMatch[1]}`,
      index: parseInt(directPinMatch[1])
    };
  }

  // Shift Register pattern: "Button X (ShiftReg[Y].bitZ)"
  const shiftRegMatch = name.match(/Button\s+\d+\s+\(ShiftReg\[(\d+)\]\.bit(\d+)\)/);
  if (shiftRegMatch) {
    return {
      type: 'shiftreg',
      label: `Shift Reg @${shiftRegMatch[1]}-${shiftRegMatch[2]}`,
      register: parseInt(shiftRegMatch[1]),
      bit: parseInt(shiftRegMatch[2])
    };
  }

  // Matrix pattern: "Button X (Matrix[Y,Z])"
  const matrixMatch = name.match(/Button\s+\d+\s+\(Matrix\[(\d+),(\d+)\]\)/);
  if (matrixMatch) {
    return {
      type: 'matrix',
      label: `Matrix $${matrixMatch[1]}x${matrixMatch[2]}`,
      row: parseInt(matrixMatch[1]),
      col: parseInt(matrixMatch[2])
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
  const [hidButtonStates, setHidButtonStates] = useState<ButtonStates | null>(null); // retains last full payload (timestamp)
  const [buttonMask, setButtonMask] = useState<number>(0); // UI-rendered bitmask (throttled)
  const latestMaskRef = useRef<number>(0); // immediate latest from poller
  const displayedMaskRef = useRef<number>(0); // what's currently displayed in UI
  const pendingFrameRef = useRef<boolean>(false);
  const pressedHistoryRef = useRef<Map<number, number>>(new Map()); // buttonId -> lastPressedTime
  const lastActivityRef = useRef<number>(0); // track last activity time globally
  const HOLD_VISIBILITY_MS = 50; // Show press for at least 50ms
  // Mapping details reserved for future advanced UI (currently unused after optimization)
  // Removed active usage to avoid unnecessary re-renders / lint warnings.
  const [lastNonZeroButtons, setLastNonZeroButtons] = useState<number | null>(null);
  // Track last log time to avoid spamming console which can add UI latency
  const lastLogRef = useRef<number>(0);
  const [noHidActivity, setNoHidActivity] = useState(false);
  const { isConnected: contextIsConnected } = useDeviceContext();
  
  // Use context connection state if not provided via props
  const connected = isConnected || contextIsConnected;

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

  // Fetch HID mapping once per connection
  useEffect(() => {
    if (!connected) {
      setHidButtonStates(null);
      return;
    }
    // Optionally could fetch mapping here in future.
  }, [connected]);

  // Event-driven button state updates
  useEffect(() => {
    if (!connected) return;
    
    let unlistenButton: (() => void) | null = null;
    let unlistenSync: (() => void) | null = null;
    
    const setupEventListeners = async () => {
      // Get initial state
      try {
        const states: ButtonStates = await invoke('read_button_states');
        setHidButtonStates(states);
        latestMaskRef.current = states.buttons;
        displayedMaskRef.current = states.buttons;
        setButtonMask(states.buttons);
      } catch (e) {
        console.warn('Failed to get initial button states:', e);
      }
      
      // Listen for button change events
      unlistenButton = await listen<ButtonEvent>('button-changed', (event) => {
        const { button_id, pressed, timestamp } = event.payload;
        const now = performance.now();
        
        console.log(`[FRONTEND EVENT] Button ${button_id} ${pressed ? 'pressed' : 'released'} at ${timestamp}`);
        
        // Update button mask
        const mask = button_id < 32 ? (1 << button_id) : Math.pow(2, button_id);
        if (pressed) {
          latestMaskRef.current |= mask;
          pressedHistoryRef.current.set(button_id, now);
        } else {
          latestMaskRef.current &= ~mask;
        }
        
        // Update display with hold visibility
        let displayMask = latestMaskRef.current;
        const cutoffTime = now - HOLD_VISIBILITY_MS;
        
        // Clean old entries and apply hold visibility
        for (const [bit, time] of pressedHistoryRef.current) {
          if (time < cutoffTime) {
            const bitMask = bit < 32 ? (1 << bit) : Math.pow(2, bit);
            if (!(latestMaskRef.current & bitMask)) {
              pressedHistoryRef.current.delete(bit);
            }
          } else {
            // Keep showing recently pressed buttons
            const bitMask = bit < 32 ? (1 << bit) : Math.pow(2, bit);
            displayMask |= bitMask;
          }
        }
        
        // Update UI if display mask changed
        if (displayMask !== displayedMaskRef.current) {
          if (displayMask !== 0) {
            lastActivityRef.current = now;
            setLastNonZeroButtons(displayMask);
          }
          
          // Schedule UI update on next frame
          if (!pendingFrameRef.current) {
            pendingFrameRef.current = true;
            const maskToDisplay = displayMask;
            requestAnimationFrame(() => {
              pendingFrameRef.current = false;
              displayedMaskRef.current = maskToDisplay;
              setButtonMask(maskToDisplay);
              console.log(`[FRONTEND UI] Updated display to: 0x${maskToDisplay.toString(16)}`);
            });
          }
        }
      });
      
      // Listen for periodic state sync events
      unlistenSync = await listen<ButtonStates>('button-state-sync', (event) => {
        const { buttons, timestamp } = event.payload;
        console.log(`[FRONTEND SYNC] State sync received: 0x${buttons.toString(16)} at ${timestamp}`);
        
        // Update state to match backend
        latestMaskRef.current = buttons;
        setHidButtonStates(event.payload);
        
        // Apply hold visibility and update display if needed
        const now = performance.now();
        let displayMask = buttons;
        const cutoffTime = now - HOLD_VISIBILITY_MS;
        
        for (const [bit, time] of pressedHistoryRef.current) {
          if (time >= cutoffTime) {
            const bitMask = bit < 32 ? (1 << bit) : Math.pow(2, bit);
            displayMask |= bitMask;
          }
        }
        
        if (displayMask !== displayedMaskRef.current) {
          displayedMaskRef.current = displayMask;
          setButtonMask(displayMask);
        }
      });
    };
    
    setupEventListeners();
    
    return () => {
      if (unlistenButton) {
        unlistenButton();
      }
      if (unlistenSync) {
        unlistenSync();
      }
    };
  }, [connected]);

  // Derived pressed set memoized (avoids repeated bit math in render for many buttons)
  const pressedSet = useMemo(() => {
    const set = new Set<number>();
    if (buttonMask === 0) return set;
    
    // Use proper bit manipulation for up to 53 bits
    const maxId = Math.max(-1, ...parsedButtons.map(b => b.id));
    for (let bit = 0; bit <= maxId && bit < 53; bit++) {
      // Use Math.pow for bits > 31 to avoid JS bitwise operator limitations
      const bitValue = bit < 32 ? (1 << bit) : Math.pow(2, bit);
      if ((buttonMask & bitValue) !== 0) {
        set.add(bit);
      }
    }
    return set;
  }, [buttonMask, parsedButtons]);

  // Detect HID inactivity (no non-zero button states & timestamp not updating)
  useEffect(() => {
    if (!connected) {
      setNoHidActivity(false);
      return;
    }
    let timeout: number | undefined;
    const check = () => {
      if (hidButtonStates) {
        const ageMs = Date.now() - new Date(hidButtonStates.timestamp).getTime();
        if (lastNonZeroButtons === null && ageMs > 5000) { // 5s without any activity
          setNoHidActivity(true);
        } else if (lastNonZeroButtons !== null) {
          setNoHidActivity(false);
        }
      }
      timeout = window.setTimeout(check, 1000);
    };
    check();
    return () => { if (timeout) window.clearTimeout(timeout); };
  }, [connected, hidButtonStates, lastNonZeroButtons]);

  // Pre-parse button names once (avoid regex per render for each cell) & group
  const groupedButtons = useMemo(() => {
    const groups = {
      direct: [] as Array<{ button: ParsedButtonConfig; info: ParsedButtonInfo }>,
      matrix: [] as Array<{ button: ParsedButtonConfig; info: ParsedButtonInfo }>,
      shiftreg: [] as Array<{ button: ParsedButtonConfig; info: ParsedButtonInfo }>
    };

    parsedButtons.forEach(button => {
      const info = parseButtonName(button.name);
      groups[info.type].push({ button, info });
    });

    // Sort each group
    groups.direct.sort((a, b) => (a.info.index || 0) - (b.info.index || 0));
    groups.shiftreg.sort((a, b) => {
      const regDiff = (a.info.register || 0) - (b.info.register || 0);
      return regDiff !== 0 ? regDiff : (a.info.bit || 0) - (b.info.bit || 0);
    });
    groups.matrix.sort((a, b) => {
      const rowDiff = (a.info.row || 0) - (b.info.row || 0);
      return rowDiff !== 0 ? rowDiff : (a.info.col || 0) - (b.info.col || 0);
    });

    return groups;
  }, [parsedButtons]);

  // Calculate matrix dimensions
  const matrixDimensions = useMemo(() => {
    const rows = Math.max(...groupedButtons.matrix.map(m => m.info.row || 0), 0) + 1;
    const cols = Math.max(...groupedButtons.matrix.map(m => m.info.col || 0), 0) + 1;
    return { rows, cols };
  }, [groupedButtons.matrix]);

  // Helper to check if a button is pressed (uses memoized pressedSet)
  const isButtonPressed = useCallback((buttonId: number) => pressedSet.has(buttonId), [pressedSet]);

  // Helper to get button badge state
  const getButtonBadgeState = (button: ParsedButtonConfig): 'unconfigured' | 'configured' | 'pressed' | 'pressed-unconfigured' => {
    const state = getButtonState(button);
    const isPressed = isButtonPressed(button.id);
    const hasLogicalButton = state.enabled && button.id >= 0;

    if (isPressed) {
      return hasLogicalButton ? 'pressed' : 'pressed-unconfigured';
    } else {
      return hasLogicalButton ? 'configured' : 'unconfigured';
    }
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
          <p className="text-muted-foreground select-none">Reading configuration from device...</p>
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
          <p className="text-muted-foreground select-none">No buttons configured on device</p>
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
        {noHidActivity && (
          <div className="mb-4 p-2 rounded border border-yellow-500/40 bg-yellow-500/10 text-xs text-yellow-600 dark:text-yellow-400">
            No HID button activity detected yet. Press any physical button to confirm connection.
          </div>
        )}
        <div className="flex h-[600px] gap-4">
          {/* Left half - button state visualization */}
          <div className="flex-1">
            <ScrollArea className="h-full">
              <div className="space-y-6 p-4">
                {/* Direct Buttons */}
                {groupedButtons.direct.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-3">Direct Buttons</h3>
                    <div className="flex flex-wrap gap-2">
                      {groupedButtons.direct.map(({ button, info }) => (
                        <ButtonStateBadge
                          key={button.id}
                          label={info.label}
                          state={getButtonBadgeState(button)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Matrix Buttons */}
                {groupedButtons.matrix.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-3">Matrix Buttons ({matrixDimensions.rows}x{matrixDimensions.cols})</h3>
                    <div 
                      className="grid gap-2"
                      style={{ 
                        gridTemplateColumns: `repeat(${matrixDimensions.cols}, 20px)`,
                        width: 'fit-content'
                      }}
                    >
                      {Array.from({ length: matrixDimensions.rows * matrixDimensions.cols }, (_, index) => {
                        const row = Math.floor(index / matrixDimensions.cols);
                        const col = index % matrixDimensions.cols;
                        const item = groupedButtons.matrix.find(
                          m => m.info.row === row && m.info.col === col
                        );
                        
                        if (item) {
                          return (
                            <ButtonStateBadge
                              key={item.button.id}
                              label={item.info.label}
                              state={getButtonBadgeState(item.button)}
                            />
                          );
                        } else {
                          // Empty cell
                          return <div key={`empty-${row}-${col}`} className="w-5 h-5" />;
                        }
                      })}
                    </div>
                  </div>
                )}

                {/* Shift Register Buttons */}
                {groupedButtons.shiftreg.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-3">Shift Register Buttons</h3>
                    <div className="space-y-2">
                      {/* Group by register */}
                      {Array.from(new Set(groupedButtons.shiftreg.map(s => s.info.register || 0))).map(register => {
                        const registerButtons = groupedButtons.shiftreg.filter(
                          s => s.info.register === register
                        );
                        return (
                          <div key={`shiftreg-${register}`}>
                            <div className="text-xs text-muted-foreground mb-1">Register {register}</div>
                            <div className="flex flex-wrap gap-2">
                              {registerButtons.map(({ button, info }) => (
                                <ButtonStateBadge
                                  key={button.id}
                                  label={info.label}
                                  state={getButtonBadgeState(button)}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
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
                          // button.name parsing already cached via grouping, retrieve matching info
                          const info = groupedButtons.direct.find(d => d.button === button)?.info ||
                                       groupedButtons.shiftreg.find(s => s.button === button)?.info ||
                                       groupedButtons.matrix.find(m => m.button === button)?.info ||
                                       parseButtonName(button.name);
                          const variantMap = { direct: 'blue', shiftreg: 'teal', matrix: 'purple' } as const;
                          const variant = variantMap[info.type] || 'blue';
                          return (
                            <Badge variant={variant as 'blue' | 'teal' | 'purple'} className="font-mono text-xs">
                              {info.label}
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