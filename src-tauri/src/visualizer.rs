use rustfft::{FftPlanner, num_complex::Complex};
use serde::{Serialize, Deserialize};
use std::collections::VecDeque;

/**
 * Advanced audio visualizer with FFT analysis
 * 
 * Provides real-time frequency spectrum analysis and beat detection
 * for visualization purposes.
 */

/// Visualization mode
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum VisualizerMode {
    Spectrum,       // Frequency bars
    Waveform,       // Time-domain waveform
    CircularSpectrum, // Radial frequency display
    Spectrogram,    // Frequency over time (waterfall)
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
    
    /// Compute FFT and return frequency magnitudes
    pub fn get_spectrum(&mut self, num_bins: usize) -> Vec<f32> {
        if self.buffer.len() < self.fft_size {
            return vec![0.0; num_bins];
        }
        
        // Apply window function
        let mut windowed: Vec<Complex<f32>> = self.buffer
            .iter()
            .take(self.fft_size)
            .zip(self.window.iter())
            .map(|(sample, window)| Complex::new(sample * window, 0.0))
            .collect();
        
        // Perform FFT
        let fft = self.planner.plan_fft_forward(self.fft_size);
        fft.process(&mut windowed);
        
        // Calculate magnitudes (only first half due to symmetry)
        let half_size = self.fft_size / 2;
        let magnitudes: Vec<f32> = windowed
            .iter()
            .take(half_size)
            .map(|c| (c.re * c.re + c.im * c.im).sqrt())
            .collect();
        
        // Group into bins using logarithmic scale
        self.bin_spectrum(&magnitudes, num_bins)
    }
    
    /// Group frequency bins logarithmically for better visualization
    fn bin_spectrum(&self, magnitudes: &[f32], num_bins: usize) -> Vec<f32> {
        let mut bins = vec![0.0; num_bins];
        let half_size = self.fft_size / 2;
        
        for (i, bin) in bins.iter_mut().enumerate() {
            // Logarithmic mapping
            let freq_start = 20.0 * (20000.0_f32 / 20.0).powf(i as f32 / num_bins as f32);
            let freq_end = 20.0 * (20000.0_f32 / 20.0).powf((i + 1) as f32 / num_bins as f32);
            
            let bin_start = (freq_start * half_size as f32 / (self.sample_rate as f32 / 2.0)) as usize;
            let bin_end = (freq_end * half_size as f32 / (self.sample_rate as f32 / 2.0)) as usize;
            
            if bin_start < magnitudes.len() && bin_end <= magnitudes.len() {
                let sum: f32 = magnitudes[bin_start..bin_end].iter().sum();
                let count = (bin_end - bin_start) as f32;
                *bin = if count > 0.0 { sum / count } else { 0.0 };
            }
        }
        
        // Normalize
        let max = bins.iter().fold(0.0f32, |a, &b| a.max(b));
        if max > 0.0 {
            for bin in bins.iter_mut() {
                *bin /= max;
            }
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
    
    pub fn set_beat_sensitivity(&mut self, sensitivity: f32) {
        self.beat_detector.set_sensitivity(sensitivity);
    }
    
    /// Process audio samples and generate visualization data
    pub fn process(&mut self, samples: &[f32], delta_time: f32) -> VisualizerData {
        self.current_time += delta_time;
        
        // Add samples to FFT buffer
        self.fft_analyzer.add_samples(samples);
        
        // Get spectrum
        let spectrum = self.fft_analyzer.get_spectrum(self.num_bars);
        
        // Get waveform
        let waveform = self.fft_analyzer.get_waveform(256);
        
        // Detect beat
        let beat_detected = self.beat_detector.detect_beat(&spectrum, self.current_time);
        
        // Calculate peak frequency
        let peak_idx = spectrum
            .iter()
            .enumerate()
            .max_by(|(_, a), (_, b)| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(i, _)| i)
            .unwrap_or(0);
        
        let peak_frequency = 20.0 * (20000.0_f32 / 20.0).powf(peak_idx as f32 / self.num_bars as f32);
        
        // Calculate RMS level
        let rms_level = (samples.iter().map(|x| x * x).sum::<f32>() / samples.len() as f32).sqrt();
        
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
            assert!(val >= 0.0 && val <= 1.0);
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
}
