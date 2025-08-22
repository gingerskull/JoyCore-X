import { createContext } from 'react';
import type { FirmwareUpdatesContextValue } from './firmwareUpdatesTypes';

export const FirmwareUpdatesContext = createContext<FirmwareUpdatesContextValue | undefined>(undefined);
