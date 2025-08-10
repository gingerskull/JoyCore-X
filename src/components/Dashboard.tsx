import { useEffect, useState } from 'react';
import { RefreshCw, Gamepad2, AlertCircle, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

import { useDeviceContext } from '@/contexts/DeviceContext';
import { DeviceList } from './DeviceList';
import { CollapsedSidebar } from './CollapsedSidebar';
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
    refreshDevicesSilently,
    isConnected,
    hasError,
    clearError
  } = useDeviceContext();

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    // Load saved preference from localStorage
    const saved = localStorage.getItem('joycore-sidebar-collapsed');
    return saved ? JSON.parse(saved) : false;
  });

  // Auto-discover devices on mount
  useEffect(() => {
    discoverDevices();
  }, [discoverDevices]);

  // Refresh devices periodically (silent background refresh)
  useEffect(() => {
    const interval = setInterval(async () => {
      // Always use cleanup to detect physical disconnections for all device states
      // Use silent refresh to avoid loading UI flicker
      await refreshDevicesSilently(true);
      setLastRefresh(new Date());
    }, isConnected ? 3000 : 2000); // 3s when connected, 2s when disconnected for faster updates

    return () => clearInterval(interval);
  }, [refreshDevicesSilently, isConnected]);

  // Keyboard shortcut for sidebar toggle (Ctrl+B)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 'b') {
        event.preventDefault();
        toggleSidebar();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [sidebarCollapsed]);

  const handleRefresh = async () => {
    clearError();
    // For manual refresh, only use cleanup if we're not connected
    // This prevents falsely disconnecting active connections
    await refreshDevices(!isConnected); 
    setLastRefresh(new Date());
  };

  const toggleSidebar = () => {
    const newState = !sidebarCollapsed;
    setSidebarCollapsed(newState);
    localStorage.setItem('joycore-sidebar-collapsed', JSON.stringify(newState));
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
        <div className={`${sidebarCollapsed ? 'w-20' : 'w-80'} border-r transition-all duration-300 ease-in-out`}>
          {sidebarCollapsed ? (
            <CollapsedSidebar onExpand={() => setSidebarCollapsed(false)} />
          ) : (
            <div className="p-3">
              <DeviceList 
                onCollapse={() => setSidebarCollapsed(true)}
                deviceCount={devices.length}
                onRefresh={handleRefresh}
                isLoading={isLoading}
              />
            </div>
          )}
        </div>

        {/* Main Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 flex-1">
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