//! Structured logging helpers for adding correlation context.
//!
//! Usage:
//! ```ignore
//! use crate::context_log::LogContext;
//!
//! let ctx = LogContext::new("library_scan").with("folder", "/music");
//! ctx.info("Scan started");
//! ctx.warn("Skipped unsupported file");
//! ```

use std::fmt;

/// Lightweight context carrier for structured log messages.
///
/// Collects key-value pairs that are prepended to every message,
/// making log output grep-friendly and informative for debugging
/// user-reported issues.
///
/// Under the hood this still uses the standard `log` crate macros,
/// so `tauri-plugin-log` captures everything as before.
pub struct LogContext {
    operation: &'static str,
    fields: Vec<(&'static str, String)>,
}

impl LogContext {
    /// Create a new context for a named operation.
    pub fn new(operation: &'static str) -> Self {
        Self {
            operation,
            fields: Vec::new(),
        }
    }

    /// Append a key-value field to the context.
    pub fn with(mut self, key: &'static str, value: impl fmt::Display) -> Self {
        self.fields.push((key, value.to_string()));
        self
    }

    /// Format the context prefix: `[operation key=val key2=val2]`
    fn prefix(&self) -> String {
        let mut buf = format!("[{}]", self.operation);
        for (k, v) in &self.fields {
            buf.push_str(&format!(" {}={}", k, v));
        }
        buf
    }

    pub fn info(&self, msg: &str) {
        log::info!("{} {}", self.prefix(), msg);
    }

    pub fn warn(&self, msg: &str) {
        log::warn!("{} {}", self.prefix(), msg);
    }

    pub fn error(&self, msg: &str) {
        log::error!("{} {}", self.prefix(), msg);
    }

    pub fn debug(&self, msg: &str) {
        log::debug!("{} {}", self.prefix(), msg);
    }
}
