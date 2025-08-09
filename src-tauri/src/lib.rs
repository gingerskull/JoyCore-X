pub mod serial;
pub mod device;
pub mod commands;

use std::sync::Arc;
use device::DeviceManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  // Create shared device manager
  let device_manager = Arc::new(DeviceManager::new());

  tauri::Builder::default()
    .manage(device_manager)
    .invoke_handler(tauri::generate_handler![
      commands::discover_devices,
      commands::get_devices,
      commands::cleanup_disconnected_devices,
      commands::connect_device,
      commands::disconnect_device,
      commands::get_connected_device,
      commands::get_device_status,
      commands::read_axis_config,
      commands::write_axis_config,
      commands::read_button_config,
      commands::write_button_config,
      commands::save_device_config,
      commands::load_device_config,
      commands::get_profiles,
      commands::create_profile,
      commands::update_profile,
      commands::delete_profile,
      commands::set_active_profile,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      log::info!("JoyCore-X application started");
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
