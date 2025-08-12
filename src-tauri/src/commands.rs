use std::sync::Arc;
use std::path::PathBuf;
use tauri::{State, Emitter};
use uuid::Uuid;
use semver::Version;

use crate::device::{DeviceManager, Device, ProfileConfig, ProfileManager};
use crate::serial::protocol::{DeviceStatus, AxisConfig, ButtonConfig};
use crate::serial::StorageInfo;
use crate::update::{UpdateService, VersionCheckResult};
use crate::config::binary::{BinaryConfig, UIAxisConfig, UIButtonConfig};

/// Discover available JoyCore devices
#[tauri::command]
pub async fn discover_devices(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<Vec<Device>, String> {
    device_manager
        .discover_devices()
        .await
        .map_err(|e| format!("Failed to discover devices: {}", e))
}

/// Get all known devices
#[tauri::command]
pub async fn get_devices(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<Vec<Device>, String> {
    Ok(device_manager.get_devices().await)
}

/// Clean up devices that are no longer present
#[tauri::command]
pub async fn cleanup_disconnected_devices(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<Vec<String>, String> {
    device_manager
        .cleanup_disconnected_devices()
        .await
        .map(|uuids| uuids.into_iter().map(|uuid| uuid.to_string()).collect())
        .map_err(|e| format!("Failed to cleanup disconnected devices: {}", e))
}

/// Connect to a specific device
#[tauri::command]
pub async fn connect_device(
    device_id: String,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    let uuid = Uuid::parse_str(&device_id)
        .map_err(|e| format!("Invalid device ID: {}", e))?;
    
    device_manager
        .connect_device(&uuid)
        .await
        .map_err(|e| format!("Failed to connect to device: {}", e))
}

/// Disconnect from the currently connected device
#[tauri::command]
pub async fn disconnect_device(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .disconnect_device()
        .await
        .map_err(|e| format!("Failed to disconnect device: {}", e))
}

/// Get the currently connected device
#[tauri::command]
pub async fn get_connected_device(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<Option<Device>, String> {
    if let Some(device_id) = device_manager.get_connected_device_id().await {
        Ok(device_manager.get_device(&device_id).await)
    } else {
        Ok(None)
    }
}

/// Get device status for the connected device
#[tauri::command]
pub async fn get_device_status(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<Option<DeviceStatus>, String> {
    if let Some(device_id) = device_manager.get_connected_device_id().await {
        if let Some(device) = device_manager.get_device(&device_id).await {
            Ok(device.device_status)
        } else {
            Ok(None)
        }
    } else {
        Ok(None)
    }
}

/// Read axis configuration from connected device
#[tauri::command]
pub async fn read_axis_config(
    axis_id: u8,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<AxisConfig, String> {
    device_manager
        .read_axis_config(axis_id)
        .await
        .map_err(|e| format!("Failed to read axis config: {}", e))
}

/// Write axis configuration to connected device
#[tauri::command]
pub async fn write_axis_config(
    config: AxisConfig,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .write_axis_config(&config)
        .await
        .map_err(|e| format!("Failed to write axis config: {}", e))
}

/// Read button configuration from connected device
#[tauri::command]
pub async fn read_button_config(
    button_id: u8,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<ButtonConfig, String> {
    device_manager
        .read_button_config(button_id)
        .await
        .map_err(|e| format!("Failed to read button config: {}", e))
}

/// Write button configuration to connected device
#[tauri::command]
pub async fn write_button_config(
    config: ButtonConfig,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .write_button_config(&config)
        .await
        .map_err(|e| format!("Failed to write button config: {}", e))
}

/// Save configuration to connected device
#[tauri::command]
pub async fn save_device_config(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .save_device_config()
        .await
        .map_err(|e| format!("Failed to save device config: {}", e))
}

/// Load configuration from connected device
#[tauri::command]
pub async fn load_device_config(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .load_device_config()
        .await
        .map_err(|e| format!("Failed to load device config: {}", e))
}

/// Get all profiles
#[tauri::command]
pub async fn get_profiles(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<ProfileManager, String> {
    Ok(device_manager.get_profile_manager().await)
}

/// Create a new profile
#[tauri::command]
pub async fn create_profile(
    profile: ProfileConfig,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .update_profile_manager(|pm| {
            pm.add_profile(profile);
        })
        .await
        .map_err(|e| format!("Failed to create profile: {}", e))
}

/// Update an existing profile
#[tauri::command]
pub async fn update_profile(
    profile: ProfileConfig,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .update_profile_manager(|pm| {
            if let Some(existing_profile) = pm.get_profile_mut(&profile.id) {
                *existing_profile = profile;
            }
        })
        .await
        .map_err(|e| format!("Failed to update profile: {}", e))
}

/// Delete a profile
#[tauri::command]
pub async fn delete_profile(
    profile_id: String,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<bool, String> {
    let mut removed = false;
    device_manager
        .update_profile_manager(|pm| {
            removed = pm.remove_profile(&profile_id);
        })
        .await
        .map_err(|e| format!("Failed to delete profile: {}", e))?;
    
    Ok(removed)
}

/// Set the active profile
#[tauri::command]
pub async fn set_active_profile(
    profile_id: String,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<bool, String> {
    let mut success = false;
    device_manager
        .update_profile_manager(|pm| {
            success = pm.set_active_profile(&profile_id);
        })
        .await
        .map_err(|e| format!("Failed to set active profile: {}", e))?;
    
    Ok(success)
}

// Firmware update commands

/// Check for firmware updates
#[tauri::command]
pub async fn check_firmware_updates(
    current_version: String,
    repo_owner: String,
    repo_name: String,
) -> Result<VersionCheckResult, String> {
    let version = Version::parse(&current_version)
        .map_err(|e| format!("Invalid current version: {}", e))?;
    
    let update_service = UpdateService::new(repo_owner, repo_name);
    update_service
        .check_for_updates(version)
        .await
        .map_err(|e| format!("Failed to check for updates: {}", e))
}

/// Download firmware update
#[tauri::command]
pub async fn download_firmware_update(
    download_url: String,
    version: String,
    changelog: String,
    published_at: String,
    size_bytes: u64,
    output_dir: String,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    use crate::update::models::FirmwareRelease;
    
    let version_parsed = Version::parse(&version)
        .map_err(|e| format!("Invalid version: {}", e))?;
    
    let published_at_parsed = chrono::DateTime::parse_from_rfc3339(&published_at)
        .map_err(|e| format!("Invalid date: {}", e))?
        .with_timezone(&chrono::Utc);
    
    let release = FirmwareRelease {
        version: version_parsed.clone(),
        download_url,
        changelog,
        published_at: published_at_parsed,
        size_bytes,
        sha256_hash: None,
    };
    
    let output_path = PathBuf::from(&output_dir).join(format!("firmware-{}.uf2", version_parsed));
    let update_service = UpdateService::new("gingerskull".to_string(), "JoyCore-FW".to_string());
    
    update_service
        .download_firmware(&release, &output_path, |progress| {
            // Emit progress events to frontend
            let _ = app_handle.emit("download_progress", &progress);
        })
        .await
        .map_err(|e| format!("Failed to download firmware: {}", e))?;
    
    Ok(output_path.to_string_lossy().to_string())
}

/// Get all available firmware versions
#[tauri::command]
pub async fn get_available_firmware_versions(
    repo_owner: String,
    repo_name: String,
) -> Result<Vec<crate::update::models::FirmwareRelease>, String> {
    let update_service = UpdateService::new(repo_owner, repo_name);
    update_service
        .get_available_versions()
        .await
        .map_err(|e| format!("Failed to get available versions: {}", e))
}

/// Verify downloaded firmware integrity
#[tauri::command]
pub async fn verify_firmware(
    file_path: String,
    expected_hash: Option<String>,
) -> Result<bool, String> {
    let path = PathBuf::from(&file_path);
    let update_service = UpdateService::new("".to_string(), "".to_string());
    
    update_service
        .verify_firmware(&path, expected_hash.as_deref())
        .await
        .map_err(|e| format!("Failed to verify firmware: {}", e))
}

// Binary configuration file commands

/// Read raw device configuration binary
#[tauri::command]
pub async fn read_device_config_raw(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<Vec<u8>, String> {
    device_manager
        .read_config_binary()
        .await
        .map_err(|e| format!("Failed to read config binary: {}", e))
}

/// Write raw device configuration binary
#[tauri::command]
pub async fn write_device_config_raw(
    data: Vec<u8>,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .write_config_binary(&data)
        .await
        .map_err(|e| format!("Failed to write config binary: {}", e))
}

/// Delete device configuration file
#[tauri::command]
pub async fn delete_device_config(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .delete_config_file()
        .await
        .map_err(|e| format!("Failed to delete config file: {}", e))
}

/// Reset device to factory defaults
#[tauri::command]
pub async fn reset_device_to_defaults(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .reset_device_to_defaults()
        .await
        .map_err(|e| format!("Failed to reset device: {}", e))
}

/// Format device storage (deletes all files)
#[tauri::command]
pub async fn format_device_storage(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .format_device_storage()
        .await
        .map_err(|e| format!("Failed to format storage: {}", e))
}

/// Get device storage information
#[tauri::command]
pub async fn get_device_storage_info(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<StorageInfo, String> {
    device_manager
        .get_device_storage_info()
        .await
        .map_err(|e| format!("Failed to get storage info: {}", e))
}

/// List files on device storage
#[tauri::command]
pub async fn list_device_files(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<Vec<String>, String> {
    device_manager
        .list_device_files()
        .await
        .map_err(|e| format!("Failed to list files: {}", e))
}

/// Read any file from device storage
#[tauri::command]
pub async fn read_device_file(
    filename: String,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<Vec<u8>, String> {
    device_manager
        .read_device_file(&filename)
        .await
        .map_err(|e| format!("Failed to read file: {}", e))
}

/// Write any file to device storage
#[tauri::command]
pub async fn write_device_file(
    filename: String,
    data: Vec<u8>,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .write_device_file(&filename, &data)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))
}

/// Delete any file from device storage
#[tauri::command]
pub async fn delete_device_file(
    filename: String,
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(), String> {
    device_manager
        .delete_device_file(&filename)
        .await
        .map_err(|e| format!("Failed to delete file: {}", e))
}

// Parsed configuration commands

/// Test device file listing
#[tauri::command]
pub async fn test_list_device_files(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<Vec<String>, String> {
    log::info!("Testing LIST_FILES command");
    
    let files = device_manager
        .list_device_files()
        .await
        .map_err(|e| {
            log::error!("Failed to list device files: {}", e);
            format!("Failed to list device files: {}", e)
        })?;

    log::info!("Found {} files: {:?}", files.len(), files);
    Ok(files)
}

/// Read and parse device configuration into UI format
#[tauri::command]
pub async fn read_parsed_device_config(
    device_manager: State<'_, Arc<DeviceManager>>,
) -> Result<(Vec<UIAxisConfig>, Vec<UIButtonConfig>), String> {
    
    // Read raw binary configuration
    let raw_data = device_manager
        .read_config_binary()
        .await
        .map_err(|e| {
            log::error!("Failed to read config binary: {}", e);
            format!("Failed to read config binary: {}", e)
        })?;

    // Parse binary data
    let config = BinaryConfig::from_bytes(&raw_data)
        .map_err(|e| {
            log::error!("Failed to parse config binary: {}", e);
            format!("Failed to parse config binary: {}", e)
        })?;

    // Convert to UI format
    let axes = config.to_axis_configs();
    let buttons = config.to_button_configs();

    Ok((axes, buttons))
}