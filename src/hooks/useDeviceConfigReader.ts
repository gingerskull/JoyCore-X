import { useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { ParsedAxisConfig, ParsedButtonConfig } from '@/lib/types';

interface ParsedConfiguration {
  axes: ParsedAxisConfig[];
  buttons: ParsedButtonConfig[];
}

export function useDeviceConfigReader() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoaded, setLastLoaded] = useState<Date | null>(null);

  // Read and parse the real device configuration
  const readConfiguration = useCallback(async (): Promise<ParsedConfiguration | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      // Call the new parsed config command
      const result: [ParsedAxisConfig[], ParsedButtonConfig[]] = await invoke('read_parsed_device_config');
      const [axes, buttons] = result;
      
      setLastLoaded(new Date());
      
      return {
        axes,
        buttons,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to read device configuration';
      setError(errorMessage);
      console.error('Failed to read parsed device config:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Check if configuration is available (try a quick read)
  const checkConfiguration = useCallback(async (): Promise<boolean> => {
    try {
      await invoke('read_parsed_device_config');
      return true;
    } catch (err) {
      console.warn('Configuration not available:', err);
      return false;
    }
  }, []);

  return {
    // State
    isLoading,
    error,
    lastLoaded,
    
    // Actions
    readConfiguration,
    checkConfiguration,
    
    // Utils
    clearError: () => setError(null),
  };
}