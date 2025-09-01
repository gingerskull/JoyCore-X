import { useCallback, useMemo, useState } from 'react';
import { Gamepad2, RefreshCw, Wifi, WifiOff, AlertTriangle, CheckCircle2, Loader2, Download, Save, Upload, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useDeviceContext } from '@/contexts/DeviceContext';
import { useFirmwareUpdatesContext } from '@/contexts/FirmwareUpdatesProvider';
import { DeviceConfiguration } from '@/components/DeviceConfiguration';
import type { ParsedAxisConfig, ParsedButtonConfig, PinFunction, Device } from '@/lib/types';
import { useDeviceConfigWithPins } from '@/hooks/useDeviceConfigWithPins';

interface DevicePinAssignments { [gpioPin: number]: PinFunction }

interface SidebarProps {
  collapsed: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  parsedAxes: ParsedAxisConfig[];
  parsedButtons: ParsedButtonConfig[];
  setParsedAxes: (axes: ParsedAxisConfig[]) => void;
  setParsedButtons: (buttons: ParsedButtonConfig[]) => void;
  setDevicePinAssignments?: (pinAssignments: DevicePinAssignments | undefined) => void;
  onUpdateDialogOpen: () => void;
}

export function Sidebar({ collapsed, onRefresh, isRefreshing, parsedAxes, parsedButtons, setParsedAxes, setParsedButtons, setDevicePinAssignments, onUpdateDialogOpen }: SidebarProps) {
  const { devices, connectedDevice, isLoading, connectDevice, disconnectDevice, isConnected, isConnecting } = useDeviceContext();
  const { isChecking: isCheckingUpdates, hasUpdateAvailable, latestVersion } = useFirmwareUpdatesContext();
  const { isLoading: configLoading, readConfigurationWithPins } = useDeviceConfigWithPins();
  const [connectingToId, setConnectingToId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  const handleConnect = useCallback(async (deviceId: string) => {
    setConnectingToId(deviceId);
    try { await connectDevice(deviceId); } finally { setConnectingToId(null); }
  }, [connectDevice]);

  const handleDisconnect = useCallback(async () => { await disconnectDevice(); }, [disconnectDevice]);

  const saveConfig = async () => {
    // DeviceConfiguration encapsulates save but we mirror quick action when collapsed
    setIsSaving(true);
    try {
      // use tauri invoke directly to avoid duplicate logic import cycle
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_device_config');
      setLastSaved(new Date());
  } catch (e) { console.error(e); }
    finally { setIsSaving(false); }
  };

  const loadConfig = async () => {
    if (!connectedDevice) return;
    try {
      const cfg = await readConfigurationWithPins();
      if (cfg) {
        setParsedAxes(cfg.axes);
        setParsedButtons(cfg.buttons);
        if (setDevicePinAssignments) setDevicePinAssignments(cfg.pinAssignments);
      }
  } catch {
      setParsedAxes([]);
      setParsedButtons([]);
      if (setDevicePinAssignments) setDevicePinAssignments(undefined);
    }
  };

  const factoryReset = async () => {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reset_device_to_defaults');
      setParsedAxes([]);
      setParsedButtons([]);
      if (setDevicePinAssignments) setDevicePinAssignments(undefined);
      await loadConfig();
    } catch {
      // ignore
    }
  };

  const getStatusIcon = (device: Device, isDeviceConnected: boolean) => {
    if (isDeviceConnected) return <CheckCircle2 className="h-4 w-4" />;
    const state = device.connection_state;
    if (state === 'Connecting' || (connectingToId === device.id)) return <Loader2 className="h-4 w-4 animate-spin" />;
    if (typeof state === 'object' && 'Error' in state) return <AlertTriangle className="h-4 w-4" />;
    return <WifiOff className="h-4 w-4" />;
  };

  const getStatusBadge = (device: Device, isDeviceConnected: boolean) => {
    if (isDeviceConnected) return <Badge variant="success">Connected</Badge>;
    const state = device.connection_state;
    if (state === 'Connecting' || (connectingToId === device.id)) {
      return <Badge variant="info" className="animate-pulse">Connecting</Badge>;
    }
    if (typeof state === 'object' && 'Error' in state) {
      return <Badge variant="destructive">Error</Badge>;
    }
    return <Badge variant="secondary">Disconnected</Badge>;
  };

  const handleDeviceAction = (device: Device, isDeviceConnected: boolean) => {
    if (isDeviceConnected) {
      handleDisconnect();
      return;
    }
    
    if (!isConnected) {
      handleConnect(device.id);
      return;
    }
  };

  const DeviceRow = useCallback(({ device }: { device: Device }) => {
    const isDeviceConnected = device.connection_state === 'Connected';
    const isDeviceConnecting = connectingToId === device.id;
    return (
      <>
      {collapsed ? (
        <div
          key={device.id}
          role="listitem"
          className="relative w-12 h-12 rounded border flex items-center justify-center cursor-pointer transition-colors hover:bg-accent/50 focus:outline-none focus:ring-2 focus:ring-ring"
          onClick={() => handleDeviceAction(device, isDeviceConnected)}
          aria-label={device.product || 'JoyCore Device'}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleDeviceAction(device, isDeviceConnected);
            }
          }}
        >
          <div className="flex flex-col items-center justify-center gap-1">
            {getStatusIcon(device, isDeviceConnected)}
            <div className="sr-only">{isDeviceConnected ? 'Connected' : 'Disconnected'}</div>
          </div>
        </div>
      ) : (
        <Card key={device.id} className="transition-colors" role="listitem">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {getStatusIcon(device, isDeviceConnected)}
                <CardTitle className="text-sm font-medium truncate">{device.product || 'JoyCore Device'}</CardTitle>
              </div>
              {getStatusBadge(device, isDeviceConnected)}
            </div>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <div className="text-xs text-muted-foreground truncate">
              <span className="font-medium">Port:</span> {device.port_name}
            </div>
            {device.serial_number && (
              <div className="text-xs text-muted-foreground truncate">
                <span className="font-medium">Serial:</span> {device.serial_number}
              </div>
            )}
            {device.device_status && (
              <div className="text-xs text-muted-foreground truncate">
                <span className="font-medium">FW:</span> {device.device_status.firmware_version}
              </div>
            )}
            {device.device_status && (
              <div className="text-xs text-muted-foreground truncate">
                <span className="font-medium">Controls:</span> {device.device_status.axes_count}A, {device.device_status.buttons_count}B
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDeviceAction(device, isDeviceConnected)}
              disabled={isDeviceConnecting || (!isDeviceConnected && isConnected)}
              className="w-full mt-3"
            >
              {isDeviceConnected ? (
                <><WifiOff className="w-3 h-3 mr-2" />Disconnect</>
              ) : isDeviceConnecting ? (
                <><Loader2 className="w-3 h-3 animate-spin mr-2" />Connecting...</>
              ) : (
                <><Wifi className="w-3 h-3 mr-2" />Connect</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, connectingToId, isConnecting, connectedDevice, isLoading, isConnected]);

  const deviceList = useMemo(() => devices.map(d => <DeviceRow key={d.id} device={d} />), [devices, DeviceRow]);

  return (
    <aside
      className={`transition-[width] duration-300 ease-in-out border-r h-full flex flex-col bg-sidebar ${collapsed ? 'w-20' : 'w-80'}`}
      aria-label="Device sidebar"
      aria-expanded={!collapsed}
      role="complementary"
    >
      {/* Header / Branding */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <div className={`flex items-center ${collapsed ? 'flex-col gap-1' : 'justify-center gap-2'}`}>
          <div className={`flex items-center ${collapsed ? 'flex-col gap-1' : 'gap-2'}`}>
            <Gamepad2 className="h-6 w-6" />
            {!collapsed && <h1 className="text-xl font-semibold">JoyCore-X</h1>}
          </div>
          <Badge variant="outline" className={collapsed ? 'text-[10px] px-1.5 py-0.5' : ''}>v0.1.0</Badge>
        </div>
      </div>


      {/* Update Button (only when connected + has device status) */}
      {isConnected && connectedDevice?.device_status?.firmware_version && (
        <div className="px-3 pb-2 shrink-0">
          <Button
            variant={hasUpdateAvailable ? "secondary" : "outline"}
            size="sm"
            onClick={onUpdateDialogOpen}
            disabled={isCheckingUpdates}
            className={`w-full ${collapsed ? 'h-9 px-0' : ''} ${hasUpdateAvailable ? 'border-warning/50 bg-warning/10 hover:bg-warning/20 text-warning-foreground' : ''}`}
            aria-label={hasUpdateAvailable ? 'Firmware update available' : 'Check firmware updates'}
          >
            <Download className={`w-4 h-4 ${!collapsed ? 'mr-2' : ''} ${isCheckingUpdates ? 'animate-pulse' : ''}`} />
            {!collapsed && (
              <>
                {hasUpdateAvailable ? 'Update Available' : 'Check Updates'}
                {hasUpdateAvailable && (
                  <Badge variant="brand4" className="ml-2">{latestVersion}</Badge>
                )}
              </>
            )}
          </Button>
        </div>
      )}

      {/* Quick Config Actions (collapsed mode only when connected) */}
      {collapsed && isConnected && (
        <div className="px-3 pb-2 shrink-0 flex flex-col gap-2">
          <Button size="sm" variant="default" onClick={saveConfig} disabled={isSaving} aria-label="Save to device" className="w-full">
            <Save className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={loadConfig} disabled={configLoading} aria-label="Load from device" className="w-full">
            <Upload className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={factoryReset} disabled={configLoading} aria-label="Factory reset" className="w-full">
            <RotateCcw className="w-4 h-4" />
          </Button>
        </div>
      )}

      <Separator />

      {/* Scrollable Content */}
      <ScrollArea indicators className="flex-1 px-3 pb-3">
        <div className="pt-3" role="" aria-label="Devices list">
          {devices.length === 0 ? (
            collapsed ? (
              <div className="flex flex-col items-center justify-center p-4 text-center">
                <WifiOff className="w-6 h-6 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">No devices</p>
                <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing} className="mt-2 px-2">
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            ) : (
              <Card className="mb-3">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <WifiOff className="w-4 h-4" />
                      <span>Device Discovery</span>
                    </div>
                    <div className="text-xs font-normal text-muted-foreground">
                      {devices.length} found
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground mb-3">No JoyCore devices found</p>
                  <Button size="sm" variant="outline" onClick={onRefresh} disabled={isRefreshing} className="w-full">
                    <RefreshCw className={`w-3 h-3 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                    {isRefreshing ? 'Scanning...' : 'Scan for Devices'}
                  </Button>
                </CardContent>
              </Card>
            )
          ) : (
            <>
              {!collapsed && (
                <Card className="mb-3">
                  <CardContent className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      {devices.length === 0 ? 'No available devices' : `${devices.length} available device${devices.length === 1 ? '' : 's'}`}
                    </span>
                    <Button 
                      size="sm" 
                      variant="ghost" 
                      onClick={onRefresh} 
                      disabled={isRefreshing} 
                      className="h-7 w-7 p-0"
                      aria-label="Refresh devices"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                  </CardContent>
                </Card>
              )}
              <div className={`${collapsed ? 'flex flex-col gap-3' : 'grid gap-3'} mb-3`}>
                {deviceList}
              </div>
            </>
          )}
          {devices.length > 0 && !collapsed && (
            <div className="text-sm text-muted-foreground mb-4 px-1">
              Connect your device via USB and ensure it's in configuration mode.
            </div>
          )}
          {isConnected && !collapsed && (
            <DeviceConfiguration
              parsedAxes={parsedAxes}
              parsedButtons={parsedButtons}
              setParsedAxes={setParsedAxes}
              setParsedButtons={setParsedButtons}
              setDevicePinAssignments={setDevicePinAssignments}
            />
          )}
          {/* Last saved indicator for collapsed mode */}
          {collapsed && isConnected && lastSaved && (
            <div className="text-[10px] text-center text-muted-foreground mt-3 px-1">
              <div className="text-success">Saved</div>
              <div>{lastSaved.toLocaleTimeString().slice(0,5)}</div>
            </div>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
