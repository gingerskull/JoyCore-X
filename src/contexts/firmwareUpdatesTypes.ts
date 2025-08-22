export interface VersionCheckResult {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  release_info?: unknown;
}

export interface FirmwareUpdatesContextValue {
  isChecking: boolean;
  hasUpdateAvailable: boolean;
  latestVersion?: string;
  error: string | null;
  checkForUpdates: (version?: string) => Promise<VersionCheckResult | null>;
  resetUpdateState: () => void;
  currentVersion?: string;
}
