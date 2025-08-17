import { useState, useEffect } from 'react';
import { X, Minus, Square, Maximize2 } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Button } from '@/components/ui/button';

export function TitleBar() {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    // Check initial maximized state
    const checkMaximized = async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    };
    checkMaximized();

    // Listen for window state changes
    const unlisten = appWindow.onResized(async () => {
      const maximized = await appWindow.isMaximized();
      setIsMaximized(maximized);
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, [appWindow]);

  const handleMinimize = () => {
    appWindow.minimize();
  };

  const handleMaximize = async () => {
    const maximized = await appWindow.isMaximized();
    if (maximized) {
      await appWindow.unmaximize();
    } else {
      await appWindow.maximize();
    }
  };

  const handleClose = () => {
    appWindow.close();
  };

  return (
    <div 
      className="h-8 bg-[#202427] flex items-center justify-between select-none border-border border-b"
      data-tauri-drag-region
    >
      {/* App Title */}
      <div className="flex items-center px-3">
        <span className="text-sm text-foreground font-medium">
          JoyCore-X - HOTAS Configuration Dashboard
        </span>
      </div>

      {/* Window Controls */}
      <div className="flex">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-12 rounded-none hover:bg-white/10 focus-visible:ring-0"
          onClick={handleMinimize}
        >
          <Minus className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-12 rounded-none hover:bg-white/10 focus-visible:ring-0"
          onClick={handleMaximize}
        >
          {isMaximized ? (
            <Square className="h-3 w-3" />
          ) : (
            <Maximize2 className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-12 rounded-none hover:bg-destructive hover:text-destructive-foreground focus-visible:ring-0"
          onClick={handleClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}