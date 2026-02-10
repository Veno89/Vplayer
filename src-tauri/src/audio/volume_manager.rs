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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_values() {
        let vm = VolumeManager::new();
        assert_eq!(vm.last_volume, 1.0);
        assert_eq!(vm.replaygain_multiplier, 1.0);
        assert_eq!(vm.balance, 0.0);
    }

    #[test]
    fn effective_volume_defaults_to_full() {
        let vm = VolumeManager::new();
        assert_eq!(vm.effective_volume(), 1.0);
    }

    #[test]
    fn set_volume_clamps_and_returns_effective() {
        let mut vm = VolumeManager::new();

        assert_eq!(vm.set_volume(0.5), 0.5);
        assert_eq!(vm.last_volume, 0.5);

        // Clamp above 1
        assert_eq!(vm.set_volume(5.0), 1.0);
        assert_eq!(vm.last_volume, 1.0);

        // Clamp below 0
        assert_eq!(vm.set_volume(-1.0), 0.0);
        assert_eq!(vm.last_volume, 0.0);
    }

    #[test]
    fn replaygain_multiplier_affects_effective_volume() {
        let mut vm = VolumeManager::new();
        vm.set_volume(0.8);

        // +6 dB ≈ 2× multiplier → effective = 0.8 * 2.0 = 1.0 (clamped)
        let eff = vm.set_replaygain(6.0, 0.0);
        assert!(eff <= 1.0);
        assert!(vm.replaygain_multiplier > 1.0);
    }

    #[test]
    fn replaygain_multiplier_is_clamped() {
        let mut vm = VolumeManager::new();

        // Extreme positive gain
        vm.set_replaygain(100.0, 0.0);
        assert!(vm.replaygain_multiplier <= 3.0);

        // Extreme negative gain
        vm.set_replaygain(-100.0, 0.0);
        assert!(vm.replaygain_multiplier >= 0.1);
    }

    #[test]
    fn clear_replaygain_resets_multiplier() {
        let mut vm = VolumeManager::new();
        vm.set_volume(0.7);
        vm.set_replaygain(3.0, 0.0);
        assert_ne!(vm.replaygain_multiplier, 1.0);

        let eff = vm.clear_replaygain();
        assert_eq!(vm.replaygain_multiplier, 1.0);
        assert_eq!(eff, 0.7);
    }

    #[test]
    fn set_balance_clamps() {
        let mut vm = VolumeManager::new();

        vm.set_balance(-0.5);
        assert_eq!(vm.balance, -0.5);

        vm.set_balance(-2.0);
        assert_eq!(vm.balance, -1.0);

        vm.set_balance(2.0);
        assert_eq!(vm.balance, 1.0);
    }

    #[test]
    fn replaygain_preamp_is_additive() {
        let mut vm = VolumeManager::new();
        vm.set_volume(1.0);

        vm.set_replaygain(3.0, 2.0);
        let mult_combined = vm.replaygain_multiplier;

        let mut vm2 = VolumeManager::new();
        vm2.set_volume(1.0);
        vm2.set_replaygain(5.0, 0.0);
        let mult_single = vm2.replaygain_multiplier;

        assert!((mult_combined - mult_single).abs() < 0.001,
            "gain+preamp should equal the same total dB");
    }
}
