import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button } from './ui/button';

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

interface DownloadProgress {
  downloaded_bytes: number;
  total_bytes: number;
  percentage: number;
  speed_bps: number;
}

interface FirmwareUpdateDialogProps {
  currentVersion: string;
  isOpen: boolean;
  onClose: () => void;
  repoOwner?: string;
  repoName?: string;
}

export const FirmwareUpdateDialog: React.FC<FirmwareUpdateDialogProps> = ({
  currentVersion,
  isOpen,
  onClose,
  repoOwner = 'gingerskull',
  repoName = 'JoyCore-FW',
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<VersionCheckResult | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadedPath, setDownloadedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Reset state when dialog closes
      setCheckResult(null);
      setDownloadProgress(null);
      setError(null);
      setDownloadedPath(null);
    }
  }, [isOpen]);

  useEffect(() => {
    // Listen for download progress events
    const unlisten = listen<DownloadProgress>('download_progress', (event) => {
      setDownloadProgress(event.payload);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const handleCheckForUpdates = async () => {
    setIsChecking(true);
    setError(null);
    
    try {
      const result = await invoke<VersionCheckResult>('check_firmware_updates', {
        currentVersion,
        repoOwner,
        repoName,
      });
      
      setCheckResult(result);
    } catch (err) {
      setError(`Failed to check for updates: ${err}`);
    } finally {
      setIsChecking(false);
    }
  };

  const handleDownloadUpdate = async () => {
    if (!checkResult?.release_info) return;

    setIsDownloading(true);
    setDownloadProgress(null);
    setError(null);

    try {
      const outputDir = await invoke<string>('path_download_dir') || 'downloads';
      
      const downloadedFilePath = await invoke<string>('download_firmware_update', {
        downloadUrl: checkResult.release_info.download_url,
        version: checkResult.release_info.version,
        changelog: checkResult.release_info.changelog,
        publishedAt: checkResult.release_info.published_at,
        sizeBytes: checkResult.release_info.size_bytes,
        outputDir,
      });

      setDownloadedPath(downloadedFilePath);
    } catch (err) {
      setError(`Failed to download firmware: ${err}`);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Firmware Update
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Current Version: <span className="font-mono font-medium">{currentVersion}</span>
              </p>
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 p-3 rounded">
                <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
              </div>
            )}

            {!checkResult && (
              <div className="text-center py-8">
                <Button
                  onClick={handleCheckForUpdates}
                  disabled={isChecking}
                  className="px-6 py-2"
                >
                  {isChecking ? 'Checking...' : 'Check for Updates'}
                </Button>
              </div>
            )}

            {checkResult && !checkResult.update_available && (
              <div className="bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-700 p-4 rounded text-center">
                <p className="text-green-700 dark:text-green-300">
                  ✅ Your firmware is up to date!
                </p>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  Version {checkResult.latest_version}
                </p>
              </div>
            )}

            {checkResult?.update_available && checkResult.release_info && (
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 p-4 rounded">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    Update Available: v{checkResult.release_info.version}
                  </h3>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                    Released: {new Date(checkResult.release_info.published_at).toLocaleDateString()}
                  </p>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Size: {(checkResult.release_info.size_bytes / 1024 / 1024).toFixed(1)} MB
                  </p>
                </div>

                {checkResult.release_info.changelog && (
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                    <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                      Release Notes:
                    </h4>
                    <pre className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                      {checkResult.release_info.changelog}
                    </pre>
                  </div>
                )}

                {!downloadedPath && (
                  <div className="flex gap-3 pt-4">
                    <Button
                      onClick={handleDownloadUpdate}
                      disabled={isDownloading}
                      className="flex-1"
                    >
                      {isDownloading ? 'Downloading...' : 'Download Update'}
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={onClose}
                      disabled={isDownloading}
                    >
                      Later
                    </Button>
                  </div>
                )}

                {downloadProgress && (
                  <div className="bg-gray-50 dark:bg-gray-700 p-3 rounded">
                    <div className="flex justify-between text-sm text-gray-600 dark:text-gray-300 mb-1">
                      <span>Downloading...</span>
                      <span>{downloadProgress.percentage.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${downloadProgress.percentage}%` }}
                      />
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {(downloadProgress.speed_bps / 1024 / 1024).toFixed(1)} MB/s
                    </div>
                  </div>
                )}

                {downloadedPath && (
                  <div className="bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-700 p-4 rounded">
                    <h4 className="font-medium text-green-900 dark:text-green-100 mb-2">
                      ✅ Download Complete!
                    </h4>
                    <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                      Firmware saved to: <span className="font-mono text-xs">{downloadedPath}</span>
                    </p>
                    
                    {/* Show verification status if hash is available */}
                    {checkResult.release_info?.sha256_hash && (
                      <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 p-3 rounded mb-3">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          🔐 <strong>File Verification:</strong> SHA256 hash verified
                        </p>
                        <p className="text-xs text-blue-600 dark:text-blue-400 font-mono mt-1 truncate">
                          {checkResult.release_info.sha256_hash}
                        </p>
                      </div>
                    )}
                    
                    <div className="bg-yellow-50 dark:bg-yellow-900/50 border border-yellow-200 dark:border-yellow-700 p-3 rounded mt-3">
                      <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>Next Steps:</strong>
                        <br />
                        1. Put your device in bootloader mode (hold BOOT + press RESET)
                        <br />
                        2. Copy the downloaded .uf2 file to the device's mass storage
                        <br />
                        3. The device will automatically reboot with the new firmware
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-600">
              <Button
                variant="secondary"
                onClick={onClose}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};