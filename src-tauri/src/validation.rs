use crate::error::{AppError, AppResult};
use std::path::PathBuf;

/// Validate a file system path
///
/// Checks that the path:
/// - Exists
/// - Does not contain directory traversal patterns
/// - Is readable
pub fn validate_path(path: &str) -> AppResult<PathBuf> {
    let p = PathBuf::from(path);
    
    // Check path exists
    if !p.exists() {
        return Err(AppError::NotFound(format!("Path not found: {}", path)));
    }
    
    // Prevent directory traversal
    if path.contains("..") {
        return Err(AppError::Security("Invalid path: directory traversal not allowed".to_string()));
    }
    
    // Check readable
    if let Err(e) = std::fs::metadata(&p) {
        return Err(AppError::PermissionDenied(format!("Cannot access path: {}", e)));
    }
    
    Ok(p)
}

/// Validate and sanitize a playlist name
///
/// - Checks for empty name
/// - Enforces maximum length
/// - Removes invalid characters
pub fn validate_playlist_name(name: &str) -> AppResult<String> {
    if name.is_empty() {
        return Err(AppError::Validation("Playlist name cannot be empty".to_string()));
    }
    
    if name.len() > 255 {
        return Err(AppError::Validation("Playlist name too long (max 255 characters)".to_string()));
    }
    
    // Remove invalid characters (keep alphanumeric, spaces, hyphens, underscores)
    let sanitized: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-' || *c == '_')
        .collect();
    
    if sanitized.is_empty() {
        return Err(AppError::Validation("Playlist name contains only invalid characters".to_string()));
    }
    
    Ok(sanitized)
}

/// Validate track rating
///
/// Ensures rating is between 0 and 5 stars
pub fn validate_rating(rating: i32) -> AppResult<i32> {
    if !(0..=5).contains(&rating) {
        return Err(AppError::Validation(format!("Rating must be between 0 and 5, got {}", rating)));
    }
    Ok(rating)
}

/// Validate volume level
///
/// Ensures volume is between 0.0 and 1.0
pub fn validate_volume(volume: f32) -> AppResult<f32> {
    if !(0.0..=1.0).contains(&volume) {
        return Err(AppError::Validation(format!("Volume must be between 0.0 and 1.0, got {}", volume)));
    }
    Ok(volume)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validate_playlist_name_valid() {
        assert_eq!(validate_playlist_name("My Playlist").unwrap(), "My Playlist");
        assert_eq!(validate_playlist_name("Test-123").unwrap(), "Test-123");
    }

    #[test]
    fn test_validate_playlist_name_empty() {
        assert!(validate_playlist_name("").is_err());
    }

    #[test]
    fn test_validate_playlist_name_sanitize() {
        assert_eq!(validate_playlist_name("Test@#$Playlist").unwrap(), "TestPlaylist");
    }

    #[test]
    fn test_validate_rating_valid() {
        assert_eq!(validate_rating(3).unwrap(), 3);
        assert_eq!(validate_rating(0).unwrap(), 0);
        assert_eq!(validate_rating(5).unwrap(), 5);
    }

    #[test]
    fn test_validate_rating_invalid() {
        assert!(validate_rating(-1).is_err());
        assert!(validate_rating(6).is_err());
    }

    #[test]
    fn test_validate_volume_valid() {
        assert_eq!(validate_volume(0.5).unwrap(), 0.5);
        assert_eq!(validate_volume(0.0).unwrap(), 0.0);
        assert_eq!(validate_volume(1.0).unwrap(), 1.0);
    }

    #[test]
    fn test_validate_volume_invalid() {
        assert!(validate_volume(-0.1).is_err());
        assert!(validate_volume(1.1).is_err());
    }
}
