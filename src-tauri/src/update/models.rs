use serde::{Deserialize, Serialize};
use semver::Version;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FirmwareRelease {
    pub version: Version,
    pub download_url: String,
    pub changelog: String,
    pub published_at: chrono::DateTime<chrono::Utc>,
    pub size_bytes: u64,
    pub sha256_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VersionCheckResult {
    pub current_version: Version,
    pub latest_version: Version,
    pub update_available: bool,
    pub release_info: Option<FirmwareRelease>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadProgress {
    pub downloaded_bytes: u64,
    pub total_bytes: u64,
    pub percentage: f64,
    pub speed_bps: u64,
}

#[derive(Debug, thiserror::Error)]
pub enum UpdateError {
    #[error("Network error: {0}")]
    Network(#[from] reqwest::Error),
    
    #[error("Version parsing error: {0}")]
    Version(#[from] semver::Error),
    
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    
    #[error("JSON parsing error: {0}")]
    Json(#[from] serde_json::Error),
    
    #[error("Parse error: {0}")]
    Parse(#[from] anyhow::Error),
    
    #[error("No update available")]
    NoUpdateAvailable,
    
    #[error("Invalid firmware signature")]
    InvalidSignature,
    
    #[error("Download interrupted")]
    DownloadInterrupted,
}

pub type UpdateResult<T> = Result<T, UpdateError>;