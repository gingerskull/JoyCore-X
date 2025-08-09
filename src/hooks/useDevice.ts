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

  // Helper to deep compare device arrays
  const devicesEqual = (a: Device[], b: Device[]): boolean => {
    if (a.length !== b.length) return false;
    
    // Sort both arrays by ID to ensure consistent comparison
    const sortedA = [...a].sort((x, y) => x.id.localeCompare(y.id));
    const sortedB = [...b].sort((x, y) => x.id.localeCompare(y.id));
    
    return sortedA.every((deviceA, index) => {
      const deviceB = sortedB[index];
      return (
        deviceA.id === deviceB.id &&
        deviceA.port_name === deviceB.port_name &&
        deviceA.connection_state === deviceB.connection_state &&
        JSON.stringify(deviceA.device_status) === JSON.stringify(deviceB.device_status)
      );
    });
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

  // Get all known devices with optional cleanup
  const refreshDevices = useCallback(async (withCleanup = false) => {
    setIsLoading(true);
    try {
      if (withCleanup) {
        // Run cleanup to remove physically disconnected devices
        await invoke('cleanup_disconnected_devices');
        // Then discover to add any new devices
        await invoke('discover_devices');
      } else {
        // Just refresh discovery without aggressive cleanup
        await invoke('discover_devices');
      }
      
      // Get the updated device list
      const allDevices: Device[] = await invoke('get_devices');
      setDevices(allDevices);
      
      // Check if connected device is still actually connected
      if (connectedDevice) {
        const stillConnected = allDevices.find(d => 
          d.id === connectedDevice.id && d.connection_state === 'Connected'
        );
        if (!stillConnected) {
          // Device was physically disconnected
          console.log('Connected device was physically disconnected, updating state');
          setConnectedDevice(null);
          setConnectionInfo({ status: 'disconnected' });
        }
      }
      
      return allDevices;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to refresh devices';
      setError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [connectedDevice]);

  // Silent refresh for background polling (no loading UI changes)
  const refreshDevicesSilently = useCallback(async (withCleanup = false) => {
    try {
      if (withCleanup) {
        // Run cleanup to remove physically disconnected devices
        await invoke('cleanup_disconnected_devices');
        // Then discover to add any new devices
        await invoke('discover_devices');
      } else {
        // Just refresh discovery without aggressive cleanup
        await invoke('discover_devices');
      }
      
      // Get the updated device list
      const allDevices: Device[] = await invoke('get_devices');
      
      // Only update state if devices actually changed
      if (!devicesEqual(devices, allDevices)) {
        setDevices(allDevices);
      }
      
      // Check if connected device is still actually connected
      if (connectedDevice) {
        const stillConnected = allDevices.find(d => 
          d.id === connectedDevice.id && d.connection_state === 'Connected'
        );
        if (!stillConnected) {
          // Device was physically disconnected
          console.log('Connected device was physically disconnected, updating state');
          setConnectedDevice(null);
          setConnectionInfo({ status: 'disconnected' });
        }
      }
      
      return allDevices;
    } catch (err) {
      // Silent errors - log but don't show in UI
      console.error('Silent device refresh failed:', err);
      return devices; // Return current devices on error
    }
  }, [connectedDevice, devices, devicesEqual]);

  // Connect to a device
  const connectDevice = useCallback(async (deviceId: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      console.log('Attempting to connect to device:', deviceId);
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
        const connectionState = parseConnectionState(connected);
        setConnectionInfo(connectionState);
      }
      
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to connect to device';
      console.error('Connection error:', err);
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

  // Initialize - check for connected device and get devices (run only once on mount)
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
        const allDevices: Device[] = await invoke('get_devices');
        setDevices(allDevices);
      } catch (err) {
        console.error('Failed to initialize device hook:', err);
        setError('Failed to initialize device connection');
      } finally {
        setIsLoading(false);
      }
    };

    initialize();
  }, []); // Empty dependency array - only run once on mount

  const isConnected = connectionInfo.status === 'connected';

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
    refreshDevicesSilently,
    connectDevice,
    disconnectDevice,
    getDeviceStatus,
    
    // Computed
    isConnected,
    isConnecting: connectionInfo.status === 'connecting',
    hasError: connectionInfo.status === 'error' || error !== null,
    
    // Utils
    clearError: () => setError(null),
  };
}