import { useState } from 'react';
import { Download, Upload, RotateCcw, Trash2, HardDrive, FileText, AlertTriangle, TestTube, CircuitBoard } from 'lucide-react';
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
import { useRawStateConfig } from '@/contexts/RawStateConfigContext';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

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
  const { gpioPullMode, shiftRegPullMode, toggleGpioPullMode, toggleShiftRegPullMode } = useRawStateConfig();

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

      {/* Raw State Interpretation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CircuitBoard className="h-4 w-4" /> Raw State Interpretation</CardTitle>
          <CardDescription>Configure how raw voltage levels map to logical ACTIVE state</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* GPIO Pull Mode */}
            <div className="flex items-start gap-4 p-3 rounded border bg-muted/20">
              <div className="flex-1 space-y-1">
                <Label htmlFor="gpio-pull-mode" className="flex items-center gap-2">GPIO Pull Mode
                  <span className="text-xs font-normal text-muted-foreground">({gpioPullMode})</span>
                </Label>
                <p className="text-xs text-muted-foreground select-none">
                  Determines which physical level represents logical ACTIVE for GPIO pins.
                  {gpioPullMode === 'pull-up' ? ' LOW→ACTIVE, HIGH→idle' : ' HIGH→ACTIVE, LOW→idle'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Switch
                  id="gpio-pull-mode"
                  checked={gpioPullMode === 'pull-up'}
                  onCheckedChange={toggleGpioPullMode}
                  className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-gray-400"
                />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground select-none ">{gpioPullMode === 'pull-up' ? 'Pull-Up' : 'Pull-Down'}</span>
              </div>
            </div>

            {/* Shift Register Pull Mode */}
            <div className="flex items-start gap-4 p-3 rounded border bg-muted/20">
              <div className="flex-1 space-y-1">
                <Label htmlFor="shift-pull-mode" className="flex items-center gap-2">Shift Register Mode
                  <span className="text-xs font-normal text-muted-foreground">({shiftRegPullMode})</span>
                </Label>
                <p className="text-xs text-muted-foreground select-none">
                  Maps 74HC165 bit values to logical state.
                  {shiftRegPullMode === 'pull-up' ? ' 0→ACTIVE, 1→idle' : ' 1→ACTIVE, 0→idle'}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Switch
                  id="shift-pull-mode"
                  checked={shiftRegPullMode === 'pull-up'}
                  onCheckedChange={toggleShiftRegPullMode}
                  className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-gray-400"
                />
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground select-none">{shiftRegPullMode === 'pull-up' ? 'Pull-Up' : 'Pull-Down'}</span>
              </div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground leading-relaxed select-none">
            Changing these settings only affects how the frontend interprets displayed raw states. It does not reconfigure the device firmware electrical pull resistors.
          </div>
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