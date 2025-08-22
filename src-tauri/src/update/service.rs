use std::path::Path;
use tokio::fs::File;
use tokio::io::{AsyncWriteExt, AsyncReadExt};
use reqwest::Client;
use semver::Version;
use serde_json::Value;
use sha2::{Sha256, Digest};
use log::{debug, info, error};

use super::models::{FirmwareRelease, VersionCheckResult, DownloadProgress, UpdateResult, UpdateError};

pub struct UpdateService {
    client: Client,
    github_api_base: String,
    repo_owner: String,
    repo_name: String,
}

impl UpdateService {
    pub fn new(repo_owner: String, repo_name: String) -> Self {
        Self {
            client: Client::new(),
            github_api_base: "https://api.github.com".to_string(),
            repo_owner,
            repo_name,
        }
    }

    /// Check GitHub releases for the latest firmware version
    pub async fn check_for_updates(&self, current_version: Version) -> UpdateResult<VersionCheckResult> {
        info!("Checking for firmware updates, current version: {}", current_version);
        
        let url = format!(
            "{}/repos/{}/{}/releases/latest",
            self.github_api_base, self.repo_owner, self.repo_name
        );
        
        debug!("Fetching latest release from: {}", url);
        
        let response = self.client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "JoyCore-X/1.0")
            .send()
            .await?;
        
        if !response.status().is_success() {
            error!("GitHub API request failed with status: {}", response.status());
            return Err(UpdateError::Network(
                reqwest::Error::from(response.error_for_status().unwrap_err())
            ));
        }
        
        let release_data: Value = response.json().await?;
        let release = self.parse_github_release(&release_data)?;
        
        let update_available = release.version > current_version;
        
        info!(
            "Version check complete - Current: {}, Latest: {}, Update available: {}",
            current_version, release.version, update_available
        );
        
