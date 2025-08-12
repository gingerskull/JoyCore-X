import React from 'react';
import { Button } from './ui/button';

interface FirmwareUpdateNotificationProps {
  currentVersion: string;
  latestVersion: string;
  isVisible: boolean;
  onCheckUpdates: () => void;
  onDismiss: () => void;
}

export const FirmwareUpdateNotification: React.FC<FirmwareUpdateNotificationProps> = ({
  currentVersion,
  latestVersion,
  isVisible,
  onCheckUpdates,
  onDismiss,
}) => {
  if (!isVisible) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg p-4 mb-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
              <span className="text-white text-sm">!</span>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Firmware Update Available
            </h3>
            <div className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              <p>
                A new firmware version is available: <strong>v{latestVersion}</strong>
              </p>
              <p className="text-xs mt-1">
                Current version: v{currentVersion}
              </p>
            </div>
            <div className="mt-3 flex space-x-2">
              <Button
                size="sm"
                onClick={onCheckUpdates}
                className="text-xs px-3 py-1"
              >
                View Update
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={onDismiss}
                className="text-xs px-3 py-1"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-blue-400 hover:text-blue-600 dark:hover:text-blue-300"
        >
          <span className="sr-only">Dismiss</span>
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
};