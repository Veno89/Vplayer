use rustfft::{Fft, FftPlanner, num_complex::Complex};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::Arc;

/// Analysis window. 4096 points resolve ~11 Hz at 44.1 kHz, enough to give
/// every bass bar its own frequency data, while still reacting within ~90 ms.
pub const FFT_SIZE: usize = 4096;

const MIN_SPECTRUM_FREQUENCY_HZ: f32 = 30.0;
const MAX_SPECTRUM_FREQUENCY_HZ: f32 = 16_000.0;
/// Dynamic range shown below the adaptive reference level.
const SPECTRUM_RANGE_DB: f32 = 54.0;
/// The loudest recent band sits this far below the top of the display.
const SPECTRUM_HEADROOM_DB: f32 = 3.0;
/// How fast the reference follows the music down after a loud passage.
const REFERENCE_RELEASE_DB_PER_SEC: f32 = 3.0;
/// The reference never drops below this, so near-silence stays near zero.
const REFERENCE_FLOOR_DB: f32 = -55.0;

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

/// Display band: a contiguous run of FFT bins with fractional edge weights.
struct Band {
    first_bin: usize,
    weights_start: usize,
    weights_len: usize,
    total_weight: f32,
    center_hz: f32,
}

/// FFT analyzer for frequency spectrum
///
/// All buffers are allocated once and reused for every frame.
pub struct FftAnalyzer {
    fft_size: usize,
    sample_rate: u32,
    window: Vec<f32>,
    fft: Arc<dyn Fft<f32>>,
    spectrum_buf: Vec<Complex<f32>>,
    fft_scratch: Vec<Complex<f32>>,
    /// Converts |X|² into the power of the corresponding sine component.
    power_scale: f32,
    bands: Vec<Band>,
    band_weights: Vec<f32>,
    /// (sample_rate, band count) the bands were built for.
    band_layout: (u32, usize),
    /// Adaptive loudness reference (dB) for the display scale.
    reference_db: f32,
}

impl FftAnalyzer {
    pub fn new(fft_size: usize, sample_rate: u32) -> Self {
        // Hann window: low leakage between neighbouring bars.
        let window: Vec<f32> = (0..fft_size)
            .map(|i| {
                let phase = 2.0 * std::f32::consts::PI * i as f32 / (fft_size - 1) as f32;
                0.5 * (1.0 - phase.cos())
            })
            .collect();
        let window_energy: f32 = window.iter().map(|w| w * w).sum();
        let fft = FftPlanner::new().plan_fft_forward(fft_size);
        let fft_scratch = vec![Complex::default(); fft.get_inplace_scratch_len()];

        Self {
            fft_size,
            sample_rate: sample_rate.max(1),
            window,
            fft,
            spectrum_buf: vec![Complex::default(); fft_size],
            fft_scratch,
            power_scale: 4.0 / (fft_size as f32 * window_energy),
            bands: Vec::new(),
            band_weights: Vec::new(),
            band_layout: (0, 0),
            reference_db: REFERENCE_FLOOR_DB,
        }
    }

    fn set_sample_rate(&mut self, sample_rate: u32) {
        self.sample_rate = sample_rate.max(1);
    }

    /// Analyze the newest `fft_size` samples into `num_bins` levels (0.0–1.0).
    ///
    /// `delta_time` is the time since the previous frame; it paces how fast
    /// the display scale relaxes after loud passages.
    pub fn get_spectrum(&mut self, samples: &[f32], num_bins: usize, delta_time: f32) -> Vec<f32> {
        if num_bins == 0 || samples.len() < self.fft_size {
            return vec![0.0; num_bins];
        }
        self.ensure_bands(num_bins);

        let recent = &samples[samples.len() - self.fft_size..];
        // Remove DC so offsets do not leak into the lowest bars.
        let mean = recent.iter().sum::<f32>() / self.fft_size as f32;
        for ((slot, sample), window) in self.spectrum_buf.iter_mut().zip(recent).zip(&self.window) {
            *slot = Complex::new((sample - mean) * window, 0.0);
        }
        self.fft
            .process_with_scratch(&mut self.spectrum_buf, &mut self.fft_scratch);

        // Mean power per bin in each band. Averaging (rather than taking the
        // loudest bin) keeps the natural fall-off of music towards the treble
        // instead of pushing every bar up.
        let mut levels_db: Vec<f32> = self
            .bands
            .iter()
            .map(|band| {
                let weights =
                    &self.band_weights[band.weights_start..band.weights_start + band.weights_len];
                let power: f32 = weights
                    .iter()
                    .enumerate()
                    .map(|(offset, weight)| {
                        weight * self.spectrum_buf[band.first_bin + offset].norm_sqr()
                    })
                    .sum();
                let mean_power = power * self.power_scale / band.total_weight.max(f32::EPSILON);
                10.0 * (mean_power + 1e-20).log10()
            })
            .collect();

        // Adaptive reference: jump up to new peaks, relax slowly. The display
        // follows the music's dynamics instead of its absolute level.
        let peak_db = levels_db.iter().copied().fold(f32::NEG_INFINITY, f32::max);
        if peak_db > self.reference_db {
            self.reference_db = peak_db;
        } else {
            self.reference_db = (self.reference_db
                - REFERENCE_RELEASE_DB_PER_SEC * delta_time.max(0.0))
            .max(REFERENCE_FLOOR_DB);
        }

        let bottom_db = self.reference_db + SPECTRUM_HEADROOM_DB - SPECTRUM_RANGE_DB;
        for level in &mut levels_db {
            *level = ((*level - bottom_db) / SPECTRUM_RANGE_DB).clamp(0.0, 1.0);
        }
        levels_db
    }

