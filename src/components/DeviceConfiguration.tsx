import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, Save, Upload, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';

import { useDeviceContext } from '@/contexts/DeviceContext';
import { useDeviceConfigWithPins } from '@/hooks/useDeviceConfigWithPins';
import type { DeviceStatus, ParsedAxisConfig, ParsedButtonConfig, PinFunction } from '@/lib/types';

interface DevicePinAssignments {
  [gpioPin: number]: PinFunction;
}

interface DeviceConfigurationProps {
  collapsed?: boolean;
  parsedAxes: ParsedAxisConfig[];
  parsedButtons: ParsedButtonConfig[];
  setParsedAxes: (axes: ParsedAxisConfig[]) => void;
  setParsedButtons: (buttons: ParsedButtonConfig[]) => void;
  setDevicePinAssignments?: (pinAssignments: DevicePinAssignments | undefined) => void;
}

export function DeviceConfiguration({ 
  collapsed = false, 
  setParsedAxes, 
  setParsedButtons,
  setDevicePinAssignments 
}: DeviceConfigurationProps) {
  const { connectedDevice, getDeviceStatus, isConnected } = useDeviceContext();
  const { isLoading: configLoading, error: configError, readConfigurationWithPins, clearError } = useDeviceConfigWithPins();
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

  // Load device status
  useEffect(() => {
    const loadDeviceStatus = async () => {
      if (!connectedDevice) return;
      
      try {
        const status = await getDeviceStatus();
        setDeviceStatus(status);
      } catch (err) {
        console.error('Failed to load device status:', err);
      }
    };

    loadDeviceStatus();
  }, [connectedDevice, getDeviceStatus, isConnected]);

  // Clear loading states when disconnected
  useEffect(() => {
    if (isConnected === false) {
      setIsSaving(false);
      clearError();
    }
  }, [isConnected, clearError]);

  const handleSaveConfiguration = async () => {
    setIsSaving(true);
    clearError();
    
    try {
      await invoke('save_device_config');
      setLastSaved(new Date());
      // TODO: Show success toast
    } catch (err) {
      console.error('Failed to save configuration:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadConfiguration = async () => {
    if (!deviceStatus) {
      return;
    }
    
    console.log('Reading real configuration from device config.bin...');
    
    try {
      // Load all configuration data in one call
      const config = await readConfigurationWithPins();
      if (config) {
        setParsedAxes(config.axes);
        setParsedButtons(config.buttons);
        console.log(`Loaded ${config.axes.length} axes and ${config.buttons.length} buttons from config.bin`);
        
        // Set pin assignments if callback is provided
        if (setDevicePinAssignments) {
          setDevicePinAssignments(config.pinAssignments);
          console.log(`Loaded ${Object.keys(config.pinAssignments).length} pin assignments from config.bin`);
        }
      } else {
        // Clear arrays if no config available
        setParsedAxes([]);
        setParsedButtons([]);
        if (setDevicePinAssignments) {
          setDevicePinAssignments(undefined);
        }
        console.warn('No configuration could be read from device');
      }
    } catch (err) {
      console.error('Failed to read device configuration:', err);
      // Clear arrays on error
      setParsedAxes([]);
      setParsedButtons([]);
      if (setDevicePinAssignments) {
        setDevicePinAssignments(undefined);
      }
    }
  };

  const handleFactoryReset = async () => {
    // TODO: Add confirmation dialog
    clearError();
    
    try {
      await invoke('reset_device_to_defaults');
      // Clear current config and reload
      setParsedAxes([]);
      setParsedButtons([]);
      if (setDevicePinAssignments) {
        setDevicePinAssignments(undefined);
      }
      await handleLoadConfiguration();
    } catch (err) {
      console.error('Factory reset failed:', err);
    }
  };

  if (!connectedDevice) {
    return null;
  }
  if (!deviceStatus) {
    return (
      <Card className="mt-3 animate-pulse">
        <CardHeader>
          <CardTitle className="flex items-center text-sm">
            <Settings className="w-4 h-4 mr-2" />
            <span className="truncate">Device Configuration</span>
          </CardTitle>
          <CardDescription className="text-xs">Loading device status...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-4 bg-muted rounded mb-2" />
          <div className="h-4 bg-muted rounded w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (collapsed) {
    // Collapsed view with compact controls
    return (
      <div className="space-y-2">

        {/* Action Buttons */}
        <div className="flex flex-col items-center space-y-1">
          <Button
            size="sm"
            onClick={handleSaveConfiguration}
            disabled={isSaving}
            className="w-8 h-8 p-0"
            title="Save to Device"
          >
            <Save className="w-3 h-3" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadConfiguration}
            disabled={configLoading}
            className="w-8 h-8 p-0"
            title="Load from Device"
          >
            <Upload className="w-3 h-3" />
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleFactoryReset}
            disabled={configLoading}
            className="w-8 h-8 p-0"
            title="Factory Reset"
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
        </div>

        {/* Status Indicators */}
        {isSaving && (
          <div className="text-xs text-center text-blue-600 truncate px-1">
            Saving...
          </div>
        )}
        {configLoading && (
          <div className="text-xs text-center text-blue-600 truncate px-1">
            Loading...
          </div>
        )}
        {lastSaved && (
          <div className="text-xs text-center text-muted-foreground truncate px-1">
            {lastSaved.toLocaleTimeString().slice(0, 5)}
          </div>
        )}
      </div>
    );
  }

  // Full view
  return (
    <Card className="mt-3">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center text-sm">
            <Settings className="w-4 h-4 mr-2 flex-shrink-0" />
            <span className="truncate">Device Configuration</span>
          </CardTitle>
          <div className="text-sm font-medium mt-1 truncate">
            {deviceStatus.device_name}
          </div>
          <CardDescription className="text-xs">
            Configure your HOTAS controller
          </CardDescription>
          
          {/* Device Status Badges - New line */}
          <div className="flex flex-wrap gap-1 mt-2">
            <Badge variant="outline" className="text-xs px-2 py-0.5">
              FW {deviceStatus.firmware_version}
            </Badge>
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              {deviceStatus.axes_count} Axes
            </Badge>
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              {deviceStatus.buttons_count} Buttons
            </Badge>
          </div>
        </div>
      </CardHeader>
      
      {/* Action Buttons */}
      <CardContent className="pt-3">
        <div className="space-y-3">
          <div className="flex flex-col space-y-2">
            <Button
              onClick={handleSaveConfiguration}
              disabled={isSaving}
              size="sm"
              className="w-full text-xs"
            >
              <Save className="w-3 h-3 mr-2" />
              {isSaving ? 'Saving...' : 'Save to Device'}
            </Button>
            
            <div className="flex space-x-2">
              <Button
                variant="outline"
                onClick={handleLoadConfiguration}
                disabled={configLoading}
                size="sm"
                className="flex-1 text-xs"
              >
                <Upload className="w-3 h-3 mr-2" />
                {configLoading ? 'Reading...' : 'Load'}
              </Button>
              
              <Button
                variant="outline"
                onClick={handleFactoryReset}
                disabled={configLoading}
                size="sm"
                className="flex-1 text-xs"
                title="Factory Reset"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
            </div>
          </div>
          
          {lastSaved && (
            <div className="text-xs text-muted-foreground text-center">
              Last saved: {lastSaved.toLocaleTimeString().slice(0, 5)}
            </div>
          )}
        </div>
        
        {configError && (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{configError}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}