use std::sync::Arc;
use tauri::State;
use uuid::Uuid;

use crate::device::{DeviceManager, Device, ProfileConfig, ProfileManager};
use crate::serial::protocol::{DeviceStatus, AxisConfig, ButtonConfig};

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