    /// Centre frequency of display band `index`, if bands are built.
    pub fn band_center_hz(&self, index: usize) -> Option<f32> {
        self.bands.get(index).map(|band| band.center_hz)
    }

    /// Build log-spaced bands that are each at least one FFT bin wide.
    ///
    /// Pure logarithmic spacing makes the bass bands narrower than the FFT's
    /// resolution; those bars then all show interpolations of the same few
    /// bins and move together as a smooth wave. Here the spacing is linear
    /// (one bin per bar) until the logarithmic step becomes wider than a bin.
    fn ensure_bands(&mut self, num_bins: usize) {
        if self.band_layout == (self.sample_rate, num_bins) {
            return;
        }
        let bin_hz = self.sample_rate as f32 / self.fft_size as f32;
        let last_bin = (self.fft_size / 2 - 1) as f32;
        let low = (MIN_SPECTRUM_FREQUENCY_HZ / bin_hz).max(0.5);
        let high = (MAX_SPECTRUM_FREQUENCY_HZ.min(self.sample_rate as f32 * 0.45) / bin_hz)
            .min(last_bin + 0.5)
            .max(low + num_bins as f32 * 0.01);
        let edges = band_edges(low, high, num_bins);

        self.bands.clear();
        self.band_weights.clear();
        for pair in edges.windows(2) {
            let (start, end) = (pair[0], pair[1]);
            let first_bin = ((start + 0.5).floor() as usize).clamp(1, last_bin as usize);
            let last = ((end + 0.5).floor() as usize).clamp(first_bin, last_bin as usize);
            let weights_start = self.band_weights.len();
            let mut total_weight = 0.0;
            for bin in first_bin..=last {
                let overlap = (end.min(bin as f32 + 0.5) - start.max(bin as f32 - 0.5)).max(0.0);
                self.band_weights.push(overlap);
                total_weight += overlap;
            }
            if total_weight <= 0.0 {
                // Degenerate band (only at absurdly low sample rates): use its bin.
                self.band_weights[weights_start] = 1.0;
                total_weight = 1.0;
            }
            self.bands.push(Band {
                first_bin,
                weights_start,
                weights_len: self.band_weights.len() - weights_start,
                total_weight,
                center_hz: (start * end).sqrt() * bin_hz,
            });
        }
        self.band_layout = (self.sample_rate, num_bins);
    }

    /// Get waveform samples (time domain)
    pub fn get_waveform(samples: &[f32], num_samples: usize) -> Vec<f32> {
        let step = if samples.len() > num_samples {
            samples.len() / num_samples
        } else {
            1
        };

        samples
            .iter()
            .step_by(step)
            .take(num_samples)
            .copied()
            .collect()
    }
}

/// Edges (in FFT-bin units) of `count` bands from `low` to `high`: each band
/// is `ratio` times wider than the last but never narrower than one bin.
fn band_edges(low: f32, high: f32, count: usize) -> Vec<f32> {
    let edges_for = |ratio: f32| {
        let mut edges = Vec::with_capacity(count + 1);
        let mut edge = low;
        edges.push(edge);
        for _ in 0..count {
            edge = (edge * ratio).max(edge + 1.0);
            edges.push(edge);
        }
        edges
    };

    if high - low <= count as f32 {
        // Too few bins for one per band: fall back to even spacing.
        let step = (high - low) / count as f32;
        return (0..=count).map(|i| low + step * i as f32).collect();
    }

    // The last edge grows monotonically with the ratio; bisect for `high`.
    let (mut lo_ratio, mut hi_ratio) = (1.0_f32, high / low);
    for _ in 0..48 {
        let mid = 0.5 * (lo_ratio + hi_ratio);
        if edges_for(mid)[count] > high {
            hi_ratio = mid;
        } else {
            lo_ratio = mid;
        }
    }
    let mut edges = edges_for(lo_ratio);
    edges[count] = high;
    edges
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
    /// Reused sample buffer for [`Visualizer::analyze_with`].
    samples: Vec<f32>,
}

