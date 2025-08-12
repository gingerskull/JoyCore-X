import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { StorageInfo } from '@/lib/types';

export function useDeviceConfig() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read raw configuration binary
  const readConfigBinary = useCallback(async (): Promise<Uint8Array | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data: number[] = await invoke('read_device_config_raw');
      return new Uint8Array(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to read configuration';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Write raw configuration binary
  const writeConfigBinary = useCallback(async (data: Uint8Array): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await invoke('write_device_config_raw', { data: Array.from(data) });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to write configuration';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete configuration file
  const deleteConfig = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await invoke('delete_device_config');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete configuration';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Reset device to factory defaults
  const resetToDefaults = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await invoke('reset_device_to_defaults');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to reset device';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Format device storage
  const formatStorage = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await invoke('format_device_storage');
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to format storage';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Get storage information
  const getStorageInfo = useCallback(async (): Promise<StorageInfo | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const info: StorageInfo = await invoke('get_device_storage_info');
      return info;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get storage info';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // List device files
  const listFiles = useCallback(async (): Promise<string[]> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const files: string[] = await invoke('list_device_files');
      return files;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to list files';
      setError(errorMessage);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Read any file from device
  const readFile = useCallback(async (filename: string): Promise<Uint8Array | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data: number[] = await invoke('read_device_file', { filename });
      return new Uint8Array(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to read file';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Write any file to device
  const writeFile = useCallback(async (filename: string, data: Uint8Array): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await invoke('write_device_file', { filename, data: Array.from(data) });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to write file';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Delete any file from device
  const deleteFile = useCallback(async (filename: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    
    try {
      await invoke('delete_device_file', { filename });
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete file';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Export configuration to file
  const exportConfig = useCallback(async (): Promise<Blob | null> => {
    const data = await readConfigBinary();
    if (data) {
      return new Blob([data], { type: 'application/octet-stream' });
    }
    return null;
  }, [readConfigBinary]);

  // Import configuration from file
  const importConfig = useCallback(async (file: File): Promise<boolean> => {
    try {
      const buffer = await file.arrayBuffer();
      const data = new Uint8Array(buffer);
      return await writeConfigBinary(data);
    } catch {
      setError('Failed to import configuration file');
      return false;
    }
  }, [writeConfigBinary]);

  return {
    // State
    isLoading,
    error,
    
    // Binary config operations
    readConfigBinary,
    writeConfigBinary,
    deleteConfig,
    resetToDefaults,
    formatStorage,
    
    // Storage operations
    getStorageInfo,
    listFiles,
    
    // File operations
    readFile,
    writeFile,
    deleteFile,
    
    // Import/Export
    exportConfig,
    importConfig,
    
    // Utils
    clearError: () => setError(null),
  };
}