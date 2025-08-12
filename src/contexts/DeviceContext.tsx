import { createContext, useContext, type ReactNode } from 'react';
import { useDevice } from '@/hooks/useDevice';
import type { Device, DeviceStatus, ConnectionInfo } from '@/lib/types';

interface DeviceContextType {
  // State
  devices: Device[];
  connectedDevice: Device | null;
  connectionInfo: ConnectionInfo;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  discoverDevices: () => Promise<Device[]>;
  refreshDevices: (withCleanup?: boolean) => Promise<Device[]>;
  refreshDevicesSilently: (withCleanup?: boolean) => Promise<Device[]>;
  connectDevice: (deviceId: string) => Promise<boolean>;
  disconnectDevice: () => Promise<boolean>;
  getDeviceStatus: () => Promise<DeviceStatus | null>;
  
  // Computed
  isConnected: boolean;
  isConnecting: boolean;
  hasError: boolean;
  
  // Utils
  clearError: () => void;
}

const DeviceContext = createContext<DeviceContextType | null>(null);

interface DeviceProviderProps {
  children: ReactNode;
}

export function DeviceProvider({ children }: DeviceProviderProps) {
  const deviceState = useDevice();
  
  return (
    <DeviceContext.Provider value={deviceState}>
      {children}
    </DeviceContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useDeviceContext(): DeviceContextType {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error('useDeviceContext must be used within a DeviceProvider');
  }
  return context;
}