impl Visualizer {
    pub fn new(sample_rate: u32, num_bars: usize) -> Self {
        Self {
            fft_analyzer: FftAnalyzer::new(FFT_SIZE, sample_rate),
            beat_detector: BeatDetector::new(sample_rate),
            mode: VisualizerMode::Spectrum,
            num_bars,
            current_time: 0.0,
            samples: Vec::with_capacity(FFT_SIZE),
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

    /// Let `fill` write the newest samples into the visualizer's reusable
    /// buffer (returning their sample rate), then analyze them.
    pub fn analyze_with(
        &mut self,
        fill: impl FnOnce(&mut Vec<f32>) -> u32,
        delta_time: f32,
    ) -> VisualizerData {
        let mut samples = std::mem::take(&mut self.samples);
        let sample_rate = fill(&mut samples);
        self.set_sample_rate(sample_rate);
        let data = self.process(&samples, delta_time);
        self.samples = samples;
        data
    }

    /// Process audio samples and generate visualization data
    pub fn process(&mut self, samples: &[f32], delta_time: f32) -> VisualizerData {
        self.current_time += delta_time;

        // Waveform mode is time-domain only. Spectrum modes avoid allocating
        // waveform data that their renderers never consume.
        let needs_spectrum = self.mode != VisualizerMode::Waveform;
        let spectrum = if needs_spectrum {
            self.fft_analyzer
                .get_spectrum(samples, self.num_bars, delta_time)
        } else {
            Vec::new()
        };
        let waveform = if self.mode == VisualizerMode::Waveform {
            FftAnalyzer::get_waveform(samples, 256)
        } else {
            Vec::new()
        };

        let beat_detected =
            needs_spectrum && self.beat_detector.detect_beat(&spectrum, self.current_time);

        let peak_frequency = if needs_spectrum {
            spectrum
                .iter()
                .enumerate()
                .max_by(|(_, a), (_, b)| a.total_cmp(b))
                .and_then(|(index, _)| self.fft_analyzer.band_center_hz(index))
                .unwrap_or(0.0)
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

    const RATE: u32 = 44_100;

    fn tone(frequency: f32, amplitude: f32, sample_rate: u32, len: usize) -> Vec<f32> {
        (0..len)
            .map(|i| {
                amplitude
                    * (2.0 * std::f32::consts::PI * frequency * i as f32 / sample_rate as f32).sin()
            })
            .collect()
    }

    fn loudest_band(spectrum: &[f32]) -> usize {
        spectrum
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.total_cmp(b))
            .map(|(index, _)| index)
            .expect("spectrum has bands")
    }

    #[test]
    fn test_fft_analyzer_creation() {
        let analyzer = FftAnalyzer::new(FFT_SIZE, RATE);
        assert_eq!(analyzer.fft_size, FFT_SIZE);
        assert_eq!(analyzer.sample_rate, RATE);
    }

    #[test]
    fn spectrum_is_normalized_and_needs_a_full_window() {
        let mut analyzer = FftAnalyzer::new(FFT_SIZE, RATE);
        assert_eq!(analyzer.get_spectrum(&[0.5; 100], 32, 0.05), vec![0.0; 32]);

        let samples = tone(440.0, 0.5, RATE, FFT_SIZE);
        let spectrum = analyzer.get_spectrum(&samples, 32, 0.05);
        assert_eq!(spectrum.len(), 32);
        assert!(spectrum.iter().all(|value| (0.0..=1.0).contains(value)));
    }

    #[test]
    fn silence_shows_nothing() {
        let mut analyzer = FftAnalyzer::new(FFT_SIZE, RATE);
        let spectrum = analyzer.get_spectrum(&vec![0.0; FFT_SIZE], 64, 0.05);
        assert!(spectrum.iter().all(|value| *value == 0.0), "{spectrum:?}");
    }

    #[test]
    fn every_band_spans_at_least_one_fft_bin() {
        let mut analyzer = FftAnalyzer::new(FFT_SIZE, RATE);
        analyzer.ensure_bands(64);
        assert_eq!(analyzer.bands.len(), 64);
        for band in &analyzer.bands {
            assert!(
                band.total_weight >= 0.99,
                "band too narrow: {}",
                band.total_weight
            );
        }
        let centers: Vec<f32> = analyzer.bands.iter().map(|band| band.center_hz).collect();
        assert!(centers.windows(2).all(|pair| pair[1] > pair[0]));
        assert!(centers[0] < 40.0 && centers[63] > 10_000.0, "{centers:?}");
    }

    #[test]
    fn a_bass_note_lights_a_few_bars_not_a_wave() {
        let mut analyzer = FftAnalyzer::new(FFT_SIZE, RATE);
        let spectrum = analyzer.get_spectrum(&tone(55.0, 0.3, RATE, FFT_SIZE), 64, 0.05);
        let lit = spectrum.iter().filter(|level| **level > 0.5).count();
        assert!((1..=5).contains(&lit), "{lit} bars lit: {spectrum:?}");
        let center = analyzer
            .band_center_hz(loudest_band(&spectrum))
            .expect("band");
        assert!((40.0..75.0).contains(&center), "peak at {center} Hz");
    }

    #[test]
    fn the_display_follows_dynamics_instead_of_sitting_high() {
        let mut analyzer = FftAnalyzer::new(FFT_SIZE, RATE);
        let loud = tone(1_000.0, 0.8, RATE, FFT_SIZE);
        let quiet = tone(1_000.0, 0.8 * 0.1, RATE, FFT_SIZE); // -20 dB
        let loud_spectrum = analyzer.get_spectrum(&loud, 64, 0.05);
        let loud_peak = loud_spectrum[loudest_band(&loud_spectrum)];
        let quiet_spectrum = analyzer.get_spectrum(&quiet, 64, 0.05);
        let quiet_peak = quiet_spectrum[loudest_band(&quiet_spectrum)];
        assert!(loud_peak > 0.9, "loud peak {loud_peak}");
        assert!(
            loud_peak - quiet_peak > 0.3,
            "a 20 dB drop must be visible: {loud_peak} -> {quiet_peak}"
        );

        // Away from the tone the bars stay low.
        let spectrum = analyzer.get_spectrum(&loud, 64, 0.05);
        let mean: f32 = spectrum.iter().sum::<f32>() / spectrum.len() as f32;
        assert!(mean < 0.35, "mean bar height {mean}: {spectrum:?}");
    }

    #[test]
    fn spectrum_tracks_the_frequency_axis_at_different_sample_rates() {
        for sample_rate in [44_100, 48_000] {
            let mut analyzer = FftAnalyzer::new(FFT_SIZE, 44_100);
            analyzer.set_sample_rate(sample_rate);
            let spectrum =
                analyzer.get_spectrum(&tone(750.0, 0.5, sample_rate, FFT_SIZE), 64, 0.05);
            let center = analyzer
                .band_center_hz(loudest_band(&spectrum))
                .expect("band");
            assert!(
                (650.0..870.0).contains(&center),
                "750 Hz at {sample_rate} Hz shown at {center} Hz"
            );
        }
    }

    #[test]
    fn spectrum_uses_the_newest_complete_window() {
        let mut analyzer = FftAnalyzer::new(FFT_SIZE, RATE);
        let mut samples = tone(2_000.0, 0.8, RATE, FFT_SIZE);
        samples.extend(vec![0.0; FFT_SIZE]);
        let spectrum = analyzer.get_spectrum(&samples, 16, 0.05);
        assert!(spectrum.iter().all(|value| *value == 0.0), "{spectrum:?}");
    }

    #[test]
    fn band_edges_reach_the_requested_range() {
        let edges = band_edges(3.0, 1500.0, 64);
        assert_eq!(edges.len(), 65);
        assert_eq!(edges[0], 3.0);
        assert!((edges[64] - 1500.0).abs() < 1e-3);
        assert!(edges.windows(2).all(|pair| pair[1] - pair[0] >= 0.999));

        let narrow = band_edges(3.0, 20.0, 64);
        assert_eq!(narrow.len(), 65);
        assert!((narrow[64] - 20.0).abs() < 1e-3);
    }

    #[test]
    fn test_waveform() {
        let samples: Vec<f32> = vec![0.5; 1024];
        let waveform = FftAnalyzer::get_waveform(&samples, 128);
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
        let samples = tone(440.0, 0.5, RATE, FFT_SIZE);

        let data = vis.process(&samples, 0.01);

        assert_eq!(data.spectrum.len(), 32);
        assert!(data.rms_level >= 0.0);
        assert!(
            (300.0..600.0).contains(&data.peak_frequency),
            "{}",
            data.peak_frequency
        );
    }

    #[test]
    fn analyze_with_reuses_the_sample_buffer() {
        let mut vis = Visualizer::new(44100, 32);
        let data = vis.analyze_with(
            |buffer| {
                buffer.clear();
                buffer.extend(tone(440.0, 0.5, 48_000, FFT_SIZE));
                48_000
            },
            0.05,
        );
        assert_eq!(data.spectrum.len(), 32);
        assert!(vis.samples.capacity() >= FFT_SIZE);
    }

    #[test]
    fn test_visualizer_mode_only_computes_required_representation() {
        let samples = tone(440.0, 0.5, RATE, FFT_SIZE);
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
