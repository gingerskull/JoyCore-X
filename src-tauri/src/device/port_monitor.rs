use tokio::sync::mpsc;
use std::time::{Duration, Instant};

/// Events emitted by the port monitor
#[derive(Debug, Clone)]
pub enum PortEvent {
    /// A serial port was added
    PortAdded(String),
    /// A serial port was removed  
    PortRemoved(String),
}

/// Platform-agnostic trait for monitoring serial port changes
#[async_trait::async_trait]
pub trait PortMonitor: Send + Sync {
    /// Start monitoring for port changes
    async fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;
    
    /// Stop monitoring
    async fn stop(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>>;
    
    /// Get receiver for port events
    fn get_receiver(&mut self) -> Option<mpsc::Receiver<PortEvent>>;
}

/// Debouncer for port events to prevent discovery storms
pub struct PortEventDebouncer {
    tx: mpsc::Sender<PortEvent>,
    last_event_time: Instant,
    debounce_duration: Duration,
}

impl PortEventDebouncer {
    pub fn new(tx: mpsc::Sender<PortEvent>, debounce_ms: u64) -> Self {
        Self {
            tx,
            last_event_time: Instant::now().checked_sub(Duration::from_secs(1)).unwrap_or(Instant::now()),
            debounce_duration: Duration::from_millis(debounce_ms),
        }
    }
    
    pub async fn send_event(&mut self, event: PortEvent) -> Result<(), mpsc::error::SendError<PortEvent>> {
        let now = Instant::now();
        if now.duration_since(self.last_event_time) >= self.debounce_duration {
            self.last_event_time = now;
            self.tx.send(event).await
        } else {
            // Event ignored due to debouncing
            log::debug!("Port event debounced: {:?}", event);
            Ok(())
        }
    }
}

// Platform-specific implementations
#[cfg(target_os = "windows")]
mod windows;
#[cfg(target_os = "windows")]
pub use windows::WindowsPortMonitor;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "linux")]
pub use linux::LinuxPortMonitor;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::MacOSPortMonitor;

/// Create a platform-specific port monitor
pub fn create_port_monitor() -> Box<dyn PortMonitor> {
    #[cfg(target_os = "windows")]
    {
        Box::new(WindowsPortMonitor::new())
    }
    
    #[cfg(target_os = "linux")]
    {
        Box::new(LinuxPortMonitor::new())
    }
    
    #[cfg(target_os = "macos")]
    {
        Box::new(MacOSPortMonitor::new())
    }
    
    #[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
    {
        // Fallback for unsupported platforms
        Box::new(NoOpPortMonitor::new())
    }
}

/// No-op implementation for unsupported platforms
#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
struct NoOpPortMonitor;

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
impl NoOpPortMonitor {
    fn new() -> Self {
        log::warn!("Port monitoring not supported on this platform");
        Self
    }
}

#[cfg(not(any(target_os = "windows", target_os = "linux", target_os = "macos")))]
#[async_trait::async_trait]
impl PortMonitor for NoOpPortMonitor {
    async fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        Ok(())
    }
    
    async fn stop(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        Ok(())
    }
    
    fn get_receiver(&mut self) -> Option<mpsc::Receiver<PortEvent>> {
        None
    }
}