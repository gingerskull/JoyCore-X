import React, { useContext, useMemo } from 'react';
import { useFirmwareUpdates } from '@/hooks/useFirmwareUpdates';
import { useDeviceContext } from '@/contexts/DeviceContext';
import type { FirmwareUpdatesContextValue } from './firmwareUpdatesTypes';
import { FirmwareUpdatesContext } from './FirmwareUpdatesContext';


export const FirmwareUpdatesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { connectedDevice } = useDeviceContext();
  const currentFirmwareVersion = connectedDevice?.device_status?.firmware_version;

  const hook = useFirmwareUpdates({ currentVersion: currentFirmwareVersion, autoCheck: true });

  const value: FirmwareUpdatesContextValue = useMemo(() => ({
    isChecking: hook.isChecking,
    hasUpdateAvailable: hook.hasUpdateAvailable,
    latestVersion: hook.latestVersion,
    error: hook.error,
    checkForUpdates: hook.checkForUpdates,
    resetUpdateState: hook.resetUpdateState,
    currentVersion: currentFirmwareVersion,
  }), [hook.isChecking, hook.hasUpdateAvailable, hook.latestVersion, hook.error, hook.checkForUpdates, hook.resetUpdateState, currentFirmwareVersion]);

  return (
    <FirmwareUpdatesContext.Provider value={value}>
      {children}
    </FirmwareUpdatesContext.Provider>
  );
};

export function useFirmwareUpdatesContext(): FirmwareUpdatesContextValue {
  const ctx = useContext(FirmwareUpdatesContext);
  if (!ctx) {
    throw new Error('useFirmwareUpdatesContext must be used within a FirmwareUpdatesProvider');
  }
  return ctx;
}
