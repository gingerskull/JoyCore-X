import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { MousePointer, ToggleLeft } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import type { DeviceStatus, ButtonConfig } from '@/lib/types';

interface ButtonConfigurationProps {
  deviceStatus: DeviceStatus | null;
  isConnected?: boolean;
  buttonConfigs?: ButtonConfig[];
  onConfigUpdate?: (configs: ButtonConfig[]) => void;
}

export function ButtonConfiguration({ deviceStatus, isConnected = false, buttonConfigs, onConfigUpdate }: ButtonConfigurationProps) {
  const [localButtonConfigs, setLocalButtonConfigs] = useState<ButtonConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Use provided configs or local state
  const configs = buttonConfigs || localButtonConfigs;

  // Initialize default configurations when device status changes (only if no configs provided)
  useEffect(() => {
    if (buttonConfigs) return; // Use provided configs
    
    if (!deviceStatus || deviceStatus.buttons_count === 0 || isConnected === false) {
      setLocalButtonConfigs([]);
      return;
    }
    
    // Create default configurations without loading from device
    const defaultConfigs: ButtonConfig[] = [];
    for (let i = 0; i < deviceStatus.buttons_count; i++) {
      defaultConfigs.push({
        id: i,
        name: `Button ${i + 1}`,
        function: 'normal',
        enabled: true,
      });
    }
    setLocalButtonConfigs(defaultConfigs);
  }, [deviceStatus, isConnected, buttonConfigs]);

  // Clear configurations when disconnected
  useEffect(() => {
    if (isConnected === false) {
      setLocalButtonConfigs([]);
      setIsLoading(false);
    }
  }, [isConnected]);

  const updateButtonConfig = async (buttonId: number, updates: Partial<ButtonConfig>) => {
    if (isConnected === false) return;
    
    const currentConfig = configs.find(c => c.id === buttonId);
    if (!currentConfig) return;

    const updatedConfig = { ...currentConfig, ...updates };
    
    try {
      await invoke('write_button_config', { config: updatedConfig });
      
      if (buttonConfigs && onConfigUpdate) {
        // Using provided configs - notify parent
        const updatedConfigs = configs.map(c => c.id === buttonId ? updatedConfig : c);
        onConfigUpdate(updatedConfigs);
      } else {
        // Using local state
        setLocalButtonConfigs(prev => prev.map(c => c.id === buttonId ? updatedConfig : c));
      }
    } catch (err) {
      console.error('Failed to update button config:', err);
    }
  };

  const getFunctionBadgeVariant = (func: string) => {
    switch (func) {
      case 'normal':
        return 'default';
      case 'toggle':
        return 'secondary';
      case 'macro':
        return 'outline';
      default:
        return 'outline';
    }
  };

  const getFunctionDescription = (func: string) => {
    switch (func) {
      case 'normal':
        return 'Standard momentary button press';
      case 'toggle':
        return 'Toggle on/off with each press';
      case 'macro':
        return 'Execute custom macro sequence';
      default:
        return 'Unknown function';
    }
  };

  if (!deviceStatus) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">No device connected</p>
        </CardContent>
      </Card>
    );
  }

  if (deviceStatus.buttons_count === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <MousePointer className="w-5 h-5 mr-2" />
            Button Configuration
          </CardTitle>
          <CardDescription>Configure button functions and behavior</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">This device has no configurable buttons</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <MousePointer className="w-5 h-5 mr-2" />
          Button Configuration
        </CardTitle>
        <CardDescription>
          Configure behavior for {deviceStatus.buttons_count} buttons
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configs.map((button) => (
            <Card key={button.id} className="p-4">
              <div className="space-y-4">
                {/* Button Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MousePointer className="w-4 h-4" />
                    <span className="font-medium">Button {button.id + 1}</span>
                  </div>
                  <Badge variant={getFunctionBadgeVariant(button.function)}>
                    {button.function}
                  </Badge>
                </div>

                {/* Button Name */}
                <div className="space-y-2">
                  <Label htmlFor={`button-name-${button.id}`}>Button Name</Label>
                  <Input
                    id={`button-name-${button.id}`}
                    value={button.name}
                    onChange={(e) => updateButtonConfig(button.id, { name: e.target.value })}
                    placeholder={`Button ${button.id + 1}`}
                  />
                </div>

                {/* Button Function */}
                <div className="space-y-2">
                  <Label>Function</Label>
                  <Select 
                    value={button.function} 
                    onValueChange={(value) => updateButtonConfig(button.id, { function: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="toggle">Toggle</SelectItem>
                      <SelectItem value="macro">Macro</SelectItem>
                      <SelectItem value="shift">Shift/Modifier</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {getFunctionDescription(button.function)}
                  </p>
                </div>

                {/* Macro Configuration (placeholder) */}
                {button.function === 'macro' && (
                  <div className="space-y-2">
                    <Label>Macro Sequence</Label>
                    <div className="p-3 border rounded-md bg-muted/30">
                      <p className="text-sm text-muted-foreground">
                        Macro configuration coming soon...
                      </p>
                    </div>
                  </div>
                )}

                {/* Enable/Disable */}
                <div className="flex items-center space-x-2">
                  <Switch
                    id={`button-enabled-${button.id}`}
                    checked={button.enabled}
                    onCheckedChange={(checked) => updateButtonConfig(button.id, { enabled: checked })}
                  />
                  <Label htmlFor={`button-enabled-${button.id}`}>
                    {button.enabled ? 'Enabled' : 'Disabled'}
                  </Label>
                </div>

                {/* Button Status Indicator */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm text-muted-foreground">
                    Button ID: {button.id}
                  </span>
                  <div className="flex items-center space-x-1">
                    <div 
                      className={`w-2 h-2 rounded-full ${
                        button.enabled ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                    <span className="text-xs text-muted-foreground">
                      {button.enabled ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Bulk Actions */}
        <div className="mt-6 pt-4 border-t">
          <div className="flex items-center space-x-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                configs.forEach(button => {
                  updateButtonConfig(button.id, { enabled: true });
                });
              }}
            >
              Enable All
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                configs.forEach(button => {
                  updateButtonConfig(button.id, { enabled: false });
                });
              }}
            >
              Disable All
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                configs.forEach(button => {
                  updateButtonConfig(button.id, { 
                    function: 'normal',
                    enabled: true,
                    name: `Button ${button.id + 1}`
                  });
                });
              }}
            >
              <ToggleLeft className="w-4 h-4 mr-2" />
              Reset All
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}