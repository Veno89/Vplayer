use rustfft::{FftPlanner, num_complex::Complex};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

const MIN_SPECTRUM_FREQUENCY_HZ: f32 = 20.0;
const MAX_SPECTRUM_FREQUENCY_HZ: f32 = 20_000.0;
const SPECTRUM_FLOOR_DB: f32 = -72.0;

/**
 * Advanced audio visualizer with FFT analysis
 *
 * Provides real-time frequency spectrum analysis and beat detection
 * for visualization purposes.
 */
/// Visualization mode
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum VisualizerMode {
    Spectrum,         // Frequency bars
    Waveform,         // Time-domain waveform
    CircularSpectrum, // Radial frequency display
    Spectrogram,      // Frequency over time (waterfall)
}

/// FFT analyzer for frequency spectrum
pub struct FftAnalyzer {
    buffer: VecDeque<f32>,
    window: Vec<f32>,
    fft_size: usize,
    sample_rate: u32,
    planner: FftPlanner<f32>,
}

impl FftAnalyzer {
    pub fn new(fft_size: usize, sample_rate: u32) -> Self {
        // Create Hann window for smoother FFT
        let window: Vec<f32> = (0..fft_size)
            .map(|i| {
                let phase = 2.0 * std::f32::consts::PI * i as f32 / (fft_size - 1) as f32;
                0.5 * (1.0 - phase.cos())
            })
            .collect();

        Self {
            buffer: VecDeque::with_capacity(fft_size * 2),
            window,
            fft_size,
            sample_rate,
            planner: FftPlanner::new(),
        }
    }

    /// Add audio samples to the buffer
    pub fn add_samples(&mut self, samples: &[f32]) {
        for &sample in samples {
            self.buffer.push_back(sample);
            if self.buffer.len() > self.fft_size * 2 {
                self.buffer.pop_front();
            }
        }
    }

    fn set_sample_rate(&mut self, sample_rate: u32) {
        let sample_rate = sample_rate.max(1);
        if self.sample_rate != sample_rate {
            self.sample_rate = sample_rate;
            self.buffer.clear();
        }
    }

    /// Compute FFT and return frequency magnitudes
    pub fn get_spectrum(&mut self, num_bins: usize) -> Vec<f32> {
        if num_bins == 0 || self.buffer.len() < self.fft_size {
            return vec![0.0; num_bins];
        }

        // Analyze the newest complete window. The buffer keeps two FFT windows,
        // so taking from the front makes the display lag behind current playback.
        let recent_start = self.buffer.len() - self.fft_size;
        let mut windowed: Vec<Complex<f32>> = self
            .buffer
            .iter()
            .skip(recent_start)
            .take(self.fft_size)
            .zip(self.window.iter())
            .map(|(sample, window)| Complex::new(sample * window, 0.0))
            .collect();

        // Perform FFT
        let fft = self.planner.plan_fft_forward(self.fft_size);
        fft.process(&mut windowed);

        // Calculate magnitudes (only first half due to symmetry)
        let half_size = self.fft_size / 2;
        // Compensate for the Hann window's coherent gain so the spectrum keeps
        // meaningful amplitude instead of being normalized to a full-height bar
        // on every frame.
        let magnitude_scale = 2.0 / self.window.iter().sum::<f32>();
        let magnitudes: Vec<f32> = windowed
            .iter()
            .take(half_size)
            .map(|c| (c.re * c.re + c.im * c.im).sqrt() * magnitude_scale)
            .collect();

        // Group into bins using logarithmic scale
        self.bin_spectrum(&magnitudes, num_bins)
    }

