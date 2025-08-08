import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sliders, RotateCcw } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

import type { DeviceStatus, AxisConfig } from '@/lib/types';

interface AxisConfigurationProps {
  deviceStatus: DeviceStatus | null;
  isConnected?: boolean;
  axisConfigs?: AxisConfig[];
  onConfigUpdate?: (configs: AxisConfig[]) => void;
}

export function AxisConfiguration({ deviceStatus, isConnected = false, axisConfigs, onConfigUpdate }: AxisConfigurationProps) {
  const [localAxisConfigs, setLocalAxisConfigs] = useState<AxisConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAxis, setSelectedAxis] = useState<number>(0);

  // Use provided configs or local state
  const configs = axisConfigs || localAxisConfigs;

  // Initialize default configurations when device status changes (only if no configs provided)
  useEffect(() => {
    if (axisConfigs) return; // Use provided configs
    
    if (!deviceStatus || deviceStatus.axes_count === 0 || isConnected === false) {
      setLocalAxisConfigs([]);
      return;
    }
    
    // Create default configurations without loading from device
    const defaultConfigs: AxisConfig[] = [];
    for (let i = 0; i < deviceStatus.axes_count; i++) {
      defaultConfigs.push({
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
    setLocalAxisConfigs(defaultConfigs);
  }, [deviceStatus, isConnected, axisConfigs]);

  // Clear configurations when disconnected
  useEffect(() => {
    if (isConnected === false) {
      setLocalAxisConfigs([]);
      setIsLoading(false);
    }
  }, [isConnected]);

  const updateAxisConfig = async (axisId: number, updates: Partial<AxisConfig>) => {
    if (isConnected === false) return;
    
    const currentConfig = configs.find(c => c.id === axisId);
    if (!currentConfig) return;

    const updatedConfig = { ...currentConfig, ...updates };
    
    try {
      await invoke('write_axis_config', { config: updatedConfig });
      
      if (axisConfigs && onConfigUpdate) {
        // Using provided configs - notify parent
        const updatedConfigs = configs.map(c => c.id === axisId ? updatedConfig : c);
        onConfigUpdate(updatedConfigs);
      } else {
        // Using local state
        setLocalAxisConfigs(prev => prev.map(c => c.id === axisId ? updatedConfig : c));
      }
    } catch (err) {
      console.error('Failed to update axis config:', err);
    }
  };

  const currentAxis = configs.find(c => c.id === selectedAxis);

  if (!deviceStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">No device connected</p>
        </CardContent>
      </Card>
    );
  }

  if (deviceStatus.axes_count === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Sliders className="w-5 h-5 mr-2" />
            Axis Configuration
          </CardTitle>
          <CardDescription>Configure analog input axes</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">This device has no configurable axes</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Axis Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Axis Selection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {configs.map((axis) => (
            <Button
              key={axis.id}
              variant={selectedAxis === axis.id ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setSelectedAxis(axis.id)}
            >
              <Sliders className="w-4 h-4 mr-2" />
              {axis.name}
            </Button>
          ))}
        </CardContent>
      </Card>

      {/* Axis Configuration */}
      {currentAxis && (
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Sliders className="w-5 h-5 mr-2" />
                {currentAxis.name} Configuration
              </CardTitle>
              <CardDescription>
                Configure settings for axis {currentAxis.id + 1}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Axis Name */}
              <div className="space-y-2">
                <Label htmlFor={`axis-name-${currentAxis.id}`}>Axis Name</Label>
                <Input
                  id={`axis-name-${currentAxis.id}`}
                  value={currentAxis.name}
                  onChange={(e) => updateAxisConfig(currentAxis.id, { name: e.target.value })}
                />
              </div>

              {/* Range Settings */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Minimum Value</Label>
                  <Input
                    type="number"
                    value={currentAxis.min_value}
                    onChange={(e) => updateAxisConfig(currentAxis.id, { min_value: parseInt(e.target.value) || -32768 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Center Value</Label>
                  <Input
                    type="number"
                    value={currentAxis.center_value}
                    onChange={(e) => updateAxisConfig(currentAxis.id, { center_value: parseInt(e.target.value) || 0 })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Maximum Value</Label>
                  <Input
                    type="number"
                    value={currentAxis.max_value}
                    onChange={(e) => updateAxisConfig(currentAxis.id, { max_value: parseInt(e.target.value) || 32767 })}
                  />
                </div>
              </div>

              {/* Deadzone */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Deadzone</Label>
                  <span className="text-sm text-muted-foreground">{currentAxis.deadzone}</span>
                </div>
                <Slider
                  value={[currentAxis.deadzone]}
                  onValueChange={([value]) => updateAxisConfig(currentAxis.id, { deadzone: value })}
                  max={1000}
                  min={0}
                  step={10}
                  className="w-full"
                />
              </div>

              {/* Response Curve */}
              <div className="space-y-2">
                <Label>Response Curve</Label>
                <Select 
                  value={currentAxis.curve} 
                  onValueChange={(value) => updateAxisConfig(currentAxis.id, { curve: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="linear">Linear</SelectItem>
                    <SelectItem value="curve1">Smooth Curve</SelectItem>
                    <SelectItem value="curve2">Aggressive Curve</SelectItem>
                    <SelectItem value="logarithmic">Logarithmic</SelectItem>
                    <SelectItem value="exponential">Exponential</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Inverted */}
              <div className="flex items-center space-x-2">
                <Switch
                  id={`axis-inverted-${currentAxis.id}`}
                  checked={currentAxis.inverted}
                  onCheckedChange={(checked) => updateAxisConfig(currentAxis.id, { inverted: checked })}
                />
                <Label htmlFor={`axis-inverted-${currentAxis.id}`}>Invert Axis</Label>
              </div>

              {/* Reset to Defaults */}
              <div className="pt-4 border-t">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const defaultConfig: Partial<AxisConfig> = {
                      min_value: -32768,
                      max_value: 32767,
                      center_value: 0,
                      deadzone: 100,
                      curve: 'linear',
                      inverted: false,
                    };
                    updateAxisConfig(currentAxis.id, defaultConfig);
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Reset to Defaults
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Live Preview (placeholder) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Live Preview</CardTitle>
              <CardDescription>Real-time axis input visualization</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Sliders className="w-8 h-8 mx-auto mb-2" />
                <p>Live axis preview coming soon...</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}