import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Device, DeviceStatus, ConnectionInfo } from '@/lib/types';

export function useDevice() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [connectionInfo, setConnectionInfo] = useState<ConnectionInfo>({
    status: 'disconnected'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to parse connection state
  const parseConnectionState = (device: Device): ConnectionInfo => {
    const state = device.connection_state;
    
    if (state === 'Connected') {
      return { status: 'connected', device };
    } else if (state === 'Connecting') {
      return { status: 'connecting', device };
    } else if (state === 'Disconnected') {
      return { status: 'disconnected', device };
    } else if (typeof state === 'object' && 'Error' in state) {
      return { status: 'error', device, error: state.Error };
    }
    
    return { status: 'disconnected', device };
  };

  // Discover available devices
  const discoverDevices = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const discoveredDevices: Device[] = await invoke('discover_devices');
      setDevices(discoveredDevices);
      return discoveredDevices;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to discover devices';
      setError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get all known devices
  const refreshDevices = useCallback(async () => {
    try {
      const allDevices: Device[] = await invoke('get_devices');
      setDevices(allDevices);
      return allDevices;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get devices';
      setError(errorMessage);
      return [];
    }
  }, []);

  // Connect to a device
  const connectDevice = useCallback(async (deviceId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      await invoke('connect_device', { deviceId });
      
      // Update connection info
      const device = devices.find(d => d.id === deviceId);
      if (device) {
        const updatedDevice = { ...device, connection_state: 'Connecting' as const };
        setConnectionInfo(parseConnectionState(updatedDevice));
      }
      
      // Refresh devices to get updated connection state
      await refreshDevices();
      
      // Get connected device info
      const connected: Device | null = await invoke('get_connected_device');
      if (connected) {
        setConnectedDevice(connected);
        setConnectionInfo(parseConnectionState(connected));
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to device';
      setError(errorMessage);
      setConnectionInfo({ status: 'error', error: errorMessage });
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [devices, refreshDevices]);

  // Disconnect from current device
  const disconnectDevice = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      await invoke('disconnect_device');
      setConnectedDevice(null);
      setConnectionInfo({ status: 'disconnected' });
      
      // Refresh devices to get updated connection state
      await refreshDevices();
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to disconnect device';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refreshDevices]);

  // Get device status
  const getDeviceStatus = useCallback(async (): Promise<DeviceStatus | null> => {
    try {
      const status: DeviceStatus | null = await invoke('get_device_status');
      return status;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get device status';
      setError(errorMessage);
      return null;
    }
  }, []);

  // Initialize - check for connected device and refresh devices
  useEffect(() => {
    const initialize = async () => {
      setIsLoading(true);
      
      try {
        // Check if there's already a connected device
        const connected: Device | null = await invoke('get_connected_device');
        if (connected) {
          setConnectedDevice(connected);
          setConnectionInfo(parseConnectionState(connected));
        }
        
        // Get all devices
        await refreshDevices();
      } catch (err) {
        console.error('Failed to initialize device hook:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, [refreshDevices]);

  return {
    // State
    devices,
    connectedDevice,
    connectionInfo,
    isLoading,
    error,
    
    // Actions
    discoverDevices,
    refreshDevices,
    connectDevice,
    disconnectDevice,
    getDeviceStatus,
    
    // Computed
    isConnected: connectionInfo.status === 'connected',
    isConnecting: connectionInfo.status === 'connecting',
    hasError: connectionInfo.status === 'error' || error !== null,
    
    // Utils
    clearError: () => setError(null),
  };
}