use super::{PortEvent, PortMonitor};
use async_trait::async_trait;
use tokio::sync::{mpsc, broadcast};
use std::time::Duration;

pub struct WindowsPortMonitor {
    tx: Option<mpsc::Sender<PortEvent>>,
    rx: Option<mpsc::Receiver<PortEvent>>,
    stop_tx: Option<broadcast::Sender<()>>,
    thread_handle: Option<tokio::task::JoinHandle<()>>,
}

impl WindowsPortMonitor {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(100);
        let (stop_tx, _) = broadcast::channel(1);
        
        Self {
            tx: Some(tx),
            rx: Some(rx),
            stop_tx: Some(stop_tx),
            thread_handle: None,
        }
    }
}

#[async_trait]
impl PortMonitor for WindowsPortMonitor {
    async fn start(&mut self) -> std::result::Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let tx = self.tx.take().ok_or("Already started")?;
        let mut stop_rx = self.stop_tx.as_ref().unwrap().subscribe();
        
        // For Windows, we'll use a simple polling approach for now
        // This is temporary until we can properly implement WM_DEVICECHANGE
        let handle = tokio::spawn(async move {
            log::info!("Windows port monitor started (polling mode)");
            let mut last_ports = std::collections::HashSet::new();
            
            // Get initial ports
            if let Ok(ports) = serialport::available_ports() {
                for port in ports {
                    if port.port_name.starts_with("COM") {
                        last_ports.insert(port.port_name);
                    }
                }
            }
            
            let mut interval = tokio::time::interval(Duration::from_secs(2));
            
            loop {
                tokio::select! {
                    _ = stop_rx.recv() => {
                        log::info!("Windows port monitor stopping");
                        break;
                    }
                    _ = interval.tick() => {
                        // Check for port changes
                        if let Ok(ports) = serialport::available_ports() {
                            let mut current_ports = std::collections::HashSet::new();
                            
                            for port in ports {
                                if port.port_name.starts_with("COM") {
                                    current_ports.insert(port.port_name.clone());
                                    
                                    // Check for new ports
                                    if !last_ports.contains(&port.port_name) {
                                        let _ = tx.send(PortEvent::PortAdded(port.port_name)).await;
                                    }
                                }
                            }
                            
                            // Check for removed ports
                            for old_port in &last_ports {
                                if !current_ports.contains(old_port) {
                                    let _ = tx.send(PortEvent::PortRemoved(old_port.clone())).await;
                                }
                            }
                            
                            last_ports = current_ports;
                        }
                    }
                }
            }
        });
        
        self.thread_handle = Some(handle);
        Ok(())
    }
    
    async fn stop(&mut self) -> std::result::Result<(), Box<dyn std::error::Error + Send + Sync>> {
        if let Some(stop_tx) = &self.stop_tx {
            let _ = stop_tx.send(());
        }
        
        if let Some(handle) = self.thread_handle.take() {
            handle.abort();
            let _ = handle.await;
        }
        
        Ok(())
    }
    
    fn get_receiver(&mut self) -> Option<mpsc::Receiver<PortEvent>> {
        self.rx.take()
    }
}