        Ok(VersionCheckResult {
            current_version,
            latest_version: release.version.clone(),
            update_available,
            release_info: if update_available { Some(release) } else { None },
        })
    }

    /// Parse GitHub release JSON into FirmwareRelease struct
    fn parse_github_release(&self, data: &Value) -> UpdateResult<FirmwareRelease> {
        let tag_name = data["tag_name"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing tag_name in GitHub release"))?;
        
        // Remove 'v' prefix if present
        let version_str = tag_name.strip_prefix('v').unwrap_or(tag_name);
        let version = Version::parse(version_str)?;
        
        let published_at_str = data["published_at"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing published_at in GitHub release"))?;
        let published_at = chrono::DateTime::parse_from_rfc3339(published_at_str)
            .map_err(|e| anyhow::anyhow!("Date parse error: {}", e))?
            .with_timezone(&chrono::Utc);
        
        let changelog = data["body"].as_str().unwrap_or("").to_string();
        
        // Look for firmware asset in release
        let assets = data["assets"]
            .as_array()
            .ok_or_else(|| anyhow::anyhow!("Missing assets in GitHub release"))?;
        
        let firmware_asset = assets
            .iter()
            .find(|asset| {
                let name = asset["name"].as_str().unwrap_or("");
                name.ends_with(".uf2") || name.ends_with(".bin") || name.contains("firmware")
            })
            .ok_or_else(|| anyhow::anyhow!("No firmware asset found in GitHub release"))?;
        
        let download_url = firmware_asset["browser_download_url"]
            .as_str()
            .ok_or_else(|| anyhow::anyhow!("Missing download URL in firmware asset"))?
            .to_string();
        
        let size_bytes = firmware_asset["size"]
            .as_u64()
            .unwrap_or(0);
        
        // Try to extract SHA256 hash from release notes or find a checksum file
        let sha256_hash = self.extract_sha256_from_release(data, &assets);
        
        Ok(FirmwareRelease {
            version,
            download_url,
            changelog,
            published_at,
            size_bytes,
            sha256_hash,
        })
    }

    /// Extract SHA256 hash from release notes or checksum files
    fn extract_sha256_from_release(&self, release_data: &Value, assets: &[Value]) -> Option<String> {
        // First, try to find a dedicated checksum file (like SHA256SUMS, checksums.txt, etc.)
        for asset in assets {
            if let Some(asset_name) = asset["name"].as_str() {
                let name_lower = asset_name.to_lowercase();
                if name_lower.contains("sha256") || 
                   name_lower.contains("checksum") || 
                   name_lower.contains("hash") ||
                   name_lower.ends_with(".sha256") {
                    debug!("Found potential checksum file: {}", asset_name);
                    // In a real implementation, we would download and parse this file
                    // For now, we'll fall back to parsing the release notes
                }
            }
        }

        // Try to extract SHA256 from release body/changelog
        if let Some(body) = release_data["body"].as_str() {
            // Look for SHA256 patterns in the release notes using simple string matching
            let body_lower = body.to_lowercase();
            let keywords = ["sha256:", "sha256 ", "sha256="];
            
            for keyword in &keywords {
                if let Some(start) = body_lower.find(keyword) {
                    let after_keyword = &body[start + keyword.len()..];
                    // Extract 64-character hex string
                    let mut hash = String::new();
                    for ch in after_keyword.chars() {
                        if ch.is_ascii_hexdigit() && hash.len() < 64 {
                            hash.push(ch.to_ascii_lowercase());
                        } else if hash.len() == 64 {
                            break;
                        } else if !ch.is_whitespace() && hash.len() > 0 {
                            break;
                        }
                    }
                    
                    if hash.len() == 64 {
                        debug!("Extracted SHA256 from release notes: {}", hash);
                        return Some(hash);
                    }
                }
            }
        }

        debug!("No SHA256 hash found in release");
        None
    }

    /// Download firmware file with progress tracking
    pub async fn download_firmware<F>(
        &self,
        release: &FirmwareRelease,
        output_path: &Path,
        progress_callback: F,
    ) -> UpdateResult<()>
    where
        F: Fn(DownloadProgress) + Send + Sync,
    {
        info!("Downloading firmware from: {}", release.download_url);
        
        let response = self.client
            .get(&release.download_url)
            .send()
            .await?;
        
        if !response.status().is_success() {
            error!("Download request failed with status: {}", response.status());
            return Err(UpdateError::Network(
                reqwest::Error::from(response.error_for_status().unwrap_err())
            ));
        }
        
        let total_size = response.content_length().unwrap_or(release.size_bytes);
        let mut file = File::create(output_path).await?;
        let mut downloaded = 0u64;
        let mut stream = response.bytes_stream();
        
        let start_time = std::time::Instant::now();
        
        while let Some(chunk_result) = futures_util::StreamExt::next(&mut stream).await {
            let chunk = chunk_result.map_err(UpdateError::Network)?;
            file.write_all(&chunk).await?;
            
            downloaded += chunk.len() as u64;
            let elapsed = start_time.elapsed().as_secs_f64();
            let speed_bps = if elapsed > 0.0 { (downloaded as f64 / elapsed) as u64 } else { 0 };
            
            let progress = DownloadProgress {
                downloaded_bytes: downloaded,
                total_bytes: total_size,
                percentage: if total_size > 0 { (downloaded as f64 / total_size as f64) * 100.0 } else { 0.0 },
                speed_bps,
            };
            
            progress_callback(progress);
        }
        
        file.flush().await?;
        
        info!("Firmware download completed: {} bytes", downloaded);
        Ok(())
    }

    /// Verify firmware file integrity (if hash is provided)
    pub async fn verify_firmware(&self, file_path: &Path, expected_hash: Option<&str>) -> UpdateResult<bool> {
        if let Some(expected) = expected_hash {
            debug!("Verifying firmware integrity with SHA256: {}", expected);
            
            // Read the file and compute its SHA256 hash
            let mut file = File::open(file_path).await?;
            let mut hasher = Sha256::new();
            let mut buffer = vec![0u8; 8192]; // 8KB buffer
            
            loop {
                let bytes_read = file.read(&mut buffer).await?;
                if bytes_read == 0 {
                    break;
                }
                hasher.update(&buffer[..bytes_read]);
            }
            
            let computed_hash = format!("{:x}", hasher.finalize());
            let expected_lowercase = expected.to_lowercase();
            
            if computed_hash == expected_lowercase {
                info!("Firmware verification successful: {}", computed_hash);
                Ok(true)
            } else {
                error!(
                    "Firmware verification failed - expected: {}, computed: {}",
                    expected_lowercase, computed_hash
                );
                Err(UpdateError::InvalidSignature)
            }
        } else {
            debug!("No hash provided, skipping verification");
            Ok(true)
        }
    }

    /// Get all available firmware versions
    pub async fn get_available_versions(&self) -> UpdateResult<Vec<FirmwareRelease>> {
        let url = format!(
            "{}/repos/{}/{}/releases",
            self.github_api_base, self.repo_owner, self.repo_name
        );
        
        debug!("Fetching all releases from: {}", url);
        
        let response = self.client
            .get(&url)
            .header("Accept", "application/vnd.github+json")
            .header("User-Agent", "JoyCore-X/1.0")
            .send()
            .await?;
        
        if !response.status().is_success() {
            return Err(UpdateError::Network(
                reqwest::Error::from(response.error_for_status().unwrap_err())
            ));
        }
        
        let releases_data: Vec<Value> = response.json().await?;
        let mut releases = Vec::new();
        
        for release_data in releases_data {
            if let Ok(release) = self.parse_github_release(&release_data) {
                releases.push(release);
            }
        }
        
        // Sort by version (newest first)
        releases.sort_by(|a, b| b.version.cmp(&a.version));
        
        info!("Found {} firmware versions", releases.len());
        Ok(releases)
    }
}

#[cfg(test)]
mod tests {
    use semver::Version; // super::* not needed

    #[test]
    fn test_version_comparison() {
        let v1 = Version::parse("1.0.0").unwrap();
        let v2 = Version::parse("1.0.1").unwrap();
        let v3 = Version::parse("2.0.0").unwrap();
        
        assert!(v2 > v1);
        assert!(v3 > v2);
        assert!(v3 > v1);
    }
}