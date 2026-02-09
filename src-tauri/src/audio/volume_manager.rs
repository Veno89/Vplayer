//! Volume, ReplayGain, and balance management
//!
//! Pure data struct — no audio resources — inherently Send + Sync.

use log::info;

/// Volume state including ReplayGain and balance adjustments.
pub struct VolumeManager {
    /// User-set volume (0.0–1.0)
    pub last_volume: f32,
    /// ReplayGain multiplier (1.0 = no change)
    pub replaygain_multiplier: f32,
    /// Stereo balance (-1.0 = left, 0.0 = center, 1.0 = right)
    pub balance: f32,
}

impl VolumeManager {
    pub fn new() -> Self {
        Self {
            last_volume: 1.0,
            replaygain_multiplier: 1.0,
            balance: 0.0,
        }
    }

    /// Calculate the effective volume (user volume × ReplayGain), clamped to [0, 1].
    pub fn effective_volume(&self) -> f32 {
        (self.last_volume * self.replaygain_multiplier).clamp(0.0, 1.0)
    }

    /// Set user volume and return the effective volume to apply to the sink.
    pub fn set_volume(&mut self, volume: f32) -> f32 {
        self.last_volume = volume.clamp(0.0, 1.0);
        self.effective_volume()
    }

    /// Set ReplayGain in dB and return the effective volume to apply.
    pub fn set_replaygain(&mut self, gain_db: f32, preamp_db: f32) -> f32 {
        let total_gain_db = gain_db + preamp_db;
        let multiplier = 10_f32.powf(total_gain_db / 20.0);
        self.replaygain_multiplier = multiplier.clamp(0.1, 3.0);
        info!(
            "ReplayGain: {}dB + {}dB preamp = {}dB (multiplier: {:.3})",
            gain_db, preamp_db, total_gain_db, self.replaygain_multiplier
        );
        self.effective_volume()
    }

    /// Clear ReplayGain and return the effective volume to apply.
    pub fn clear_replaygain(&mut self) -> f32 {
        self.replaygain_multiplier = 1.0;
        self.effective_volume()
    }

    /// Set stereo balance.
    pub fn set_balance(&mut self, balance: f32) {
        self.balance = balance.clamp(-1.0, 1.0);
        info!("Balance set to: {:.2}", self.balance);
    }
}
