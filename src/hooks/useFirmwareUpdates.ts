import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

interface FirmwareRelease {
  version: string;
  download_url: string;
  changelog: string;
  published_at: string;
  size_bytes: number;
  sha256_hash?: string;
}

interface VersionCheckResult {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_info?: FirmwareRelease;
}

interface UseFirmwareUpdatesOptions {
  currentVersion?: string;
  repoOwner?: string;
  repoName?: string;
  autoCheck?: boolean;
  checkInterval?: number; // in milliseconds
}

export const useFirmwareUpdates = ({
  currentVersion,
  repoOwner = 'gingerskull',
  repoName = 'JoyCore-Firmware',
  autoCheck = true,
  checkInterval = 24 * 60 * 60 * 1000, // 24 hours
}: UseFirmwareUpdatesOptions = {}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<VersionCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckTime, setLastCheckTime] = useState<Date | null>(null);

  const checkForUpdates = useCallback(async (version?: string) => {
    if (!version && !currentVersion) {
      setError('No current version provided');
      return null;
    }

    const versionToCheck = version || currentVersion!;
    setIsChecking(true);
    setError(null);

    try {
      const result = await invoke<VersionCheckResult>('check_firmware_updates', {
        currentVersion: versionToCheck,
        repoOwner,
        repoName,
      });

      setCheckResult(result);
      setLastCheckTime(new Date());
      return result;
    } catch (err) {
      const errorMsg = `Failed to check for updates: ${err}`;
      setError(errorMsg);
      console.error('Firmware update check failed:', err);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, [currentVersion, repoOwner, repoName]);

  const checkIfUpdateNeeded = useCallback(() => {
    if (!autoCheck || !currentVersion) return false;
    
    if (!lastCheckTime) return true;
    
    const timeSinceLastCheck = Date.now() - lastCheckTime.getTime();
    return timeSinceLastCheck > checkInterval;
  }, [autoCheck, currentVersion, lastCheckTime, checkInterval]);

  // Automatic update checking
  useEffect(() => {
    if (autoCheck && currentVersion && checkIfUpdateNeeded()) {
      const timeoutId = setTimeout(() => {
        checkForUpdates();
      }, 1000); // Delay initial check by 1 second

      return () => clearTimeout(timeoutId);
    }
  }, [autoCheck, currentVersion, checkForUpdates, checkIfUpdateNeeded]);

  // Periodic update checking
  useEffect(() => {
    if (!autoCheck || !currentVersion) return;

    const intervalId = setInterval(() => {
      if (checkIfUpdateNeeded()) {
        checkForUpdates();
      }
    }, checkInterval);

    return () => clearInterval(intervalId);
  }, [autoCheck, currentVersion, checkForUpdates, checkInterval, checkIfUpdateNeeded]);

  const resetUpdateState = useCallback(() => {
    setCheckResult(null);
    setError(null);
  }, []);

  return {
    isChecking,
    checkResult,
    error,
    lastCheckTime,
    checkForUpdates,
    resetUpdateState,
    hasUpdateAvailable: checkResult?.update_available ?? false,
    latestVersion: checkResult?.latest_version,
  };
};