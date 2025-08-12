import { MousePointer } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import type { DeviceStatus, ParsedButtonConfig } from '@/lib/types';

interface ButtonConfigurationProps {
  deviceStatus: DeviceStatus | null;
  isConnected?: boolean;
  parsedButtons?: ParsedButtonConfig[];
  isLoading?: boolean;
}

export function ButtonConfiguration({ deviceStatus, isConnected = false, parsedButtons = [], isLoading = false }: ButtonConfigurationProps) {

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

  if (!deviceStatus || !isConnected) {
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
          <p className="text-muted-foreground">No device connected</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
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
          <p className="text-muted-foreground">Reading configuration from device...</p>
        </CardContent>
      </Card>
    );
  }

  if (parsedButtons.length === 0) {
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
          <p className="text-muted-foreground">No buttons configured on device</p>
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
          Showing {parsedButtons.length} buttons from device configuration
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {parsedButtons.map((button) => (
            <Card key={button.id} className="p-4">
              <div className="space-y-4">
                {/* Button Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <MousePointer className="w-4 h-4" />
                    <span className="font-medium">{button.name}</span>
                  </div>
                  <Badge variant={getFunctionBadgeVariant(button.function)}>
                    {button.function}
                  </Badge>
                </div>

                {/* Button Configuration Display (Read-only) */}
                <div className="bg-muted/50 p-3 rounded-lg space-y-2">
                  <h4 className="font-medium text-sm">Configuration from Device</h4>
                  
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-xs text-muted-foreground">ID</Label>
                      <p className="font-mono">{button.id}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Enabled</Label>
                      <p className="font-mono">{button.enabled ? 'Yes' : 'No'}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">Function</Label>
                      <p className="text-sm">{getFunctionDescription(button.function)}</p>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}