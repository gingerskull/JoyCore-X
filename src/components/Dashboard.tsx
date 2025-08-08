import { useEffect, useState } from 'react';
import { RefreshCw, Settings, Gamepad2, Usb, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

import { useDevice } from '@/hooks/useDevice';
import { DeviceConnection } from './DeviceConnection';
import { ConfigurationTabs } from './ConfigurationTabs';

export function Dashboard() {
  const {
    devices,
    connectedDevice,
    connectionInfo,
    isLoading,
    error,
    discoverDevices,
    refreshDevices,
    isConnected,
    hasError,
    clearError
  } = useDevice();

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  // Auto-discover devices on mount
  useEffect(() => {
    discoverDevices();
  }, [discoverDevices]);

  // Refresh devices periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!isLoading) {
        await refreshDevices();
        setLastRefresh(new Date());
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [refreshDevices, isLoading]);

  const handleRefresh = async () => {
    clearError();
    await discoverDevices();
    setLastRefresh(new Date());
  };

  const getConnectionStatusBadge = () => {
    switch (connectionInfo.status) {
      case 'connected':
        return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Connected
        </Badge>;
      case 'connecting':
        return <Badge variant="secondary">
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          Connecting
        </Badge>;
      case 'error':
        return <Badge variant="destructive">
          <AlertCircle className="w-3 h-3 mr-1" />
          Error
        </Badge>;
      default:
        return <Badge variant="outline">
          <Usb className="w-3 h-3 mr-1" />
          Disconnected
        </Badge>;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b">
        <div className="flex h-16 items-center px-6">
          <div className="flex items-center space-x-2">
            <Gamepad2 className="h-6 w-6" />
            <h1 className="text-xl font-semibold">JoyCore-X</h1>
            <Badge variant="outline" className="ml-2">v0.1.0</Badge>
          </div>
          
          <div className="ml-auto flex items-center space-x-4">
            {getConnectionStatusBadge()}
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-80 border-r bg-muted/30">
          <div className="p-6">
            <h2 className="text-lg font-medium mb-4">Device Connection</h2>
            <DeviceConnection />
          </div>
        </div>

        {/* Main Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-6 flex-1">
            {/* Error Alert */}
            {hasError && (error || connectionInfo.error) && (
              <Alert variant="destructive" className="mb-6">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {error || connectionInfo.error}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="ml-2"
                    onClick={clearError}
                  >
                    Dismiss
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Main Dashboard Content */}
            {isConnected ? (
              <ConfigurationTabs />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="max-w-md">
                  <Gamepad2 className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No Device Connected</h3>
                  <p className="text-muted-foreground mb-4">
                    Connect to a JoyCore device to start configuring your HOTAS controller.
                  </p>
                  
                  {devices.length === 0 ? (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        No JoyCore devices detected.
                      </p>
                      <Button onClick={handleRefresh} disabled={isLoading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                        Scan for Devices
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Select a device from the sidebar to connect.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Status Bar */}
          <div className="border-t bg-muted/30 px-6 py-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center space-x-4">
                <span>Devices: {devices.length}</span>
                {connectedDevice && (
                  <>
                    <Separator orientation="vertical" className="h-4" />
                    <span>
                      Connected: {connectedDevice.product || connectedDevice.port_name}
                    </span>
                    {connectedDevice.device_status && (
                      <>
                        <Separator orientation="vertical" className="h-4" />
                        <span>
                          FW: {connectedDevice.device_status.firmware_version}
                        </span>
                      </>
                    )}
                  </>
                )}
              </div>
              
              <div className="flex items-center space-x-2">
                <span>Last refresh: {lastRefresh.toLocaleTimeString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}