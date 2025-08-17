import { useState } from 'react';
import { Download, Upload, RotateCcw, Trash2, HardDrive, FileText, AlertTriangle, TestTube } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { useDeviceConfig } from '@/hooks/useDeviceConfig';
import { useDeviceContext } from '@/contexts/DeviceContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import type { StorageInfo } from '@/lib/types';

export function DeviceConfigManagement() {
  const { isConnected } = useDeviceContext();
  const {
    isLoading,
    error,
    resetToDefaults,
    formatStorage,
    getStorageInfo,
    listFiles,
    exportConfig,
    importConfig,
  } = useDeviceConfig();

  const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
  const [files, setFiles] = useState<string[]>([]);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showFormatDialog, setShowFormatDialog] = useState(false);

  // Load storage info
  const loadStorageInfo = async () => {
    const info = await getStorageInfo();
    if (info) {
      setStorageInfo(info);
      const fileList = await listFiles();
      setFiles(fileList);
    }
  };

  // Export configuration
  const handleExport = async () => {
    const blob = await exportConfig();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `joycore-config-${new Date().toISOString().split('T')[0]}.bin`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Configuration exported successfully');
    } else {
      toast.error('Failed to export configuration');
    }
  };

  // Import configuration
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const success = await importConfig(file);
      if (success) {
        toast.success('Configuration imported successfully');
        await loadStorageInfo();
      } else {
        toast.error('Failed to import configuration');
      }
    }
  };

  // Reset to defaults
  const handleReset = async () => {
    setShowResetDialog(false);
    const success = await resetToDefaults();
    if (success) {
      toast.success('Device reset to factory defaults');
      await loadStorageInfo();
    } else {
      toast.error('Failed to reset device');
    }
  };

  // Format storage
  const handleFormat = async () => {
    setShowFormatDialog(false);
    const success = await formatStorage();
    if (success) {
      toast.warning('Device storage formatted - all files deleted');
      await loadStorageInfo();
    } else {
      toast.error('Failed to format storage');
    }
  };

  // Test LIST_FILES command
  const handleTestListFiles = async () => {
    try {
      const files: string[] = await invoke('test_list_device_files');
      toast.success(`Found ${files.length} files: ${files.join(', ')}`);
      console.log('Device files:', files);
    } catch (error) {
      toast.error(`Failed to list files: ${error}`);
      console.error('List files error:', error);
    }
  };

  // Calculate storage usage percentage
  const storageUsagePercent = storageInfo 
    ? (storageInfo.used_bytes / storageInfo.total_bytes) * 100 
    : 0;

  if (!isConnected) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          Please connect a device to manage configuration
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuration Management</CardTitle>
          <CardDescription>
            Import, export, and manage device configuration files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="select-none">
                Note: The firmware currently has limited file system support. 
                Export/Import features require firmware updates to work properly.
              </span>
            </AlertDescription>
          </Alert>

          <div className="flex gap-4 flex-wrap">
            <Button
              onClick={handleExport}
              disabled={true}
              variant="outline"
              title="Requires firmware support for READ_FILE command"
            >
              <Download className="mr-2 h-4 w-4" />
              Export Config (Not Available)
            </Button>

            <Button
              onClick={() => document.getElementById('import-config')?.click()}
              disabled={true}
              variant="outline"
              title="Requires firmware support for WRITE_FILE command"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import Config (Not Available)
            </Button>
            <input
              id="import-config"
              type="file"
              accept=".bin"
              onChange={handleImport}
              className="hidden"
            />

            <Button
              onClick={() => setShowResetDialog(true)}
              disabled={isLoading}
              variant="outline"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              Reset to Defaults
            </Button>

            <Button
              onClick={() => setShowFormatDialog(true)}
              disabled={isLoading}
              variant="destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Force Default Config
            </Button>
          </div>

          <Button
            onClick={handleTestListFiles}
            disabled={isLoading}
            variant="outline"
            className="mr-2"
          >
            <TestTube className="mr-2 h-4 w-4" />
            Test LIST_FILES
          </Button>

          <Button
            onClick={loadStorageInfo}
            disabled={isLoading}
            variant="secondary"
            className="w-full"
          >
            <HardDrive className="mr-2 h-4 w-4" />
            Load Storage Info
          </Button>
        </CardContent>
      </Card>

      {storageInfo && (
        <Card>
          <CardHeader>
            <CardTitle>Storage Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="select-none">Used Space</span>
                <span className="select-none">{storageInfo.used_bytes} / {storageInfo.total_bytes} bytes</span>
              </div>
              <Progress value={storageUsagePercent} />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground select-none">Available Space</p>
                <p className="font-medium select-none">{storageInfo.available_bytes} bytes</p>
              </div>
              <div>
                <p className="text-muted-foreground select-none">File Count</p>
                <p className="font-medium select-none">{storageInfo.file_count} / {storageInfo.max_files}</p>
              </div>
            </div>

            {files.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2 select-none">Files on Device:</p>
                <div className="space-y-1">
                  {files.map((file) => (
                    <div key={file} className="flex items-center gap-2 text-sm">
                      <FileText className="h-3 w-3" />
                      <span className="font-mono select-text">{file}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to Factory Defaults?</DialogTitle>
            <DialogDescription>
              This will reset all device configuration to factory defaults. 
              Your current configuration will be lost unless you export it first.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReset}>
              Reset Device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Format Dialog */}
      <Dialog open={showFormatDialog} onOpenChange={setShowFormatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Force Default Configuration?</DialogTitle>
            <DialogDescription className="space-y-2">
              <p>
                <strong className="text-destructive">WARNING:</strong> This will reset the device 
                to factory default configuration using the FORCE_DEFAULT_CONFIG command.
              </p>
              <p>
                All custom settings will be lost and replaced with defaults. 
                This action cannot be undone.
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFormatDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleFormat}>
              Force Default Config
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}