    /// Group frequency bins logarithmically for better visualization
    fn bin_spectrum(&self, magnitudes: &[f32], num_bins: usize) -> Vec<f32> {
        let mut bins = vec![0.0; num_bins];
        if num_bins == 0 || magnitudes.len() < 2 {
            return bins;
        }

        let nyquist = self.sample_rate as f32 / 2.0;
        let max_frequency = MAX_SPECTRUM_FREQUENCY_HZ.min(nyquist);
        if max_frequency <= MIN_SPECTRUM_FREQUENCY_HZ {
            return bins;
        }

        let fft_bin_width = self.sample_rate as f32 / self.fft_size as f32;
        let frequency_ratio = max_frequency / MIN_SPECTRUM_FREQUENCY_HZ;

        for (i, bin) in bins.iter_mut().enumerate() {
            let freq_start =
                MIN_SPECTRUM_FREQUENCY_HZ * frequency_ratio.powf(i as f32 / num_bins as f32);
            let freq_end =
                MIN_SPECTRUM_FREQUENCY_HZ * frequency_ratio.powf((i + 1) as f32 / num_bins as f32);

            // A 2048-point FFT at 44.1 kHz resolves about 21.5 Hz at a time.
            // Several low logarithmic display bands are narrower than that.
            // Interpolate those bands at their geometric center rather than
            // producing empty or long runs of identical bars. Wider bands retain
            // their strongest resolved coefficient so narrow musical peaks remain
            // visible instead of being averaged away.
            let start_position = freq_start / fft_bin_width;
            let end_position = freq_end / fft_bin_width;
            let peak = if end_position - start_position < 1.0 {
                let center_position = (freq_start * freq_end).sqrt() / fft_bin_width;
                interpolated_non_dc_magnitude(magnitudes, center_position)
            } else {
                let bin_start = (start_position.floor() as usize).clamp(1, magnitudes.len() - 1);
                let bin_end = (end_position.ceil() as usize).clamp(bin_start + 1, magnitudes.len());
                magnitudes[bin_start..bin_end]
                    .iter()
                    .copied()
                    .fold(0.0_f32, f32::max)
            };

            *bin = amplitude_to_spectrum_level(peak);
        }

        bins
    }

    /// Get waveform samples (time domain)
    pub fn get_waveform(&self, num_samples: usize) -> Vec<f32> {
        let step = if self.buffer.len() > num_samples {
            self.buffer.len() / num_samples
        } else {
            1
        };

        self.buffer
            .iter()
            .step_by(step)
            .take(num_samples)
            .copied()
            .collect()
    }
}

fn interpolated_non_dc_magnitude(magnitudes: &[f32], position: f32) -> f32 {
    let position = position.clamp(1.0, (magnitudes.len() - 1) as f32);
    let lower = position.floor() as usize;
    let upper = (lower + 1).min(magnitudes.len() - 1);
    let fraction = position - lower as f32;
    magnitudes[lower] + (magnitudes[upper] - magnitudes[lower]) * fraction
}

fn amplitude_to_spectrum_level(amplitude: f32) -> f32 {
    if !amplitude.is_finite() || amplitude <= 0.0 {
        return 0.0;
    }

    let decibels = 20.0 * amplitude.log10();
    ((decibels - SPECTRUM_FLOOR_DB) / -SPECTRUM_FLOOR_DB).clamp(0.0, 1.0)
}

/// Beat detector using energy envelope
pub struct BeatDetector {
    energy_history: VecDeque<f32>,
    history_size: usize,
    threshold_multiplier: f32,
    last_beat_time: f32,
    min_beat_interval: f32,
}

impl BeatDetector {
    pub fn new(_sample_rate: u32) -> Self {
        Self {
            energy_history: VecDeque::with_capacity(43),
            history_size: 43, // ~1 second at typical update rate
            threshold_multiplier: 1.5,
            last_beat_time: 0.0,
            min_beat_interval: 0.3, // Minimum 300ms between beats
        }
    }

    /// Detect if current frame contains a beat
    pub fn detect_beat(&mut self, spectrum: &[f32], current_time: f32) -> bool {
        // Calculate energy of low-mid frequencies (bass/kick)
        let bass_energy: f32 = spectrum.iter().take(8).map(|x| x * x).sum();

        self.energy_history.push_back(bass_energy);
        if self.energy_history.len() > self.history_size {
            self.energy_history.pop_front();
        }

        // Not enough history yet
        if self.energy_history.len() < self.history_size {
            return false;
        }

        // Calculate average energy
        let avg_energy: f32 = self.energy_history.iter().sum::<f32>() / self.history_size as f32;

        // Detect beat if current energy exceeds threshold
        let is_beat = bass_energy > avg_energy * self.threshold_multiplier
            && (current_time - self.last_beat_time) > self.min_beat_interval;

        if is_beat {
            self.last_beat_time = current_time;
        }

        is_beat
    }

    pub fn set_sensitivity(&mut self, sensitivity: f32) {
        // sensitivity 0.0-1.0, lower = more sensitive
        self.threshold_multiplier = 1.2 + (1.0 - sensitivity) * 0.8;
    }
}

/// Visualizer data for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VisualizerData {
    pub spectrum: Vec<f32>,
    pub waveform: Vec<f32>,
    pub beat_detected: bool,
    pub peak_frequency: f32,
    pub rms_level: f32,
}

/// Main visualizer processor
pub struct Visualizer {
    fft_analyzer: FftAnalyzer,
    beat_detector: BeatDetector,
    mode: VisualizerMode,
    num_bars: usize,
    current_time: f32,
}

