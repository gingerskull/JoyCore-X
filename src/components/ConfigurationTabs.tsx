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

import { useDevice } from '@/hooks/useDevice';
import { AxisConfiguration } from './AxisConfiguration';
import { ButtonConfiguration } from './ButtonConfiguration';
import { ProfileManagement } from './ProfileManagement';
import type { DeviceStatus, AxisConfig, ButtonConfig } from '@/lib/types';

export function ConfigurationTabs() {
  const { connectedDevice, getDeviceStatus } = useDevice();
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  }, [connectedDevice, getDeviceStatus]);

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
    setIsLoading(true);
    setError(null);
    
    try {
      await invoke('load_device_config');
      // TODO: Show success toast and refresh configuration data
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load configuration';
      setError(errorMessage);
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
          <AxisConfiguration deviceStatus={deviceStatus} />
        </TabsContent>

        <TabsContent value="buttons" className="space-y-4">
          <ButtonConfiguration deviceStatus={deviceStatus} />
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