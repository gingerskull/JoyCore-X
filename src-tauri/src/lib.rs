pub mod serial;
pub mod device;
pub mod commands;
pub mod update;
pub mod config;
pub mod hid;

use std::sync::Arc;
use device::DeviceManager;
use tauri::Manager;

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
      commands::check_firmware_updates,
      commands::download_firmware_update,
      commands::get_available_firmware_versions,
      commands::verify_firmware,
      // Binary config commands
      commands::read_device_config_raw,
      commands::write_device_config_raw,
      commands::delete_device_config,
      commands::reset_device_to_defaults,
      commands::format_device_storage,
      commands::get_device_storage_info,
      commands::list_device_files,
      commands::read_device_file,
      commands::write_device_file,
      commands::delete_device_file,
      // Parsed config commands
      commands::test_list_device_files,
      commands::read_parsed_device_config,
      commands::read_device_pin_assignments,
      commands::read_parsed_device_config_with_pins,
      commands::read_button_states,
  commands::debug_hid_mapping,
  commands::debug_full_hid_report,
  commands::hid_mapping_details,
  commands::hid_button_bit_diagnostics,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      
      // Pass app handle to device manager for event emission
      let device_manager: tauri::State<Arc<DeviceManager>> = app.state();
      let device_manager_clone = device_manager.inner().clone();
      let handle = app.handle().clone();
      tauri::async_runtime::spawn(async move {
        device_manager_clone.set_app_handle(handle).await;
      });
      
      log::info!("JoyCore-X application started");
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
