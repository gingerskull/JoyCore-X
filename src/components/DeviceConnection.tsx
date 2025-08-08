import { useState } from 'react';
import { Usb, Wifi, WifiOff, AlertTriangle, CheckCircle2, Loader2, Info } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

import { useDeviceContext } from '@/contexts/DeviceContext';
import type { Device } from '@/lib/types';

export function DeviceConnection() {
  const {
    devices,
    connectedDevice,
    connectionInfo,
    isLoading,
    connectDevice,
    disconnectDevice,
    discoverDevices,
    isConnected,
    isConnecting
  } = useDeviceContext();

  const [connectingToId, setConnectingToId] = useState<string | null>(null);

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

  const getDeviceStatusIcon = (device: Device) => {
    const state = device.connection_state;
    
    if (state === 'Connected') {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    } else if (state === 'Connecting') {
      return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
    } else if (typeof state === 'object' && 'Error' in state) {
      return <AlertTriangle className="h-4 w-4 text-red-600" />;
    }
    
    return <WifiOff className="h-4 w-4 text-gray-400" />;
  };

  const getDeviceStatusText = (device: Device) => {
    const state = device.connection_state;
    
    if (state === 'Connected') {
      return 'Connected';
    } else if (state === 'Connecting') {
      return 'Connecting...';
    } else if (typeof state === 'object' && 'Error' in state) {
      return `Error: ${state.Error}`;
    }
    
    return 'Disconnected';
  };

  return (
    <div className="space-y-4">
      {/* Connection Status Card */}
      {isConnected && connectedDevice && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Connected Device</CardTitle>
              <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Active
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center space-x-2">
              <Usb className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">
                {connectedDevice.product || 'JoyCore Device'}
              </span>
            </div>
            
            <div className="text-sm text-muted-foreground space-y-1">
              <div>Port: {connectedDevice.port_name}</div>
              {connectedDevice.serial_number && (
                <div>S/N: {connectedDevice.serial_number}</div>
              )}
              {connectedDevice.device_status && (
                <>
                  <div>Firmware: {connectedDevice.device_status.firmware_version}</div>
                  <div>
                    Axes: {connectedDevice.device_status.axes_count} | 
                    Buttons: {connectedDevice.device_status.buttons_count}
                  </div>
                </>
              )}
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDisconnect}
              disabled={isLoading}
              className="w-full"
            >
              <WifiOff className="w-4 h-4 mr-2" />
              Disconnect
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Available Devices */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Available Devices</CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={discoverDevices}
              disabled={isLoading}
            >
              <Loader2 className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <CardDescription>
            JoyCore devices detected on your system
          </CardDescription>
        </CardHeader>
        <CardContent>
          {devices.length === 0 ? (
            <div className="text-center py-6">
              <Usb className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No JoyCore devices found
              </p>
              <Button 
                variant="ghost" 
                size="sm" 
                className="mt-2"
                onClick={discoverDevices}
                disabled={isLoading}
              >
                Scan Again
              </Button>
            </div>
          ) : (
            <ScrollArea className="max-h-64">
              <div className="space-y-2">
                {devices.map((device) => {
                  const isDeviceConnecting = connectingToId === device.id || 
                    (isConnecting && connectedDevice?.id === device.id);
                  const isDeviceConnected = device.connection_state === 'Connected';
                  
                  return (
                    <Card key={device.id} className={`p-3 ${isDeviceConnected ? 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-950/20' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          {getDeviceStatusIcon(device)}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {device.product || 'JoyCore Device'}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {device.port_name}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          {!isDeviceConnected && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleConnect(device.id)}
                              disabled={isLoading || isDeviceConnecting || isConnected}
                            >
                              {isDeviceConnecting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Wifi className="w-3 h-3" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Device Details */}
                      {device.connection_state !== 'Disconnected' && (
                        <>
                          <Separator className="my-2" />
                          <div className="text-xs text-muted-foreground">
                            Status: {getDeviceStatusText(device)}
                          </div>
                        </>
                      )}
                      
                      {/* Device Info */}
                      {device.device_status && (
                        <>
                          <Separator className="my-2" />
                          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                            <span>FW: {device.device_status.firmware_version}</span>
                            <span>Axes: {device.device_status.axes_count}</span>
                            <span>Buttons: {device.device_status.buttons_count}</span>
                          </div>
                        </>
                      )}
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Help Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center">
            <Info className="w-4 h-4 mr-2" />
            Connection Help
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>• Connect your JoyCore device via USB</p>
            <p>• Ensure the device is in configuration mode</p>
            <p>• Check that drivers are properly installed</p>
            <p>• Try unplugging and reconnecting if not detected</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}