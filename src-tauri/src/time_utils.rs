use std::time::{SystemTime, UNIX_EPOCH};

/// Current UNIX timestamp in milliseconds.
///
/// If the system clock is before UNIX_EPOCH, returns 0 as a safe fallback.
pub fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
