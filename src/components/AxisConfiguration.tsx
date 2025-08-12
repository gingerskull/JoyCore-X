import { useState, useEffect } from 'react';
import { Sliders } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
// import { Progress } from '@/components/ui/progress';

import type { DeviceStatus, ParsedAxisConfig } from '@/lib/types';

interface AxisConfigurationProps {
  deviceStatus: DeviceStatus | null;
  isConnected?: boolean;
  parsedAxes?: ParsedAxisConfig[];
  isLoading?: boolean;
}

export function AxisConfiguration({ deviceStatus, isConnected = false, parsedAxes = [], isLoading = false }: AxisConfigurationProps) {
  const [selectedAxis, setSelectedAxis] = useState<number>(0);

  // Reset selected axis if it's out of range
  useEffect(() => {
    if (parsedAxes.length > 0 && selectedAxis >= parsedAxes.length) {
      setSelectedAxis(0);
    }
  }, [parsedAxes, selectedAxis]);

  const currentAxis = parsedAxes[selectedAxis];

  if (!deviceStatus || !isConnected) {
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
            <Sliders className="w-5 h-5 mr-2" />
            Axis Configuration
          </CardTitle>
          <CardDescription>Configure analog input axes</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-8">
          <p className="text-muted-foreground">Reading configuration from device...</p>
        </CardContent>
      </Card>
    );
  }

  if (parsedAxes.length === 0) {
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
          <p className="text-muted-foreground">No axes configured on device</p>
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
          {parsedAxes.map((axis, index) => (
            <Button
              key={axis.id}
              variant={selectedAxis === index ? "default" : "outline"}
              className="w-full justify-start"
              onClick={() => setSelectedAxis(index)}
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
              {/* Configuration Display (Read-only) */}
              <div className="bg-muted/50 p-4 rounded-lg space-y-4">
                <h4 className="font-medium text-sm">Configuration from Device</h4>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Name</Label>
                    <p className="font-mono">{currentAxis.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Curve</Label>
                    <p className="font-mono">{currentAxis.curve}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Min Value</Label>
                    <p className="font-mono">{currentAxis.min_value}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Max Value</Label>
                    <p className="font-mono">{currentAxis.max_value}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Center</Label>
                    <p className="font-mono">{currentAxis.center_value}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Deadzone</Label>
                    <p className="font-mono">{currentAxis.deadzone}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Inverted</Label>
                    <p className="font-mono">{currentAxis.inverted ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}