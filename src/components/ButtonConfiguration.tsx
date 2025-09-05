import { MousePointer } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { NumberInput } from '@/components/ui/number-input';
// Removed HID logical badges view; only raw hardware badges remain on left.
import { useDeviceContext } from '@/contexts/DeviceContext';
import { useDisplayMode } from '@/contexts/DisplayModeContext';

// Raw state components
import { useRawPinState } from '@/hooks/useRawPinState';
// import { useRawStateConfig } from '@/contexts/RawStateConfigContext';
import { GpioPinBadge, MatrixConnectionBadge, ShiftRegBitBadge } from '@/components/RawStateBadge';
import { RAW_STATE_CONFIG } from '@/lib/dev-config';

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

// Utility: extract physical mapping segment from a button name e.g. "(Pin 12)" or "(Matrix[1,2])" etc.
function extractPhysicalSegment(name: string): string | null {
  const match = name.match(/\(.*\)/);
  return match ? match[0] : null;
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
  // Local editable copy of buttons for add/delete operations
  const [editableButtons, setEditableButtons] = useState<ParsedButtonConfig[]>(parsedButtons);
  
  // Display mode control (force 'both' while this component is mounted so we always get HID + RAW data)
  const { displayMode, setDisplayMode } = useDisplayMode();
  const prevModeRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevModeRef.current === null) {
      prevModeRef.current = displayMode;
    }
    if (displayMode !== 'both') {
      setDisplayMode('both');
    }
    return () => {
      // Restore previous mode if user had something else before
      if (prevModeRef.current && prevModeRef.current !== 'both') {
        setDisplayMode(prevModeRef.current as 'hid' | 'raw' | 'both');
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync editable buttons when parsedButtons changes (e.g., device reload) unless user has local edits
  useEffect(() => {
    setEditableButtons(prev => {
      // If lengths differ by large margin or prev empty, replace; simple heuristic
      if (prev.length === 0 || Math.abs(prev.length - parsedButtons.length) > 0) {
        return parsedButtons;
      }
      return prev; // keep local edits
    });
  }, [parsedButtons]);

  // Freeze initial firmware buttons snapshot for raw mapping display
  const firmwareButtonsRef = useRef<ParsedButtonConfig[] | null>(null);
  if (firmwareButtonsRef.current === null && parsedButtons.length > 0) {
    firmwareButtonsRef.current = parsedButtons;
  }
  // If device reloads (different length and snapshot empty), refresh snapshot
  useEffect(() => {
    if (!firmwareButtonsRef.current && parsedButtons.length > 0) {
      firmwareButtonsRef.current = parsedButtons;
    }
  }, [parsedButtons]);
  // hidButtonStates removed (table highlight uses buttonMask only)
  const [buttonMask, setButtonMask] = useState<number>(0); // UI-rendered bitmask (throttled)
  const latestMaskRef = useRef<number>(0); // immediate latest from poller
  const displayedMaskRef = useRef<number>(0); // what's currently displayed in UI
  const pendingFrameRef = useRef<boolean>(false);
  const pressedHistoryRef = useRef<Map<number, number>>(new Map()); // buttonId -> lastPressedTime
  const lastActivityRef = useRef<number>(0); // track last activity time globally
  const HOLD_VISIBILITY_MS = 50; // Show press for at least 50ms
  // Mapping details reserved for future advanced UI (currently unused after optimization)
  // Removed active usage to avoid unnecessary re-renders / lint warnings.
  // lastNonZeroButtons removed (no inactivity banner)
  // Track last log time to avoid spamming console which can add UI latency
  // const lastLogRef = useRef<number>(0); // Reserved for future use
  // HID inactivity banner removed; noHidActivity state removed
  const { isConnected: contextIsConnected } = useDeviceContext();
  
  // Use context connection state if not provided via props
  const connected = isConnected || contextIsConnected;

  // Raw hardware state hook
  const rawState = useRawPinState();
  // Pull modes retained only for potential future raw badge enhancements (not needed now)
  // const { gpioPullMode, shiftRegPullMode } = useRawStateConfig();
  
  // Debug raw state (disabled to reduce console noise)
  useEffect(() => {
    // Enable for debugging: console.log('Raw state update:', rawState);
    if (rawState.error) {
      console.error('Raw state error:', rawState.error);
    }
  }, [rawState]);

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

  const handleAddButton = () => {
    setEditableButtons(prev => {
      const maxId = prev.reduce((m,b) => Math.max(m,b.id), -1);
      const newId = maxId + 1;
      const newBtn: ParsedButtonConfig = {
        id: newId,
        name: `Button ${newId} (Unassigned)`,
        function: 'normal',
        enabled: true
      };
      return [...prev, newBtn];
    });
    setButtonStates(prev => {
      const maxId = Object.keys(prev).map(k=>parseInt(k)).reduce((m,b)=> Math.max(m,b), -1);
      const newId = Math.max(maxId, editableButtons.reduce((m,b)=> Math.max(m,b.id), -1)) + 1; // ensure sync
      return { ...prev, [newId]: { enabled: true, function: 'normal' } };
    });
  };

  const handleDeleteButton = (id: number) => {
    // Keep original parsedButtons (left visualization) intact; only remove from editable list
    setEditableButtons(prev => prev.filter(b => b.id !== id));
    setButtonStates(prev => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const handleIdChange = (oldId: number, newId: number) => {
    if (Number.isNaN(newId) || newId < 0) return;
    setEditableButtons(prev => prev.map(b => {
      if (b.id === oldId) {
        // Preserve physical segment in name (text inside parentheses)
        const phys = b.name.match(/\(.*\)/)?.[0] || '';
  return { ...b, id: newId, name: `Button ${newId} ${phys}`.trim() };
      }
      return b;
    }));
    setButtonStates(prev => {
      const copy = { ...prev };
      if (copy[oldId]) {
        copy[newId] = copy[oldId];
        delete copy[oldId];
      }
      return copy;
    });
  };

  // Build physical mapping options from current raw state and parsedButtons
  interface PhysOption { value: string; label: string; }

  const handlePhysicalChange = (button: ParsedButtonConfig, physValue: string) => {
    setEditableButtons(prev => prev.map(b => b === button ? { ...b, name: `Button ${b.id} ${physValue}` } : b));
  };

  // Fetch HID mapping once per connection
  useEffect(() => {
  if (!connected) return;
    // Optionally could fetch mapping here in future.
  }, [connected]);

  // Event-driven button state updates
  useEffect(() => {
    if (!connected) return;
    
    // Only set up HID listeners if we're in HID or both mode
    if (rawState.displayMode !== 'hid' && rawState.displayMode !== 'both') return;
    
    let unlistenButton: (() => void) | null = null;
    let unlistenSync: (() => void) | null = null;
    
    const setupEventListeners = async () => {
      // Get initial state
      try {
  const states: ButtonStates = await invoke('read_button_states');
  latestMaskRef.current = states.buttons;
  displayedMaskRef.current = states.buttons;
  setButtonMask(states.buttons);
      } catch (e) {
        console.warn('Failed to get initial button states:', e);
      }
      
      // Listen for button change events
      unlistenButton = await listen<ButtonEvent>('button-changed', (event) => {
        const { button_id, pressed } = event.payload;
        const now = performance.now();
        
        // Debug: console.log(`[FRONTEND EVENT] Button ${button_id} ${pressed ? 'pressed' : 'released'} at ${timestamp}`);
        
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
          if (displayMask !== 0) { lastActivityRef.current = now; }
          
          // Schedule UI update on next frame
          if (!pendingFrameRef.current) {
            pendingFrameRef.current = true;
            const maskToDisplay = displayMask;
            requestAnimationFrame(() => {
              pendingFrameRef.current = false;
              displayedMaskRef.current = maskToDisplay;
              setButtonMask(maskToDisplay);
              // Debug: console.log(`[FRONTEND UI] Updated display to: 0x${maskToDisplay.toString(16)}`);
            });
          }
        }
      });
      
      // Listen for periodic state sync events
      unlistenSync = await listen<ButtonStates>('button-state-sync', (event) => {
        const { buttons } = event.payload;
        // Debug: console.log(`[FRONTEND SYNC] State sync received: 0x${buttons.toString(16)} at ${timestamp}`);
        
        // Update state to match backend
  latestMaskRef.current = buttons;
        
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
  }, [connected, rawState.displayMode]);

  // Derived pressed set memoized (avoids repeated bit math in render for many buttons)
  const pressedSet = useMemo(() => {
    const set = new Set<number>();
    if (buttonMask === 0) return set;
    
    // Use proper bit manipulation for up to 53 bits
  const source = firmwareButtonsRef.current || parsedButtons;
  const maxId = Math.max(-1, ...source.map(b => b.id));
    for (let bit = 0; bit <= maxId && bit < 53; bit++) {
      // Use Math.pow for bits > 31 to avoid JS bitwise operator limitations
      const bitValue = bit < 32 ? (1 << bit) : Math.pow(2, bit);
      if ((buttonMask & bitValue) !== 0) {
        set.add(bit);
      }
    }
    return set;
  }, [buttonMask, parsedButtons]);

  // HID inactivity detection removed (UI no longer shows banner)

  // Pre-parse button names once (avoid regex per render for each cell) & group
  const groupedButtons = useMemo(() => {
    const groups = {
      direct: [] as Array<{ button: ParsedButtonConfig; info: ParsedButtonInfo }>,
      matrix: [] as Array<{ button: ParsedButtonConfig; info: ParsedButtonInfo }>,
      shiftreg: [] as Array<{ button: ParsedButtonConfig; info: ParsedButtonInfo }>
    };
    const source = firmwareButtonsRef.current || parsedButtons;
    source.forEach(button => {
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

  const physicalOptions: PhysOption[] = useMemo(() => {
    const opts: PhysOption[] = [];
    const unique = new Set<string>();
    const push = (value: string, label: string) => { if (!unique.has(value)) { unique.add(value); opts.push({ value, label }); } };
    groupedButtons.direct.forEach(({ info }) => { if (info.index !== undefined) push(`(Pin ${info.index})`, `Pin ${info.index}`); });
    groupedButtons.matrix.forEach(({ info }) => { if (info.row !== undefined && info.col !== undefined) push(`(Matrix[${info.row},${info.col}])`, `Matrix[${info.row},${info.col}]`); });
    groupedButtons.shiftreg.forEach(({ info }) => { if (info.register !== undefined && info.bit !== undefined) push(`(ShiftReg[${info.register}].bit${info.bit})`, `ShiftReg[${info.register}].bit${info.bit}`); });
    return opts.sort((a,b)=> a.label.localeCompare(b.label));
  }, [groupedButtons]);

  // Calculate matrix dimensions
  const matrixDimensions = useMemo(() => {
    const rows = Math.max(...groupedButtons.matrix.map(m => m.info.row || 0), 0) + 1;
    const cols = Math.max(...groupedButtons.matrix.map(m => m.info.col || 0), 0) + 1;
    return { rows, cols };
  }, [groupedButtons.matrix]);

  // Helper to check if a button is pressed (uses memoized pressedSet)
  const isButtonPressed = useCallback((buttonId: number) => pressedSet.has(buttonId), [pressedSet]);

  // Removed HID badge state + physical active highlighting logic; table rows highlight only on HID logical press.

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center">
              <MousePointer className="w-5 h-5 mr-2" />
              Button Configuration
            </CardTitle>
            <CardDescription>
              Showing {parsedButtons.length} buttons from device configuration
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Dual Monitoring (HID + RAW)
          </div>
        </div>
      </CardHeader>
      <CardContent>
  {/* HID inactivity banner removed to keep left area purely raw hardware focus */}
        
        <div className="flex h-[600px] gap-4">
          {/* Left half - RAW hardware visualization only */}
          <div className="flex-1">
            <ScrollArea className="h-full" indicators fadeSize={56}>
              <div className="space-y-6 p-4">
                {/* Raw Hardware State Monitoring - always shown */}
                <>
                    <div className="mb-4">
                      <h2 className="text-lg font-semibold">Raw Hardware States</h2>
                      <p className="text-xs text-muted-foreground">Physical pin states directly from hardware</p>
                    </div>
                    {rawState.error && (
                      <div className="mb-4 p-3 rounded border border-red-500/40 bg-red-500/10 text-red-600 text-sm">
                        {rawState.error}
                      </div>
                    )}

                    {/* Direct GPIO Pins */}
                    {groupedButtons.direct.length > 0 && rawState.gpioStates !== null && (
                      <div>
                        <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                          Direct GPIO Pins
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <div className={`w-2 h-2 rounded-full ${rawState.isMonitoring ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                            <span>{rawState.isMonitoring ? 'Monitoring' : 'Stopped'}</span>
                          </div>
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {groupedButtons.direct.map(({ info }) => {
                            if (info.index !== undefined) {
                              return (
                                <GpioPinBadge
                                  key={info.index}
                                  pin={info.index}
                                  gpioMask={rawState.gpioStates}
                                  label={info.label}
                                />
                              );
                            }
                            return null;
                          })}
                        </div>
                      </div>
                    )}

                    {/* Matrix Connection States */}
                    {groupedButtons.matrix.length > 0 && rawState.matrixStates && (
                      <div>
                        <h3 className="text-sm font-medium mb-3">Matrix States ({matrixDimensions.rows}x{matrixDimensions.cols})</h3>
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
                            
                            // Check if this position has a configured button
                            const hasButton = groupedButtons.matrix.some(
                              m => m.info.row === row && m.info.col === col
                            );
                            
                            // Get connection state from raw data
                            const connection = rawState.matrixStates?.connections.find(
                              c => c.row === row && c.col === col
                            );
                            const isConnected = connection?.is_connected || false;
                            
                            if (hasButton) {
                              return (
                                <MatrixConnectionBadge
                                  key={`matrix-${row}-${col}`}
                                  row={row}
                                  col={col}
                                  isConnected={isConnected}
                                />
                              );
                            } else {
                              // Empty cell for positions without configured buttons
                              return <div key={`empty-${row}-${col}`} className="w-5 h-5" />;
                            }
                          })}
                        </div>
                      </div>
                    )}

                    {/* Shift Register Bits */}
                    {groupedButtons.shiftreg.length > 0 && rawState.shiftRegStates.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium mb-3">Shift Register Bits</h3>
                        <div className="space-y-2">
                          {/* Group by register */}
                          {Array.from(new Set(groupedButtons.shiftreg.map(s => s.info.register || 0))).map(registerId => {
                            const registerButtons = groupedButtons.shiftreg.filter(
                              s => s.info.register === registerId
                            );
                            const registerState = rawState.shiftRegStates.find(r => r.register_id === registerId);
                            
                            if (!registerState) return null;
                            
                            return (
                              <div key={`shiftreg-${registerId}`}>
                                <div className="text-xs text-muted-foreground mb-1">Register {registerId}</div>
                                <div className="flex flex-wrap gap-2">
                                  {registerButtons.map(({ info }) => {
                                    if (info.bit !== undefined) {
                                      return (
                                        <ShiftRegBitBadge
                                          key={`reg-${registerId}-bit-${info.bit}`}
                                          registerId={registerId}
                                          bitIndex={info.bit}
                                          registerValue={registerState.value}
                                          label={info.label}
                                        />
                                      );
                                    }
                                    return null;
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Developer Controls (only show if enabled) */}
          {RAW_STATE_CONFIG.enableConsoleAPI && (
                      <div className="mt-4 p-3 bg-gray-50 rounded border text-xs text-gray-600">
                        <p className="font-medium mb-1">Developer API Available:</p>
                        <p>Use <code className="bg-gray-200 px-1 rounded">window.__rawState</code> in browser console for debugging</p>
                      </div>
                    )}
        </>
              </div>
            </ScrollArea>
          </div>
          
          {/* Vertical separator */}
          <Separator orientation="vertical" className="h-full" />
          
          {/* Right half - scrollable button list (always visible) */}
          <div className="flex-1">
            <ScrollArea className="h-full" indicators fadeSize={56}>
              <div className="pr-4">{/* Padding to keep content from touching scrollbar */}
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]">On</TableHead>
                      <TableHead className="w-[50px]">ID</TableHead>
                      <TableHead>Physical Button</TableHead>
                      <TableHead className="w-[120px]">Function</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                {editableButtons.map((button, idx) => {
                  const state = getButtonState(button);
                  // Parse physical mapping each render for editable list (may differ from firmware snapshot)
                  const physSegment = extractPhysicalSegment(button.name);
                  // parsedInfo no longer needed for highlight logic
                  // Active criteria:
                  //  - In HID mode: logical button currently pressed
                  //  - In RAW mode: associated physical resource is active (heuristic per type)
                  // Highlight only on HID logical press now (independent of displayMode since we force 'both')
                  // Highlight uses the event/mask (zero-based). If table IDs are 1-based, map to zero-based for highlight.
                  const logicalPressed = isButtonPressed(Math.max(0, button.id - 1));
                  const highlight = state.enabled && logicalPressed && !!physSegment;
                  return (
                    <TableRow 
                      key={`row-${idx}-${button.id}`} 
                      className={['',
                        !state.enabled ? 'opacity-50' : '',
                        highlight ? 'bg-green-500/50' : ''
                      ].filter(Boolean).join('')}
                    >
                      <TableCell className="p-2">
                        <Checkbox
                          checked={state.enabled}
                          onCheckedChange={(checked) => handleEnabledChange(button.id, checked as boolean)}
                          disabled={!isConnected}
                          className="h-4 w-4 rounded"
                        />
                      </TableCell>
                      <TableCell className="p-2 flex items-center gap-2">
                        <NumberInput
                          value={button.id}
                          onChange={(value) => handleIdChange(button.id, value)}
                          min={0}
                          max={99}
                          className="w-20 text-xs font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteButton(button.id)}
                          className="text-xs text-red-500 hover:text-red-600"
                          aria-label={`Delete button ${button.id}`}
                        >
                          ✕
                        </button>
                      </TableCell>
                      <TableCell className="p-2">
                        <Select
                          value={button.name.match(/\(.*\)/)?.[0] || ''}
                          onValueChange={(v) => handlePhysicalChange(button, v)}
                          disabled={!isConnected}
                        >
                          <SelectTrigger size="xs" className="w-[180px]">
                            <SelectValue placeholder="Select mapping" />
                          </SelectTrigger>
                          <SelectContent>
                            {physicalOptions.map(opt => (
                              <SelectItem key={opt.value} value={opt.value}>
                                <span className="text-xs font-mono">{opt.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                <div className="p-2">
                  <button
                    type="button"
                    onClick={handleAddButton}
                    className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90"
                  >
                    Add Button
                  </button>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}