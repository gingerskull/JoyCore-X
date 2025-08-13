import { Joystick, MousePointer, User, Cpu } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useDeviceContext } from '@/contexts/DeviceContext';
import { AxisConfiguration } from './AxisConfiguration';
import { ButtonConfiguration } from './ButtonConfiguration';
import { ProfileManagement } from './ProfileManagement';
import { DeviceConfigManagement } from './DeviceConfigManagement';
import { PinoutConfiguration } from './PinoutConfiguration';
import type { DeviceStatus, ParsedAxisConfig, ParsedButtonConfig } from '@/lib/types';

interface ConfigurationTabsProps {
  deviceStatus: DeviceStatus | null;
  parsedAxes: ParsedAxisConfig[];
  parsedButtons: ParsedButtonConfig[];
  isConfigLoading: boolean;
}

export function ConfigurationTabs({ deviceStatus, parsedAxes, parsedButtons, isConfigLoading }: ConfigurationTabsProps) {
  const { connectedDevice, isConnected } = useDeviceContext();


  if (!connectedDevice) {
    return null;
  }

  return (
    <Tabs defaultValue="axes" className="space-y-4">
      <TabsList className="grid w-full grid-cols-5">
        <TabsTrigger value="axes" className="flex items-center">
          <Joystick className="w-4 h-4 mr-2" />
          Axes
        </TabsTrigger>
        <TabsTrigger value="buttons" className="flex items-center">
          <MousePointer className="w-4 h-4 mr-2" />
          Buttons
        </TabsTrigger>
        <TabsTrigger value="pinout" className="flex items-center">
          <Cpu className="w-4 h-4 mr-2" />
          Pinout
        </TabsTrigger>
        <TabsTrigger value="profiles" className="flex items-center">
          <User className="w-4 h-4 mr-2" />
          Profiles
        </TabsTrigger>
        <TabsTrigger value="advanced" className="flex items-center">
          <Cpu className="w-4 h-4 mr-2" />
          Advanced
        </TabsTrigger>
      </TabsList>

      <TabsContent value="axes" className="space-y-4">
        <AxisConfiguration 
          deviceStatus={deviceStatus} 
          isConnected={isConnected} 
          parsedAxes={parsedAxes}
          isLoading={isConfigLoading}
        />
      </TabsContent>

      <TabsContent value="buttons" className="space-y-4">
        <ButtonConfiguration 
          deviceStatus={deviceStatus} 
          isConnected={isConnected} 
          parsedButtons={parsedButtons}
          isLoading={isConfigLoading}
        />
      </TabsContent>

      <TabsContent value="pinout" className="space-y-4">
        <PinoutConfiguration />
      </TabsContent>

      <TabsContent value="profiles" className="space-y-4">
        <ProfileManagement deviceStatus={deviceStatus} />
      </TabsContent>

      <TabsContent value="advanced" className="space-y-4">
        <DeviceConfigManagement />
      </TabsContent>
    </Tabs>
  );
}