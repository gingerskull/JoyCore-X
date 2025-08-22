import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Device, DeviceStatus, ConnectionInfo } from '@/lib/types';

export function useDevice() {
  const [devices, setDevices] = useState<Device[]>([]);
  const devicesRef = useRef<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const connectedRef = useRef<Device | null>(null);
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
  const devicesEqual = useCallback((a: Device[], b: Device[]): boolean => {
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
  }, []);

  // Explicit discover action (force backend discovery); normally events keep us updated
  const discoverDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      const discovered: Device[] = await invoke('force_discover_devices');
      // Response already emitted events; still update local immediately
  devicesRef.current = discovered;
  setDevices(discovered);
      return discovered;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to discover devices';
      setError(msg);
      return [];
    } finally { setIsLoading(false); }
  }, []);

  // Deprecated legacy refresh API removed; provide no-op placeholders for compatibility until components updated
  const refreshDevices = useCallback(async () => devices, [devices]);
  const refreshDevicesSilently = useCallback(async () => devices, [devices]);

  // Connect to a device
  const connectDevice = useCallback(async (deviceId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      await invoke('connect_device', { deviceId });
      // Immediate optimistic state
      const device = devicesRef.current.find(d => d.id === deviceId);
      if (device) {
        setConnectionInfo({ status: 'connecting', device });
      }
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect to device';
      setError(msg);
      setConnectionInfo({ status: 'error', error: msg });
      return false;
    } finally { setIsLoading(false); }
  }, []);

  // Disconnect from current device
  const disconnectDevice = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      await invoke('disconnect_device');
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to disconnect device';
      setError(msg);
      return false;
    } finally { setIsLoading(false); }
  }, []);

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

  // Initialize & subscribe to backend events
  useEffect(() => {
  const unlistenList: Array<() => void> = [];
    const setup = async () => {
      try {
        setIsLoading(true);
        // Initial snapshot
        const [connected, list] = await Promise.all([
          invoke<Device | null>('get_connected_device'),
          invoke<Device[]>('get_devices')
        ]);
        if (connected) {
          connectedRef.current = connected;
          setConnectedDevice(connected);
          setConnectionInfo(parseConnectionState(connected));
        }
        devicesRef.current = list;
        setDevices(list);
        // Event: device list updates
        const un1 = await listen<Device[]>('device_list_updated', (e) => {
          const updated = e.payload || [];
          setDevices(prev => {
            // Always compare with previous snapshot to avoid stale outer closure
            if (devicesEqual(prev, updated)) return prev;
            devicesRef.current = updated;
            // Sync connected device reference if present
            if (connectedRef.current) {
              const match = updated.find(d => d.id === connectedRef.current!.id);
              if (match) {
                connectedRef.current = match;
                setConnectedDevice(match);
              } else {
                connectedRef.current = null;
                setConnectedDevice(null);
                setConnectionInfo(ci => ci.status === 'connected' ? { status: 'disconnected' } : ci);
              }
            }
            // Fallback adoption
            if (!connectedRef.current) {
              const firstConnected = updated.find(d => d.connection_state === 'Connected');
              if (firstConnected) {
                connectedRef.current = firstConnected;
                setConnectedDevice(firstConnected);
                setConnectionInfo({ status: 'connected', device: firstConnected });
              }
            }
            return updated;
          });
        });
        unlistenList.push(un1);
        // Event: connection state changes
        interface ConnEvt { id: string; state: string; error?: string }
  const un2 = await listen<ConnEvt>('device_connection_changed', (e) => {
          const payload = e.payload as ConnEvt | undefined;
          const id = payload?.id ?? '';
          const state = payload?.state ?? '';
          if (!id) return;
          setDevices(prev => {
            const updated = prev.map(d => d.id === id ? { ...d, connection_state: state as Device['connection_state'] } : d);
            devicesRef.current = updated;
            return updated;
          });
          const dev = devicesRef.current.find(d => d.id === id);
          if (state === 'Connected' && dev) {
            connectedRef.current = { ...dev, connection_state: 'Connected' as const };
            setConnectedDevice(connectedRef.current);
            setConnectionInfo({ status: 'connected', device: connectedRef.current });
            // Kick off immediate status fetch to populate device_status for UI gating
            (async () => {
              try {
                const status = await invoke<DeviceStatus | null>('get_device_status');
                if (status) {
                  setDevices(prev => {
                    const upd = prev.map(d => d.id === id ? { ...d, device_status: status } : d);
                    devicesRef.current = upd;
                    // Update connectedRef snapshot as well
                    if (connectedRef.current && connectedRef.current.id === id) {
                      connectedRef.current = { ...connectedRef.current, device_status: status } as Device;
                      setConnectedDevice(connectedRef.current);
                    }
                    return upd;
                  });
                }
              } catch (err) {
                console.warn('Immediate status fetch failed:', err);
              }
            })();
          } else if (state === 'Disconnected') {
            if (connectedRef.current && connectedRef.current.id === id) {
              connectedRef.current = null;
              setConnectedDevice(null);
              setConnectionInfo({ status: 'disconnected' });
            }
          } else if (state === 'Connecting' && dev) {
            connectedRef.current = dev;
            setConnectedDevice(dev);
            setConnectionInfo({ status: 'connecting', device: dev });
          } else if (state === 'Error') {
            if (connectedRef.current && connectedRef.current.id === id) {
              setConnectionInfo({ status: 'error', device: connectedRef.current, error: payload?.error });
            } else if (dev) {
              setConnectionInfo({ status: 'error', device: dev, error: payload?.error });
            } else {
              setConnectionInfo({ status: 'error', error: payload?.error });
            }
          }
        });
        unlistenList.push(un2);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Initialization failed';
        setError(msg);
      } finally { setIsLoading(false); }
    };
    setup();
    return () => { unlistenList.forEach(u => { try { u(); } catch { /* ignore */ } }); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derive connectivity primarily from connectedDevice's connection_state (more authoritative than transient connectionInfo)
  const isConnected = connectedDevice?.connection_state === 'Connected' || connectionInfo.status === 'connected';

  // (Diagnostics removed) 

  return {
    // State
    devices,
    connectedDevice,
    connectionInfo,
    isLoading,
    error,
    
    // Actions
  discoverDevices,
  refreshDevices, // deprecated no-op
  refreshDevicesSilently, // deprecated no-op
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