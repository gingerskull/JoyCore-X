use super::{PortEvent, PortMonitor, PortEventDebouncer};
use async_trait::async_trait;
use libudev::{Context, Monitor, MonitorBuilder};
use std::os::unix::io::AsRawFd;
use tokio::sync::mpsc;

pub struct LinuxPortMonitor {
    tx: Option<mpsc::Sender<PortEvent>>,
    rx: Option<mpsc::Receiver<PortEvent>>,
    stop_tx: Option<mpsc::Sender<()>>,
    thread_handle: Option<tokio::task::JoinHandle<()>>,
}

impl LinuxPortMonitor {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(100);
        
        Self {
            tx: Some(tx),
            rx: Some(rx),
            stop_tx: None,
            thread_handle: None,
        }
    }
    
    fn extract_port_name(device: &libudev::Device) -> Option<String> {
        // Check if this is a tty device
        if let Some(devnode) = device.devnode() {
            if let Some(path_str) = devnode.to_str() {
                // Look for /dev/ttyUSB* or /dev/ttyACM* (common USB-serial devices)
                if path_str.contains("/dev/ttyUSB") || path_str.contains("/dev/ttyACM") {
                    // Extract just the device name (e.g., "ttyUSB0")
                    if let Some(name) = path_str.split('/').last() {
                        return Some(name.to_string());
                    }
                }
            }
        }
        
        // Also check sysname for tty devices
        if let Some(sysname) = device.sysname().to_str() {
            if sysname.starts_with("ttyUSB") || sysname.starts_with("ttyACM") {
                return Some(sysname.to_string());
            }
        }
        
        None
    }
}

#[async_trait]
impl PortMonitor for LinuxPortMonitor {
    async fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let tx = self.tx.take().ok_or("Already started")?;
        let (stop_tx, mut stop_rx) = mpsc::channel(1);
        self.stop_tx = Some(stop_tx);
        
        let handle = tokio::task::spawn_blocking(move || {
            let context = Context::new()?;
            let mut monitor = MonitorBuilder::new(&context)?
                .match_subsystem("tty")?
                .listen()?;
            
            // Create debouncer with 100ms window
            let mut debouncer = PortEventDebouncer::new(tx, 100);
            
            // Get file descriptor for the monitor
            let fd = monitor.as_raw_fd();
            
            // Use tokio's async runtime for the event loop
            let runtime = tokio::runtime::Handle::current();
            
            runtime.block_on(async {
                let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(50));
                
                loop {
                    tokio::select! {
                        _ = stop_rx.recv() => {
                            log::info!("Linux port monitor stopping");
                            break;
                        }
                        _ = interval.tick() => {
                            // Check for udev events
                            if let Some(event) = monitor.iter().next() {
                                let action = event.action();
                                let device = event.device();
                                
                                if let Some(port_name) = Self::extract_port_name(&device) {
                                    let event = match action {
                                        "add" => Some(PortEvent::PortAdded(port_name)),
                                        "remove" => Some(PortEvent::PortRemoved(port_name)),
                                        _ => None,
                                    };
                                    
                                    if let Some(evt) = event {
                                        if let Err(e) = debouncer.send_event(evt).await {
                                            log::error!("Failed to send port event: {}", e);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            
            Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
        });
        
        self.thread_handle = Some(handle);
        Ok(())
    }
    
    async fn stop(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(stop_tx) = &self.stop_tx {
            let _ = stop_tx.send(()).await;
        }
        
        if let Some(handle) = self.thread_handle.take() {
            handle.await??;
        }
        
        Ok(())
    }
    
    fn get_receiver(&mut self) -> Option<mpsc::Receiver<PortEvent>> {
        self.rx.take()
    }
}