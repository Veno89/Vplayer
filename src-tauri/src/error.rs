use std::fmt;
use std::error::Error as StdError;

#[derive(Debug)]
pub enum AppError {
    Audio(String),
    Database(String),
    Scanner(String),
    Io(std::io::Error),
    Decode(String),
    NotFound(String),
    InvalidState(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::Audio(msg) => write!(f, "Audio error: {}", msg),
            AppError::Database(msg) => write!(f, "Database error: {}", msg),
            AppError::Scanner(msg) => write!(f, "Scanner error: {}", msg),
            AppError::Io(err) => write!(f, "IO error: {}", err),
            AppError::Decode(msg) => write!(f, "Decode error: {}", msg),
            AppError::NotFound(msg) => write!(f, "Not found: {}", msg),
            AppError::InvalidState(msg) => write!(f, "Invalid state: {}", msg),
        }
    }
}

impl StdError for AppError {
    fn source(&self) -> Option<&(dyn StdError + 'static)> {
        match self {
            AppError::Io(err) => Some(err),
            _ => None,
        }
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err)
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

// Convert AppError to String for Tauri commands
impl From<AppError> for String {
    fn from(err: AppError) -> Self {
        err.to_string()
    }
}

pub type AppResult<T> = Result<T, AppError>;