impl Visualizer {
    pub fn new(sample_rate: u32, num_bars: usize) -> Self {
        Self {
            fft_analyzer: FftAnalyzer::new(2048, sample_rate),
            beat_detector: BeatDetector::new(sample_rate),
            mode: VisualizerMode::Spectrum,
            num_bars,
            current_time: 0.0,
        }
    }

    pub fn set_mode(&mut self, mode: VisualizerMode) {
        self.mode = mode;
    }

    pub fn set_sample_rate(&mut self, sample_rate: u32) {
        self.fft_analyzer.set_sample_rate(sample_rate);
    }

    pub fn set_beat_sensitivity(&mut self, sensitivity: f32) {
        self.beat_detector.set_sensitivity(sensitivity);
    }

    /// Process audio samples and generate visualization data
    pub fn process(&mut self, samples: &[f32], delta_time: f32) -> VisualizerData {
        self.current_time += delta_time;

        // Add samples to FFT buffer
        self.fft_analyzer.add_samples(samples);

        // Waveform mode is time-domain only. Spectrum modes avoid allocating
        // waveform data that their renderers never consume.
        let needs_spectrum = self.mode != VisualizerMode::Waveform;
        let spectrum = if needs_spectrum {
            self.fft_analyzer.get_spectrum(self.num_bars)
        } else {
            Vec::new()
        };
        let waveform = if self.mode == VisualizerMode::Waveform {
            self.fft_analyzer.get_waveform(256)
        } else {
            Vec::new()
        };

        let beat_detected =
            needs_spectrum && self.beat_detector.detect_beat(&spectrum, self.current_time);

        let peak_frequency = if needs_spectrum {
            let peak_idx = spectrum
                .iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
                .map(|(i, _)| i)
                .unwrap_or(0);
            20.0 * (20000.0_f32 / 20.0).powf(peak_idx as f32 / self.num_bars as f32)
        } else {
            0.0
        };

        // Calculate RMS level
        let rms_level = if samples.is_empty() {
            0.0
        } else {
            (samples.iter().map(|x| x * x).sum::<f32>() / samples.len() as f32).sqrt()
        };

        VisualizerData {
            spectrum,
            waveform,
            beat_detected,
            peak_frequency,
            rms_level,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_fft_analyzer_creation() {
        let analyzer = FftAnalyzer::new(2048, 44100);
        assert_eq!(analyzer.fft_size, 2048);
        assert_eq!(analyzer.sample_rate, 44100);
    }

    #[test]
    fn test_spectrum_generation() {
        let mut analyzer = FftAnalyzer::new(2048, 44100);

        // Add some test samples
        let samples: Vec<f32> = (0..2048).map(|i| (i as f32 * 0.01).sin()).collect();
        analyzer.add_samples(&samples);

        let spectrum = analyzer.get_spectrum(32);
        assert_eq!(spectrum.len(), 32);

        // All values should be normalized 0.0-1.0
        for &val in spectrum.iter() {
            assert!((0.0..=1.0).contains(&val));
        }
    }

    #[test]
    fn logarithmic_bands_never_become_empty_between_fft_frequencies() {
        let analyzer = FftAnalyzer::new(2048, 44100);
        let magnitudes = vec![0.25; 1024];

        let spectrum = analyzer.bin_spectrum(&magnitudes, 64);

        assert_eq!(spectrum.len(), 64);
        assert!(
            spectrum.iter().all(|value| *value > 0.0),
            "every display band should sample at least one FFT coefficient: {spectrum:?}"
        );
    }

    #[test]
    fn sub_resolution_bands_interpolate_instead_of_repeating_one_coefficient() {
        let analyzer = FftAnalyzer::new(2048, 44100);
        let magnitudes: Vec<f32> = (0..1024).map(|index| index as f32 / 1024.0).collect();

        let spectrum = analyzer.bin_spectrum(&magnitudes, 64);
        let distinct_low_bands = spectrum
            .iter()
            .take(8)
            .map(|value| value.to_bits())
            .collect::<std::collections::HashSet<_>>()
            .len();

        assert!(
            distinct_low_bands >= 6,
            "sub-resolution bands should form a smooth low-frequency ramp: {spectrum:?}"
        );
    }

    #[test]
    fn spectrum_uses_the_newest_complete_fft_window() {
        let fft_size = 128;
        let mut analyzer = FftAnalyzer::new(fft_size, 4096);
        let older_tone: Vec<f32> = (0..fft_size)
            .map(|index| (2.0 * std::f32::consts::PI * 8.0 * index as f32 / fft_size as f32).sin())
            .collect();
        analyzer.add_samples(&older_tone);
        analyzer.add_samples(&vec![0.0; fft_size]);

        let spectrum = analyzer.get_spectrum(16);

        assert!(
            spectrum.iter().all(|value| *value == 0.0),
            "old audio must not leak into the newest FFT window: {spectrum:?}"
        );
    }

    #[test]
    fn spectrum_preserves_input_level_changes() {
        fn peak_for_amplitude(amplitude: f32) -> f32 {
            let fft_size = 2048;
            let mut analyzer = FftAnalyzer::new(fft_size, 44100);
            let tone: Vec<f32> = (0..fft_size)
                .map(|index| {
                    amplitude
                        * (2.0 * std::f32::consts::PI * 32.0 * index as f32 / fft_size as f32).sin()
                })
                .collect();
            analyzer.add_samples(&tone);
            analyzer
                .get_spectrum(64)
                .into_iter()
                .fold(0.0_f32, f32::max)
        }

        let quiet = peak_for_amplitude(0.1);
        let loud = peak_for_amplitude(1.0);

        assert!(
            loud > quiet + 0.2,
            "a louder frame should remain visibly louder: quiet={quiet}, loud={loud}"
        );
    }

    #[test]
    fn spectrum_tracks_the_frequency_axis_at_different_sample_rates() {
        fn peak_band(sample_rate: u32, frequency: f32) -> usize {
            let fft_size = 2048;
            let mut analyzer = FftAnalyzer::new(fft_size, 44_100);
            analyzer.set_sample_rate(sample_rate);
            let tone: Vec<f32> = (0..fft_size)
                .map(|index| {
                    (2.0 * std::f32::consts::PI * frequency * index as f32 / sample_rate as f32)
                        .sin()
                })
                .collect();
            analyzer.add_samples(&tone);
            analyzer
                .get_spectrum(64)
                .iter()
                .enumerate()
                .max_by(|(_, left), (_, right)| left.total_cmp(right))
                .map(|(index, _)| index)
                .expect("spectrum has bins")
        }

        let frequency = 750.0;
        let expected = ((frequency / MIN_SPECTRUM_FREQUENCY_HZ).ln()
            / (MAX_SPECTRUM_FREQUENCY_HZ / MIN_SPECTRUM_FREQUENCY_HZ).ln()
            * 64.0)
            .floor() as isize;

        for sample_rate in [44_100, 48_000] {
            let actual = peak_band(sample_rate, frequency) as isize;
            assert!(
                (actual - expected).abs() <= 2,
                "{frequency} Hz at {sample_rate} Hz mapped to band {actual}, expected near {expected}"
            );
        }
    }

    #[test]
    fn test_waveform() {
        let mut analyzer = FftAnalyzer::new(2048, 44100);
        let samples: Vec<f32> = vec![0.5; 1024];
        analyzer.add_samples(&samples);

        let waveform = analyzer.get_waveform(128);
        assert_eq!(waveform.len(), 128);
    }

    #[test]
    fn test_beat_detector() {
        let mut detector = BeatDetector::new(44100);
        let spectrum = vec![0.5; 32];

        // First call shouldn't detect beat (no history)
        let beat = detector.detect_beat(&spectrum, 0.0);
        assert!(!beat);
    }

    #[test]
    fn test_visualizer() {
        let mut vis = Visualizer::new(44100, 32);
        let samples: Vec<f32> = (0..512).map(|i| (i as f32 * 0.01).sin()).collect();

        let data = vis.process(&samples, 0.01);

        assert_eq!(data.spectrum.len(), 32);
        assert!(data.rms_level >= 0.0);
        assert!(data.peak_frequency > 0.0);
    }

    #[test]
    fn test_visualizer_mode_only_computes_required_representation() {
        let samples: Vec<f32> = (0..2048).map(|i| (i as f32 * 0.01).sin()).collect();
        let mut vis = Visualizer::new(44100, 32);

        vis.set_mode(VisualizerMode::Waveform);
        let waveform = vis.process(&samples, 0.05);
        assert!(waveform.spectrum.is_empty());
        assert_eq!(waveform.waveform.len(), 256);
        assert!(!waveform.beat_detected);
        assert_eq!(waveform.peak_frequency, 0.0);

        vis.set_mode(VisualizerMode::Spectrum);
        let spectrum = vis.process(&samples, 0.05);
        assert_eq!(spectrum.spectrum.len(), 32);
        assert!(spectrum.waveform.is_empty());
    }
}
