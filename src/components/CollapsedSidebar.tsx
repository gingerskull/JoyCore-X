import { useState } from 'react';
import { PanelLeft, Usb, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import { useDeviceContext } from '@/contexts/DeviceContext';
import { DeviceConfiguration } from './DeviceConfiguration';
import type { Device, ParsedAxisConfig, ParsedButtonConfig, PinFunction } from '@/lib/types';

interface DevicePinAssignments {
  [gpioPin: number]: PinFunction;
}

interface CollapsedSidebarProps {
  onExpand: () => void;
  parsedAxes: ParsedAxisConfig[];
  parsedButtons: ParsedButtonConfig[];
  setParsedAxes: (axes: ParsedAxisConfig[]) => void;
  setParsedButtons: (buttons: ParsedButtonConfig[]) => void;
  setDevicePinAssignments?: (pinAssignments: DevicePinAssignments | undefined) => void;
}

export function CollapsedSidebar({ onExpand, parsedAxes, parsedButtons, setParsedAxes, setParsedButtons, setDevicePinAssignments }: CollapsedSidebarProps) {
  const {
    devices,
    connectedDevice,
    isLoading,
    connectDevice,
    disconnectDevice,
    isConnected,
    isConnecting
  } = useDeviceContext();

  const [hoveredDevice, setHoveredDevice] = useState<string | null>(null);
  const [connectingToId, setConnectingToId] = useState<string | null>(null);

  const getDeviceStatusColor = (device: Device) => {
    if (device.connection_state === 'Connected') {
      return 'bg-green-500 shadow-green-500/50';
    } else if (device.connection_state === 'Connecting' || connectingToId === device.id) {
      return 'bg-blue-500 shadow-blue-500/50 animate-pulse';
    } else if (typeof device.connection_state === 'object' && 'Error' in device.connection_state) {
      return 'bg-red-500 shadow-red-500/50';
    }
    return 'bg-gray-300 dark:bg-gray-600';
  };

  const getDeviceStatusIcon = (device: Device) => {
    if (device.connection_state === 'Connected') {
      return <CheckCircle2 className="w-3 h-3 text-white" />;
    } else if (device.connection_state === 'Connecting' || connectingToId === device.id) {
      return <Loader2 className="w-3 h-3 text-white animate-spin" />;
    } else if (typeof device.connection_state === 'object' && 'Error' in device.connection_state) {
      return <AlertTriangle className="w-3 h-3 text-white" />;
    }
    return <Usb className="w-3 h-3 text-gray-600 dark:text-gray-300" />;
  };

  const handleDeviceClick = async (device: Device) => {
    const isDeviceConnected = device.connection_state === 'Connected';
    
    if (isDeviceConnected) {
      // Disconnect the connected device
      await disconnectDevice();
    } else {
      // Connect to the device
      setConnectingToId(device.id);
      try {
        await connectDevice(device.id);
      } finally {
        setConnectingToId(null);
      }
    }
  };

  // const getOverallStatus = () => {
  //   if (isConnected) return 'connected';
  //   if (devices.length === 0) return 'no-devices';
  //   return 'available';
  // };

  // const getStatusColor = () => {
  //   switch (getOverallStatus()) {
  //     case 'connected':
  //       return 'text-green-600 dark:text-green-400';
  //     case 'no-devices':
  //       return 'text-gray-400 dark:text-gray-500';
  //     case 'available':
  //       return 'text-blue-600 dark:text-blue-400';
  //     default:
  //       return 'text-gray-400';
  //   }
  // };

  return (
    <div className="h-full p-3">
      <div className="bg-card border rounded-lg shadow-sm h-full flex flex-col p-4 space-y-4">
        {/* Expand Button Section */}
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={onExpand}
            className="h-8 w-8 p-0 cursor-pointer"
            title="Expand device panel"
          >
            <PanelLeft className="w-4 h-4" />
          </Button>
        </div>

        {/* Device Count Section */}
        <div className="flex flex-col items-center space-y-1">
          <Badge variant="outline" className="rounded-sm w-8 h-8 text-xs flex items-center justify-center">
            {devices.length}
          </Badge>
          
        </div>

        {/* Device Tower */}
        <div className="flex-1 flex flex-col items-center space-y-2 max-h-40 [&::-webkit-scrollbar]:hidden w-full">
        {devices.length === 0 ? (
          <div className="flex flex-col items-center space-y-2 opacity-50">
            <Usb className="w-6 h-6 text-muted-foreground" />
            <div className="text-xs text-muted-foreground text-center leading-tight">
              No<br />Devices
            </div>
          </div>
        ) : (
          devices.map((device) => {
            const isDeviceConnected = device.connection_state === 'Connected';
            const isDeviceConnecting = connectingToId === device.id || 
              (isConnecting && connectedDevice?.id === device.id);
            
            return (
              <div
                key={device.id}
                className="relative"
                onMouseEnter={() => setHoveredDevice(device.id)}
                onMouseLeave={() => setHoveredDevice(null)}
              >
                {/* Device Status Pill */}
                <button
                  onClick={() => handleDeviceClick(device)}
                  disabled={isDeviceConnecting || isLoading}
                  className={`
                    w-8 h-8 rounded-sm flex items-center justify-center 
                    transition-all duration-200 cursor-pointer
                    ${getDeviceStatusColor(device)}
                    ${!isDeviceConnecting && !isLoading ? 'hover:scale-110' : ''}
                  `}
                >
                  {getDeviceStatusIcon(device)}
                </button>

                {/* Hover Tooltip */}
                {hoveredDevice === device.id && (
                  <div className="absolute left-16 top-0 z-50 bg-popover border rounded-md shadow-md p-2 min-w-48 max-w-64">
                    <div className="text-xs space-y-1">
                      <div className="font-medium truncate">{device.product || 'JoyCore Device'}</div>
                      <div className="text-muted-foreground truncate">{device.port_name}</div>
                      {device.device_status && (
                        <div className="text-muted-foreground truncate">
                          FW: {device.device_status.firmware_version}
                        </div>
                      )}
                      <div className={`text-xs ${
                        isDeviceConnected ? 'text-green-600' :
                        isDeviceConnecting ? 'text-blue-600' : 'text-muted-foreground'
                      }`}>
                        {isDeviceConnected ? 'Click to disconnect' :
                         isDeviceConnecting ? 'Connecting...' : 'Click to connect'}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        </div>

        {/* Device Configuration Section */}
        {isConnected && (
          <>
            <Separator className="my-2" />
            <DeviceConfiguration 
              collapsed={true}
              parsedAxes={parsedAxes}
              parsedButtons={parsedButtons}
              setParsedAxes={setParsedAxes}
              setParsedButtons={setParsedButtons}
              setDevicePinAssignments={setDevicePinAssignments}
            />
          </>
        )}
      </div>
    </div>
  );
}