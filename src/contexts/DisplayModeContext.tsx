import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RAW_STATE_CONFIG } from '@/lib/dev-config';

export type DisplayMode = 'hid' | 'raw' | 'both';

interface DisplayModeContextValue {
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  toggleDisplayMode: () => void;
}

const DisplayModeContext = createContext<DisplayModeContextValue | undefined>(undefined);

const LS_KEY = 'joycore.displayMode.v1';

function loadDisplayMode(): DisplayMode {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved && ['hid', 'raw', 'both'].includes(saved)) {
      return saved as DisplayMode;
    }
  } catch {
    // Ignore localStorage errors
  }
  // Default from config or 'hid' if not set
  return RAW_STATE_CONFIG.displayMode || 'hid';
}

function saveDisplayMode(mode: DisplayMode) {
  try {
    localStorage.setItem(LS_KEY, mode);
  } catch {
    // Ignore localStorage errors
  }
}

export const DisplayModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [displayMode, setDisplayModeState] = useState<DisplayMode>(loadDisplayMode);

  // Persist + sync to backend whenever it changes
  useEffect(() => {
    saveDisplayMode(displayMode);
    // Fire and forget backend sync
    invoke('set_raw_state_display_mode', { mode: displayMode }).catch(err => {
      // Non-fatal; log to console for debugging
      console.warn('Failed to set backend display mode', err);
    });
  }, [displayMode]);

  const setDisplayMode = useCallback((mode: DisplayMode) => {
    setDisplayModeState(mode);
  }, []);

  const toggleDisplayMode = useCallback(() => {
    setDisplayModeState(current => {
      // Cycle through modes: hid -> raw -> both -> hid
      if (current === 'hid') return 'raw';
      if (current === 'raw') return 'both';
      return 'hid';
    });
  }, []);

  return (
    <DisplayModeContext.Provider value={{
      displayMode,
      setDisplayMode,
      toggleDisplayMode,
    }}>
      {children}
    </DisplayModeContext.Provider>
  );
};

export function useDisplayMode() {
  const ctx = useContext(DisplayModeContext);
  if (!ctx) throw new Error('useDisplayMode must be used within DisplayModeProvider');
  return ctx;
}