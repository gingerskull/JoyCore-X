import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Settings, Joystick, MousePointer, User, Save, Upload, Download, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

import { useDeviceContext } from '@/contexts/DeviceContext';
import { AxisConfiguration } from './AxisConfiguration';
import { ButtonConfiguration } from './ButtonConfiguration';
import { ProfileManagement } from './ProfileManagement';
import type { DeviceStatus, AxisConfig, ButtonConfig } from '@/lib/types';

export function ConfigurationTabs() {
  const { connectedDevice, getDeviceStatus, isConnected } = useDeviceContext();
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  
  // Configuration states
  const [buttonConfigs, setButtonConfigs] = useState<ButtonConfig[]>([]);
  const [axisConfigs, setAxisConfigs] = useState<AxisConfig[]>([]);

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
      setIsLoading(false);
      setIsSaving(false);
      setError(null);
    }
  }, [isConnected]);

  const handleSaveConfiguration = async () => {
    setIsSaving(true);
    setError(null);
    
    try {
      await invoke('save_device_config');
      setLastSaved(new Date());
      // TODO: Show success toast
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save configuration';
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadConfiguration = async () => {
    if (!deviceStatus) {
      setError('No device status available');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // First, load configuration from device storage (/config.bin)
      console.log('Loading configuration from device...');
      await invoke('load_device_config');
      console.log('Device configuration loaded from storage');
      
      // Now read the loaded configuration data
      // Try to read the first button config to test if communication is working
      let communicationWorking = false;
      if (deviceStatus.buttons_count > 0) {
        try {
          await invoke('read_button_config', { buttonId: 0 });
          communicationWorking = true;
        } catch (testErr) {
          console.warn('Communication test failed, using defaults');
        }
      }
      
      if (communicationWorking) {
        // If communication works, load actual configurations
        console.log('Communication working, loading actual configurations...');
        
        // Load button configurations
        const loadedButtonConfigs: ButtonConfig[] = [];
        for (let i = 0; i < deviceStatus.buttons_count; i++) {
          try {
            const config: ButtonConfig = await invoke('read_button_config', { buttonId: i });
            loadedButtonConfigs.push(config);
          } catch (err) {
            // If individual config fails, use default
            loadedButtonConfigs.push({
              id: i,
              name: `Button ${i + 1}`,
              function: 'normal',
              enabled: true,
            });
          }
        }
        
        // Load axis configurations
        const loadedAxisConfigs: AxisConfig[] = [];
        for (let i = 0; i < deviceStatus.axes_count; i++) {
          try {
            const config: AxisConfig = await invoke('read_axis_config', { axisId: i });
            loadedAxisConfigs.push(config);
          } catch (err) {
            // If individual config fails, use default
            loadedAxisConfigs.push({
              id: i,
              name: `Axis ${i + 1}`,
              min_value: -32768,
              max_value: 32767,
              center_value: 0,
              deadzone: 100,
              curve: 'linear',
              inverted: false,
            });
          }
        }
        
        setButtonConfigs(loadedButtonConfigs);
        setAxisConfigs(loadedAxisConfigs);
      } else {
        // Communication not working, just use defaults
        console.log('Communication not working, using default configurations');
        
        const defaultButtonConfigs: ButtonConfig[] = [];
        for (let i = 0; i < deviceStatus.buttons_count; i++) {
          defaultButtonConfigs.push({
            id: i,
            name: `Button ${i + 1}`,
            function: 'normal',
            enabled: true,
          });
        }
        
        const defaultAxisConfigs: AxisConfig[] = [];
        for (let i = 0; i < deviceStatus.axes_count; i++) {
          defaultAxisConfigs.push({
            id: i,
            name: `Axis ${i + 1}`,
            min_value: -32768,
            max_value: 32767,
            center_value: 0,
            deadzone: 100,
            curve: 'linear',
            inverted: false,
          });
        }
        
        setButtonConfigs(defaultButtonConfigs);
        setAxisConfigs(defaultAxisConfigs);
      }
      
      console.log('Configuration loaded successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load configuration from device';
      setError(errorMessage);
      console.error('Failed to load device config:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFactoryReset = async () => {
    // TODO: Add confirmation dialog
    setIsLoading(true);
    setError(null);
    
    try {
      // This would need to be implemented in the backend
      // await invoke('factory_reset');
      // TODO: Show success toast and refresh configuration data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Factory reset not yet implemented';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
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
                  disabled={isLoading}
                  size="sm"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Load from Device
                </Button>
                
                <Button
                  variant="outline"
                  onClick={handleFactoryReset}
                  disabled={isLoading}
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
            
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
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
            axisConfigs={axisConfigs}
            onConfigUpdate={setAxisConfigs}
          />
        </TabsContent>

        <TabsContent value="buttons" className="space-y-4">
          <ButtonConfiguration 
            deviceStatus={deviceStatus} 
            isConnected={isConnected} 
            buttonConfigs={buttonConfigs}
            onConfigUpdate={setButtonConfigs}
          />
        </TabsContent>

        <TabsContent value="profiles" className="space-y-4">
          <ProfileManagement deviceStatus={deviceStatus} />
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>
                Advanced device configuration and diagnostics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Settings className="w-12 h-12 mx-auto mb-2" />
                <p>Advanced settings coming soon...</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}