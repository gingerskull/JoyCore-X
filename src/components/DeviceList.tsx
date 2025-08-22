import { useState } from 'react';
import { Usb, Wifi, WifiOff, AlertTriangle, CheckCircle2, Loader2, RefreshCw, PanelLeftClose, Gamepad2, Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

import { useDeviceContext } from '@/contexts/DeviceContext';
import { DeviceConfiguration } from './DeviceConfiguration';
import { useFirmwareUpdatesContext } from '@/contexts/FirmwareUpdatesProvider';
import type { Device, ParsedAxisConfig, ParsedButtonConfig, PinFunction } from '@/lib/types';

interface DevicePinAssignments {
  [gpioPin: number]: PinFunction;
}

interface DeviceListProps {
  onCollapse: () => void;
  deviceCount: number;
  onRefresh: () => void;
  isLoading: boolean;
  parsedAxes: ParsedAxisConfig[];
  parsedButtons: ParsedButtonConfig[];
  setParsedAxes: (axes: ParsedAxisConfig[]) => void;
  setParsedButtons: (buttons: ParsedButtonConfig[]) => void;
  setDevicePinAssignments?: (pinAssignments: DevicePinAssignments | undefined) => void;
  onUpdateDialogOpen: () => void;
}

export function DeviceList({ onCollapse, deviceCount, onRefresh, isLoading: isRefreshing, parsedAxes, parsedButtons, setParsedAxes, setParsedButtons, setDevicePinAssignments, onUpdateDialogOpen }: DeviceListProps) {
  const {
    devices,
    connectedDevice,
    // connectionInfo,
    isLoading,
    connectDevice,
    disconnectDevice,
    // discoverDevices,
    isConnected,
    isConnecting
  } = useDeviceContext();

  const [connectingToId, setConnectingToId] = useState<string | null>(null);

  // Get current firmware version from connected device
  const { isChecking: isCheckingUpdates, hasUpdateAvailable, latestVersion } = useFirmwareUpdatesContext();

  const handleConnect = async (deviceId: string) => {
    setConnectingToId(deviceId);
    try {
      await connectDevice(deviceId);
    } finally {
      setConnectingToId(null);
    }
  };

  const handleDisconnect = async () => {
    await disconnectDevice();
  };

  const getDeviceStatusIcon = (device: Device, isConnected: boolean) => {
    if (isConnected) {
      return <CheckCircle2 className="h-4 w-4" />;
    }
    
    const state = device.connection_state;
    
    if (state === 'Connecting' || (connectingToId === device.id)) {
      return <Loader2 className="h-4 w-4 animate-spin" />;
    } else if (typeof state === 'object' && 'Error' in state) {
      return <AlertTriangle className="h-4 w-4" />;
    }
    
    return <WifiOff className="h-4 w-4" />;
  };
  
  const getDeviceStatusBadge = (device: Device, isConnected: boolean) => {
    if (isConnected) {
      return <Badge variant="success">Connected</Badge>;
    }
    
    const state = device.connection_state;
    
    if (state === 'Connecting' || (connectingToId === device.id)) {
      return <Badge variant="info" className="animate-pulse">...</Badge>;
    } else if (typeof state === 'object' && 'Error' in state) {
      return <Badge variant="destructive">Error</Badge>;
    }
    
    return <Badge variant="secondary">Discon</Badge>;
  };

  const getConnectionAction = (device: Device, isDeviceConnected: boolean) => {
    const isDeviceConnecting = connectingToId === device.id || 
      (isConnecting && connectedDevice?.id === device.id);

    if (isDeviceConnected) {
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={handleDisconnect}
          disabled={isLoading}
          className="w-full text-xs h-8"
        >
          <WifiOff className="w-3 h-3 mr-2" />
          Disconnect
        </Button>
      );
    }

    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => handleConnect(device.id)}
        disabled={isLoading || isDeviceConnecting || isConnected}
        className="w-full text-xs h-8"
      >
        {isDeviceConnecting ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin mr-2" />
            Connecting...
          </>
        ) : (
          <>
            <Wifi className="w-3 h-3 mr-2" />
            Connect
          </>
        )}
      </Button>
    );
  };

  return (
    <div className="space-y-3">
      {/* Header Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-center space-x-2">
            <Gamepad2 className="h-6 w-6" />
            <h1 className="text-xl font-semibold">JoyCore-X</h1>
            <Badge variant="outline" className="ml-2">v0.1.0</Badge>
          </div>
        </CardHeader>
  {isConnected && connectedDevice?.device_status?.firmware_version && (
          <CardContent className="pt-0">
            <Button 
              variant="outline" 
              size="sm"
              onClick={onUpdateDialogOpen}
              disabled={isCheckingUpdates}
              className={`w-full ${hasUpdateAvailable ? "border-warning/50 bg-warning/10 hover:bg-warning/20" : ""}`}
            >
              <Download className={`w-4 h-4 mr-2 ${isCheckingUpdates ? 'animate-pulse' : ''}`} />
              {hasUpdateAvailable ? 'Update Available' : 'Check Updates'}
              {hasUpdateAvailable && (
                <Badge variant="yellow" className="ml-2">
                  {latestVersion}
                </Badge>
              )}
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Devices Card */}
      <Card>
        <CardHeader className="pb-3">
          
            <CardTitle className="text-lg font-semibold justify-between inline-flex">DEVICES
  <Button 
              variant="ghost" 
              size="icon"
              onClick={onCollapse}
              className="h-8 w-8"
              title="Collapse sidebar">
              <PanelLeftClose className="" />
            </Button>

            </CardTitle>
            
        
      
          <div className="pl-1 pr-1">
          
              
              <Button 
              variant="outline" 
              size="sm"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="w-full text-xs h-8 justify-between"
              title="Refresh devices"
            >
              <span>{deviceCount} found</span>
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
         
            
          </div>
        </CardHeader>
        
        <CardContent className="pt-0">
          {devices.length === 0 ? (
            <div className="text-center py-8">
              <Usb className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-3 select-none">
                No JoyCore devices found
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                Scan for Devices
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-80">
              <div className="space-y-3">
                {devices.map((device) => {
                  const isDeviceConnected = device.connection_state === 'Connected';
                  
                  return (
                    <div
                      key={device.id}
                      className={`p-4 rounded-lg border transition-colors space-y-3 ${
                        isDeviceConnected 
                          ? 'border-border bg-primary/25' 
                          : 'border-border hover:bg-muted/50'
                      }`}
                    >
                      {/* Device Name Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          {getDeviceStatusIcon(device, isDeviceConnected)}
                          <span className="font-medium text-sm truncate select-none">
                            {device.product || 'JoyCore Device'}
                          </span>
                        </div>
                        {getDeviceStatusBadge(device, isDeviceConnected)}
                      </div>
                      
                      {/* Port Row */}
                      <div className="text-xs text-muted-foreground truncate select-none">
                        <span className="font-medium">Port:</span> {device.port_name}
                      </div>
                      
                      {/* Serial Number Row */}
                      {device.serial_number && (
                        <div className="text-xs text-muted-foreground truncate select-none">
                          <span className="font-medium">Serial:</span> {device.serial_number}
                        </div>
                      )}
                      
                      {/* Firmware Row */}
                      {device.device_status && (
                        <div className="text-xs text-muted-foreground truncate select-none">
                          <span className="font-medium">FW:</span> {device.device_status.firmware_version}
                        </div>
                      )}
                      
                      {/* Buttons & Axes Row */}
                      {device.device_status && (
                        <div className="text-xs text-muted-foreground truncate select-none">
                          <span className="font-medium">Controls:</span> {device.device_status.axes_count}A, {device.device_status.buttons_count}B
                        </div>
                      )}
                      
                      {/* Connection Button Row */}
                      <div className="pt-1">
                        {getConnectionAction(device, isDeviceConnected)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
          
          {devices.length > 0 && (
            <>
              <Separator className="my-3" />
              <div className="text-xs text-muted-foreground select-none">
                Connect your device via USB and ensure it's in configuration mode.
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Device Configuration Section */}
      {isConnected && (
        <DeviceConfiguration 
          parsedAxes={parsedAxes}
          parsedButtons={parsedButtons}
          setParsedAxes={setParsedAxes}
          setParsedButtons={setParsedButtons}
          setDevicePinAssignments={setDevicePinAssignments}
        />
      )}
    </div>
  );
}