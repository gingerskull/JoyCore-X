import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type PullMode = 'pull-up' | 'pull-down';

interface RawStateConfigContextValue {
  gpioPullMode: PullMode;
  shiftRegPullMode: PullMode;
  setGpioPullMode: (mode: PullMode) => void;
  setShiftRegPullMode: (mode: PullMode) => void;
  toggleGpioPullMode: () => void;
  toggleShiftRegPullMode: () => void;
}

const RawStateConfigContext = createContext<RawStateConfigContextValue | undefined>(undefined);

const LS_KEY = 'joycore.rawStateConfig.v1';

interface PersistedState {
  gpioPullMode: PullMode;
  shiftRegPullMode: PullMode;
}

const defaultState: PersistedState = {
  gpioPullMode: 'pull-down', // default typical for input with external pull-down
  shiftRegPullMode: 'pull-down',
};

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    return {
      gpioPullMode: parsed.gpioPullMode === 'pull-up' ? 'pull-up' : 'pull-down',
      shiftRegPullMode: parsed.shiftRegPullMode === 'pull-up' ? 'pull-up' : 'pull-down',
    };
  } catch {
    return defaultState;
  }
}

function saveState(state: PersistedState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export const RawStateConfigProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [gpioPullMode, setGpioPullModeState] = useState<PullMode>(defaultState.gpioPullMode);
  const [shiftRegPullMode, setShiftRegPullModeState] = useState<PullMode>(defaultState.shiftRegPullMode);

  // Load on mount
  useEffect(() => {
    const s = loadState();
    setGpioPullModeState(s.gpioPullMode);
    setShiftRegPullModeState(s.shiftRegPullMode);
  }, []);

  // Persist whenever changes
  useEffect(() => {
    saveState({ gpioPullMode, shiftRegPullMode });
  }, [gpioPullMode, shiftRegPullMode]);

  const setGpioPullMode = useCallback((mode: PullMode) => setGpioPullModeState(mode), []);
  const setShiftRegPullMode = useCallback((mode: PullMode) => setShiftRegPullModeState(mode), []);
  const toggleGpioPullMode = useCallback(() => setGpioPullModeState(m => (m === 'pull-up' ? 'pull-down' : 'pull-up')), []);
  const toggleShiftRegPullMode = useCallback(() => setShiftRegPullModeState(m => (m === 'pull-up' ? 'pull-down' : 'pull-up')), []);

  return (
    <RawStateConfigContext.Provider value={{
      gpioPullMode,
      shiftRegPullMode,
      setGpioPullMode,
      setShiftRegPullMode,
      toggleGpioPullMode,
      toggleShiftRegPullMode,
    }}>
      {children}
    </RawStateConfigContext.Provider>
  );
};

export function useRawStateConfig() {
  const ctx = useContext(RawStateConfigContext);
  if (!ctx) throw new Error('useRawStateConfig must be used within RawStateConfigProvider');
  return ctx;
}
