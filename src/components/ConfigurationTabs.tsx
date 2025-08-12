import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, Joystick, MousePointer, User, Save, Upload, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
// import { Separator } from '@/components/ui/separator';
// import { Progress } from '@/components/ui/progress';

import { useDeviceContext } from '@/contexts/DeviceContext';
import { useDeviceConfigReader } from '@/hooks/useDeviceConfigReader';
import { AxisConfiguration } from './AxisConfiguration';
import { ButtonConfiguration } from './ButtonConfiguration';
import { ProfileManagement } from './ProfileManagement';
import { DeviceConfigManagement } from './DeviceConfigManagement';
import type { DeviceStatus, ParsedAxisConfig, ParsedButtonConfig } from '@/lib/types';

export function ConfigurationTabs() {
  const { connectedDevice, getDeviceStatus, isConnected } = useDeviceContext();
  const { isLoading: configLoading, error: configError, readConfiguration, clearError } = useDeviceConfigReader();
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  // Real configuration states (no defaults!)
  const [parsedAxes, setParsedAxes] = useState<ParsedAxisConfig[]>([]);
  const [parsedButtons, setParsedButtons] = useState<ParsedButtonConfig[]>([]);

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
      setParsedAxes([]);
      setParsedButtons([]);
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
      const config = await readConfiguration();
      if (config) {
        setParsedAxes(config.axes);
        setParsedButtons(config.buttons);
        console.log(`Loaded ${config.axes.length} axes and ${config.buttons.length} buttons from config.bin`);
      } else {
        // Clear arrays if no config available
        setParsedAxes([]);
        setParsedButtons([]);
        console.warn('No configuration could be read from device');
      }
    } catch (err) {
      console.error('Failed to read device configuration:', err);
      // Clear arrays on error
      setParsedAxes([]);
      setParsedButtons([]);
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
      await handleLoadConfiguration();
    } catch (err) {
      console.error('Factory reset failed:', err);
    }
  };

  if (!connectedDevice) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Device Status Header */}
      {deviceStatus && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center">
                  <Settings className="w-5 h-5 mr-2" />
                  Device Configuration
                </CardTitle>
                <CardDescription>
                  Configure your {deviceStatus.device_name} HOTAS controller
                </CardDescription>
              </div>
              
              <div className="flex items-center space-x-2">
                <Badge variant="outline">
                  FW {deviceStatus.firmware_version}
                </Badge>
                <Badge variant="secondary">
                  {deviceStatus.axes_count} Axes
                </Badge>
                <Badge variant="secondary">
                  {deviceStatus.buttons_count} Buttons
                </Badge>
              </div>
            </div>
          </CardHeader>
          
          {/* Action Buttons */}
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Button
                  onClick={handleSaveConfiguration}
                  disabled={isSaving}
                  size="sm"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save to Device'}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={handleLoadConfiguration}
                  disabled={configLoading}
                  size="sm"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {configLoading ? 'Reading...' : 'Load from Device'}
                </Button>
                
                <Button
                  variant="outline"
                  onClick={handleFactoryReset}
                  disabled={configLoading}
                  size="sm"
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Factory Reset
                </Button>
              </div>
              
              {lastSaved && (
                <div className="text-sm text-muted-foreground">
                  Last saved: {lastSaved.toLocaleTimeString()}
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
      )}

      {/* Configuration Tabs */}
      <Tabs defaultValue="axes" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="axes" className="flex items-center">
            <Joystick className="w-4 h-4 mr-2" />
            Axes
          </TabsTrigger>
          <TabsTrigger value="buttons" className="flex items-center">
            <MousePointer className="w-4 h-4 mr-2" />
            Buttons
          </TabsTrigger>
          <TabsTrigger value="profiles" className="flex items-center">
            <User className="w-4 h-4 mr-2" />
            Profiles
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center">
            <Settings className="w-4 h-4 mr-2" />
            Advanced
          </TabsTrigger>
        </TabsList>

        <TabsContent value="axes" className="space-y-4">
          <AxisConfiguration 
            deviceStatus={deviceStatus} 
            isConnected={isConnected} 
            parsedAxes={parsedAxes}
            isLoading={configLoading}
          />
        </TabsContent>

        <TabsContent value="buttons" className="space-y-4">
          <ButtonConfiguration 
            deviceStatus={deviceStatus} 
            isConnected={isConnected} 
            parsedButtons={parsedButtons}
            isLoading={configLoading}
          />
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <ProfileManagement deviceStatus={deviceStatus} />
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <DeviceConfigManagement />
        </TabsContent>
      </Tabs>
    </div>
  );
}