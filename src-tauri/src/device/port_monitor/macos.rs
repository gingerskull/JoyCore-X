use super::{PortEvent, PortMonitor, PortEventDebouncer};
use async_trait::async_trait;
use core_foundation::base::TCFType;
use core_foundation::dictionary::CFDictionary;
use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop};
use core_foundation::string::CFString;
use io_kit_sys::*;
use std::ffi::{c_void, CStr};
use std::os::raw::c_char;
use tokio::sync::mpsc;

pub struct MacOSPortMonitor {
    tx: Option<mpsc::Sender<PortEvent>>,
    rx: Option<mpsc::Receiver<PortEvent>>,
    stop_tx: Option<mpsc::Sender<()>>,
    thread_handle: Option<tokio::task::JoinHandle<()>>,
}

impl MacOSPortMonitor {
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(100);
        let (stop_tx, stop_rx) = mpsc::channel(1);
        
        Self {
            tx: Some(tx),
            rx: Some(rx),
            stop_tx: Some(stop_tx),
            thread_handle: None,
        }
    }
    
    unsafe extern "C" fn serial_port_callback(
        _refcon: *mut c_void,
        iterator: io_iterator_t,
    ) {
        let debouncer = _refcon as *mut PortEventDebouncer;
        if debouncer.is_null() {
            return;
        }
        
        let mut service: io_object_t = 0;
        while {
            service = IOIteratorNext(iterator);
            service != 0
        } {
            // Get BSD path (e.g., /dev/cu.usbserial-1234)
            let path_cf = CFString::from_static_string("IOCalloutDevice");
            let path_ptr = IORegistryEntryCreateCFProperty(
                service,
                path_cf.as_concrete_TypeRef(),
                kCFAllocatorDefault,
                0,
            );
            
            if !path_ptr.is_null() {
                let path_cf = CFString::wrap_under_get_rule(path_ptr as _);
                let path = path_cf.to_string();
                
                // Extract device name from path
                if let Some(name) = path.split('/').last() {
                    if name.starts_with("cu.") || name.starts_with("tty.") {
                        let port_name = name.to_string();
                        
                        // For macOS, we'll determine add/remove based on the notification type
                        // This callback is registered for both
                        let event = PortEvent::PortAdded(port_name.clone());
                        
                        // Send event through debouncer
                        let runtime = tokio::runtime::Handle::current();
                        runtime.spawn(async move {
                            let debouncer = &mut *(debouncer as *mut PortEventDebouncer);
                            if let Err(e) = debouncer.send_event(event).await {
                                log::error!("Failed to send port event: {}", e);
                            }
                        });
                    }
                }
            }
            
            IOObjectRelease(service);
        }
    }
}

#[async_trait]
impl PortMonitor for MacOSPortMonitor {
    async fn start(&mut self) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
        let tx = self.tx.take().ok_or("Already started")?;
        let mut stop_rx = self.stop_tx.as_ref().unwrap().subscribe();
        
        let handle = tokio::task::spawn_blocking(move || {
            unsafe {
                // Create debouncer
                let mut debouncer = PortEventDebouncer::new(tx, 100);
                let debouncer_ptr = &mut debouncer as *mut _ as *mut c_void;
                
                // Create notification port
                let notify_port = IONotificationPortCreate(kIOMasterPortDefault);
                if notify_port.is_null() {
                    return Err("Failed to create notification port".into());
                }
                
                // Get run loop source
                let run_loop_source = IONotificationPortGetRunLoopSource(notify_port);
                if run_loop_source.is_null() {
                    IONotificationPortDestroy(notify_port);
                    return Err("Failed to get run loop source".into());
                }
                
                // Add to current run loop
                let run_loop = CFRunLoop::get_current();
                CFRunLoopAddSource(
                    run_loop.as_concrete_TypeRef(),
                    run_loop_source,
                    kCFRunLoopDefaultMode,
                );
                
                // Create matching dictionary for serial devices
                let matching = IOServiceMatching(b"IOSerialBSDClient\0".as_ptr() as *const c_char);
                if matching.is_null() {
                    IONotificationPortDestroy(notify_port);
                    return Err("Failed to create matching dictionary".into());
                }
                
                // Register for notifications
                let mut added_iter: io_iterator_t = 0;
                let kr = IOServiceAddMatchingNotification(
                    notify_port,
                    kIOFirstMatchNotification,
                    matching,
                    Some(Self::serial_port_callback),
                    debouncer_ptr,
                    &mut added_iter,
                );
                
                if kr != KERN_SUCCESS {
                    IONotificationPortDestroy(notify_port);
                    return Err(format!("Failed to register notification: {}", kr).into());
                }
                
                // Process existing devices
                Self::serial_port_callback(debouncer_ptr, added_iter);
                
                // Also register for removal notifications
                let matching_remove = IOServiceMatching(b"IOSerialBSDClient\0".as_ptr() as *const c_char);
                let mut removed_iter: io_iterator_t = 0;
                let kr = IOServiceAddMatchingNotification(
                    notify_port,
                    kIOTerminatedNotification,
                    matching_remove,
                    Some(Self::serial_port_callback),
                    debouncer_ptr,
                    &mut removed_iter,
                );
                
                if kr != KERN_SUCCESS {
                    IOObjectRelease(added_iter);
                    IONotificationPortDestroy(notify_port);
                    return Err(format!("Failed to register removal notification: {}", kr).into());
                }
                
                // Process any pending removals
                Self::serial_port_callback(debouncer_ptr, removed_iter);
                
                // Run the event loop
                let runtime = tokio::runtime::Handle::current();
                runtime.block_on(async {
                    loop {
                        tokio::select! {
                            _ = stop_rx.recv() => {
                                log::info!("macOS port monitor stopping");
                                break;
                            }
                            _ = tokio::time::sleep(tokio::time::Duration::from_millis(100)) => {
                                // Run the CF run loop for a short time
                                CFRunLoopRunInMode(
                                    kCFRunLoopDefaultMode,
                                    0.1,
                                    false as u8,
                                );
                            }
                        }
                    }
                });
                
                // Cleanup
                IOObjectRelease(added_iter);
                IOObjectRelease(removed_iter);
                CFRunLoopRemoveSource(
                    run_loop.as_concrete_TypeRef(),
                    run_loop_source,
                    kCFRunLoopDefaultMode,
                );
                IONotificationPortDestroy(notify_port);
                
                Ok::<(), Box<dyn std::error::Error + Send + Sync>>(())
            }
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