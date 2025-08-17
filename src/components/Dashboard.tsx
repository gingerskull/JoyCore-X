import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Gamepad2, AlertCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

import { useDeviceContext } from '@/contexts/DeviceContext';
import { useDeviceConfigReader } from '@/hooks/useDeviceConfigReader';
import { DeviceList } from './DeviceList';
import { CollapsedSidebar } from './CollapsedSidebar';
import { ConfigurationTabs } from './ConfigurationTabs';
import { FirmwareUpdateDialog } from './FirmwareUpdateDialog';
import { FirmwareUpdateNotification } from './FirmwareUpdateNotification';
import { useFirmwareUpdates } from '@/hooks/useFirmwareUpdates';
import type { DeviceStatus, ParsedAxisConfig, ParsedButtonConfig, PinFunction } from '@/lib/types';

interface DevicePinAssignments {
  [gpioPin: number]: PinFunction;
}

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
    clearError,
    getDeviceStatus
  } = useDeviceContext();

  const { isLoading: configLoading, clearError: clearConfigError } = useDeviceConfigReader();

  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  // Device configuration state
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [parsedAxes, setParsedAxes] = useState<ParsedAxisConfig[]>([]);
  const [parsedButtons, setParsedButtons] = useState<ParsedButtonConfig[]>([]);
  const [devicePinAssignments, setDevicePinAssignments] = useState<DevicePinAssignments | undefined>(undefined);

  // Firmware update state
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showUpdateNotification, setShowUpdateNotification] = useState(false);
  const [notificationDismissed, setNotificationDismissed] = useState(false);

  // Get current firmware version from connected device
  const currentFirmwareVersion = connectedDevice?.device_status?.firmware_version;

  // Use firmware update hook
  const {
    isChecking: isCheckingUpdates,
    hasUpdateAvailable,
    latestVersion,
  } = useFirmwareUpdates({
    currentVersion: currentFirmwareVersion,
    autoCheck: true,
  });

  // Auto-discover devices on mount
  useEffect(() => {
    discoverDevices();
  }, [discoverDevices]);

  // Load device status when connected
  useEffect(() => {
    const loadDeviceStatus = async () => {
      if (!connectedDevice) {
        setDeviceStatus(null);
        return;
      }
      
      try {
        const status = await getDeviceStatus();
        setDeviceStatus(status);
      } catch (err) {
        console.error('Failed to load device status:', err);
      }
    };

    loadDeviceStatus();
  }, [connectedDevice, getDeviceStatus, isConnected]);

  // Clear states when disconnected (with slight delay to prevent rendering issues)
  useEffect(() => {
    if (isConnected === false) {
      // Use setTimeout to ensure the disconnected UI renders first before clearing config state
      const timeoutId = setTimeout(() => {
        setParsedAxes([]);
        setParsedButtons([]);
        setDeviceStatus(null);
        setDevicePinAssignments(undefined);
        clearConfigError();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isConnected, clearConfigError]);

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

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed]);

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
  }, [sidebarCollapsed, toggleSidebar]);

  // Show update notification when update is available
  useEffect(() => {
    if (hasUpdateAvailable && !notificationDismissed) {
      setShowUpdateNotification(true);
    } else {
      setShowUpdateNotification(false);
    }
  }, [hasUpdateAvailable, notificationDismissed]);

  const handleRefresh = async () => {
    clearError();
    // For manual refresh, only use cleanup if we're not connected
    // This prevents falsely disconnecting active connections
    await refreshDevices(!isConnected); 
    setLastRefresh(new Date());
  };

  const handleUpdateDialogOpen = () => {
    setShowUpdateDialog(true);
    setNotificationDismissed(true);
  };

  const handleUpdateNotificationDismiss = () => {
    setNotificationDismissed(true);
    setShowUpdateNotification(false);
  };


  return (
    <div className="flex h-screen bg-background">
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className={`${sidebarCollapsed ? 'w-20' : 'w-80'} border-r transition-all duration-300 ease-in-out`}>
          {sidebarCollapsed ? (
            <CollapsedSidebar 
              onExpand={() => setSidebarCollapsed(false)}
              parsedAxes={parsedAxes}
              parsedButtons={parsedButtons}
              setParsedAxes={setParsedAxes}
              setParsedButtons={setParsedButtons}
              setDevicePinAssignments={setDevicePinAssignments}
              onUpdateDialogOpen={handleUpdateDialogOpen}
            />
          ) : (
            <div className="p-3 h-full overflow-y-auto">
              <DeviceList 
                onCollapse={() => setSidebarCollapsed(true)}
                deviceCount={devices.length}
                onRefresh={handleRefresh}
                isLoading={isLoading}
                parsedAxes={parsedAxes}
                parsedButtons={parsedButtons}
                setParsedAxes={setParsedAxes}
                setParsedButtons={setParsedButtons}
                setDevicePinAssignments={setDevicePinAssignments}
                onUpdateDialogOpen={handleUpdateDialogOpen}
              />
            </div>
          )}
        </div>

        {/* Main Panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="p-3 flex-1">
            {/* Firmware Update Notification */}
            {showUpdateNotification && currentFirmwareVersion && latestVersion && (
              <FirmwareUpdateNotification
                currentVersion={currentFirmwareVersion}
                latestVersion={latestVersion}
                isVisible={showUpdateNotification}
                onCheckUpdates={handleUpdateDialogOpen}
                onDismiss={handleUpdateNotificationDismiss}
              />
            )}
            
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
              <ConfigurationTabs 
                deviceStatus={deviceStatus}
                parsedAxes={parsedAxes}
                parsedButtons={parsedButtons}
                isConfigLoading={configLoading}
                devicePinAssignments={devicePinAssignments}
              />
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

      {/* Firmware Update Dialog */}
      {currentFirmwareVersion && (
        <FirmwareUpdateDialog
          currentVersion={currentFirmwareVersion}
          isOpen={showUpdateDialog}
          onClose={() => setShowUpdateDialog(false)}
          repoOwner="gingerskull"
          repoName="JoyCore-FW"
        />
      )}
    </div>
  );
}