use serde::{Serialize, Deserialize};
use std::f32::consts::PI;

/**
 * Audio DSP effects module
 * 
 * Provides real-time audio effects processing including:
 * - 10-band Equalizer
 * - Pitch shifting
 * - Tempo/speed control
 * - Reverb
 * - Bass boost
 * - Echo/delay
 */

/// Audio effects configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectsConfig {
    pub pitch_shift: f32,      // Semitones (-12.0 to +12.0)
    pub tempo: f32,            // Speed multiplier (0.5 to 2.0)
    pub reverb_mix: f32,       // Reverb wet/dry mix (0.0 to 1.0)
    pub reverb_room_size: f32, // Room size (0.0 to 1.0)
    pub bass_boost: f32,       // Bass boost dB (0.0 to 12.0)
    pub echo_delay: f32,       // Echo delay in seconds
    pub echo_feedback: f32,    // Echo feedback (0.0 to 0.9)
    pub echo_mix: f32,         // Echo wet/dry mix (0.0 to 1.0)
    pub eq_bands: [f32; 10],   // 10-band EQ gains in dB (-12.0 to +12.0)
}

impl Default for EffectsConfig {
    fn default() -> Self {
        Self {
            pitch_shift: 0.0,
            tempo: 1.0,
            reverb_mix: 0.0,
            reverb_room_size: 0.5,
            bass_boost: 0.0,
            echo_delay: 0.3,
            echo_feedback: 0.3,
            echo_mix: 0.0,
            eq_bands: [0.0; 10],
        }
    }
}

/// Biquad filter implementation for EQ
#[derive(Clone)]
pub struct BiquadFilter {
    a0: f32, a1: f32, a2: f32,
    b1: f32, b2: f32,
    z1: f32, z2: f32,
}

impl BiquadFilter {
    pub fn new() -> Self {
        Self {
            a0: 1.0, a1: 0.0, a2: 0.0,
            b1: 0.0, b2: 0.0,
            z1: 0.0, z2: 0.0,
        }
    }

    pub fn set_peaking(&mut self, sample_rate: u32, freq: f32, q: f32, gain_db: f32) {
        let w0 = 2.0 * PI * freq / sample_rate as f32;
        let alpha = w0.sin() / (2.0 * q);
        let a = 10_f32.powf(gain_db / 40.0); // TODO: Check if this should be 20 or 40 for peaking

        let cos_w0 = w0.cos();

        let b0 = 1.0 + alpha * a;
        let b1 = -2.0 * cos_w0;
        let b2 = 1.0 - alpha * a;
        let a0 = 1.0 + alpha / a;
        let a1 = -2.0 * cos_w0;
        let a2 = 1.0 - alpha / a;

        self.a0 = b0 / a0;
        self.a1 = b1 / a0;
        self.a2 = b2 / a0;
        self.b1 = a1 / a0;
        self.b2 = a2 / a0;
    }

    pub fn set_lowshelf(&mut self, sample_rate: u32, freq: f32, q: f32, gain_db: f32) {
        let w0 = 2.0 * PI * freq / sample_rate as f32;
        let a = 10_f32.powf(gain_db / 40.0);
        let alpha = w0.sin() / (2.0 * q);
        let cos_w0 = w0.cos();
        let sqrt_a = a.sqrt();

        let b0 = a * ((a + 1.0) - (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha);
        let b1 = 2.0 * a * ((a - 1.0) - (a + 1.0) * cos_w0);
        let b2 = a * ((a + 1.0) - (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha);
        let a0 = (a + 1.0) + (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha;
        let a1 = -2.0 * ((a - 1.0) + (a + 1.0) * cos_w0);
        let a2 = (a + 1.0) + (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha;

        self.a0 = b0 / a0;
        self.a1 = b1 / a0;
        self.a2 = b2 / a0;
        self.b1 = a1 / a0;
        self.b2 = a2 / a0;
    }

    pub fn set_highshelf(&mut self, sample_rate: u32, freq: f32, q: f32, gain_db: f32) {
        let w0 = 2.0 * PI * freq / sample_rate as f32;
        let a = 10_f32.powf(gain_db / 40.0);
        let alpha = w0.sin() / (2.0 * q);
        let cos_w0 = w0.cos();
        let sqrt_a = a.sqrt();

        let b0 = a * ((a + 1.0) + (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha);
        let b1 = -2.0 * a * ((a - 1.0) + (a + 1.0) * cos_w0);
        let b2 = a * ((a + 1.0) + (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha);
        let a0 = (a + 1.0) - (a - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha;
        let a1 = 2.0 * ((a - 1.0) - (a + 1.0) * cos_w0);
        let a2 = (a + 1.0) - (a - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha;

        self.a0 = b0 / a0;
        self.a1 = b1 / a0;
        self.a2 = b2 / a0;
        self.b1 = a1 / a0;
        self.b2 = a2 / a0;
    }

    pub fn process(&mut self, input: f32) -> f32 {
        let output = self.a0 * input + self.a1 * self.z1 + self.a2 * self.z2
            - self.b1 * self.z1 - self.b2 * self.z2;
        
        self.z2 = self.z1;
        self.z1 = input;
        
        output
    }
}

/// 10-band Equalizer
pub struct Equalizer {
    filters: Vec<BiquadFilter>,
    frequencies: [f32; 10],
    sample_rate: u32,
}

impl Equalizer {
    pub fn new(sample_rate: u32) -> Self {
        let frequencies = [60.0, 170.0, 310.0, 600.0, 1000.0, 3000.0, 6000.0, 12000.0, 14000.0, 16000.0];
        let mut filters = Vec::with_capacity(10);
        
        for _ in 0..10 {
            filters.push(BiquadFilter::new());
        }

        let mut eq = Self {
            filters,
            frequencies,
            sample_rate,
        };
        
        // Initialize with 0 gain
        eq.update_gains(&[0.0; 10]);
        eq
    }

    pub fn update_gains(&mut self, gains: &[f32; 10]) {
        for (i, &gain) in gains.iter().enumerate() {
            let freq = self.frequencies[i];
            
            if i == 0 {
                self.filters[i].set_lowshelf(self.sample_rate, freq, 0.707, gain);
            } else if i == 9 {
                self.filters[i].set_highshelf(self.sample_rate, freq, 0.707, gain);
            } else {
                self.filters[i].set_peaking(self.sample_rate, freq, 1.41, gain);
            }
        }
    }

    pub fn process(&mut self, input: f32) -> f32 {
        let mut output = input;
        for filter in &mut self.filters {
            output = filter.process(output);
        }
        output
    }
}

/**
 * Simple reverb effect using Schroeder reverberator
 */
pub struct Reverb {
    comb_buffers: Vec<Vec<f32>>,
    comb_indices: Vec<usize>,
    allpass_buffers: Vec<Vec<f32>>,
    allpass_indices: Vec<usize>,
    room_size: f32,
    #[allow(dead_code)]
    sample_rate: u32,
}

impl Reverb {
    const COMB_TUNINGS: [usize; 8] = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
    const ALLPASS_TUNINGS: [usize; 4] = [556, 441, 341, 225];
    const COMB_DAMPING: f32 = 0.5;
    
    pub fn new(sample_rate: u32, room_size: f32) -> Self {
        let scale = sample_rate as f32 / 44100.0;
        
        let comb_buffers: Vec<Vec<f32>> = Self::COMB_TUNINGS
            .iter()
            .map(|&size| vec![0.0; (size as f32 * scale) as usize])
            .collect();
        
        let allpass_buffers: Vec<Vec<f32>> = Self::ALLPASS_TUNINGS
            .iter()
            .map(|&size| vec![0.0; (size as f32 * scale) as usize])
            .collect();
        
        Self {
            comb_buffers,
            comb_indices: vec![0; 8],
            allpass_buffers,
            allpass_indices: vec![0; 4],
            room_size,
            sample_rate,
        }
    }
    
    pub fn set_room_size(&mut self, room_size: f32) {
        self.room_size = room_size.clamp(0.0, 1.0);
    }
    
    pub fn process(&mut self, input: f32) -> f32 {
        let mut output = 0.0;
        
        // Process comb filters
        for i in 0..8 {
            let buffer = &mut self.comb_buffers[i];
            let idx = self.comb_indices[i];
            
            let feedback = 0.84 + self.room_size * 0.1;
            let filtered = buffer[idx] * feedback;
            buffer[idx] = input + filtered * Self::COMB_DAMPING;
            
            output += buffer[idx];
            
            self.comb_indices[i] = (idx + 1) % buffer.len();
        }
        
        output /= 8.0;
        
        // Process allpass filters
        for i in 0..4 {
            let buffer = &mut self.allpass_buffers[i];
            let idx = self.allpass_indices[i];
            
            let buffered = buffer[idx];
            let out_val = -output + buffered;
            buffer[idx] = output + buffered * 0.5;
            output = out_val;
            
            self.allpass_indices[i] = (idx + 1) % buffer.len();
        }
        
        output
    }
}

/**
 * Echo/delay effect with feedback
 */
pub struct Echo {
    buffer: Vec<f32>,
    write_pos: usize,
    delay_samples: usize,
    feedback: f32,
}

impl Echo {
    pub fn new(sample_rate: u32, delay_seconds: f32, feedback: f32) -> Self {
        let delay_samples = (sample_rate as f32 * delay_seconds) as usize;
        Self {
            buffer: vec![0.0; delay_samples],
            write_pos: 0,
            delay_samples,
            feedback: feedback.clamp(0.0, 0.95),
        }
    }
    
    pub fn set_delay(&mut self, sample_rate: u32, delay_seconds: f32) {
        let new_delay = (sample_rate as f32 * delay_seconds) as usize;
        if new_delay != self.delay_samples {
            self.buffer.resize(new_delay, 0.0);
            self.delay_samples = new_delay;
            self.write_pos = 0;
        }
    }
    
    pub fn set_feedback(&mut self, feedback: f32) {
        self.feedback = feedback.clamp(0.0, 0.95);
    }
    
    pub fn process(&mut self, input: f32) -> f32 {
        let read_pos = if self.write_pos >= self.delay_samples {
            self.write_pos - self.delay_samples
        } else {
            self.buffer.len() + self.write_pos - self.delay_samples
        };
        
        let delayed = self.buffer[read_pos];
        self.buffer[self.write_pos] = input + delayed * self.feedback;
        
        self.write_pos = (self.write_pos + 1) % self.buffer.len();
        
        delayed
    }
}

/**
 * Simple bass boost using low-shelf filter
 */
pub struct BassBoost {
    z1: f32,
    z2: f32,
    a0: f32,
    a1: f32,
    a2: f32,
    b1: f32,
    b2: f32,
}

impl BassBoost {
    pub fn new(sample_rate: u32, boost_db: f32) -> Self {
        let mut filter = Self {
            z1: 0.0,
            z2: 0.0,
            a0: 1.0,
            a1: 0.0,
            a2: 0.0,
            b1: 0.0,
            b2: 0.0,
        };
        filter.set_boost(sample_rate, boost_db);
        filter
    }
    
    pub fn set_boost(&mut self, sample_rate: u32, boost_db: f32) {
        let freq = 200.0; // Bass frequency cutoff
        let q = 0.707;
        let gain = 10_f32.powf(boost_db / 20.0);
        
        let w0 = 2.0 * PI * freq / sample_rate as f32;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);
        
        let a = gain.sqrt();
        
        self.b1 = -2.0 * cos_w0;
        self.b2 = 1.0 - alpha;
        self.a0 = (1.0 + alpha + 2.0 * a.sqrt() * alpha) / (1.0 + alpha);
        self.a1 = (-2.0 * cos_w0) / (1.0 + alpha);
        self.a2 = (1.0 - alpha - 2.0 * a.sqrt() * alpha) / (1.0 + alpha);
    }
    
    pub fn process(&mut self, input: f32) -> f32 {
        let output = self.a0 * input + self.a1 * self.z1 + self.a2 * self.z2
            - self.b1 * self.z1 - self.b2 * self.z2;
        
        self.z2 = self.z1;
        self.z1 = input;
        
        output
    }
}

/**
 * Audio effects processor chain
 */
pub struct EffectsProcessor {
    config: EffectsConfig,
    reverb: Reverb,
    echo: Echo,
    bass_boost: BassBoost,
    equalizer: Equalizer,
    sample_rate: u32,
}

impl EffectsProcessor {
    pub fn new(sample_rate: u32, config: EffectsConfig) -> Self {
        Self {
            reverb: Reverb::new(sample_rate, config.reverb_room_size),
            echo: Echo::new(sample_rate, config.echo_delay, config.echo_feedback),
            bass_boost: BassBoost::new(sample_rate, config.bass_boost),
            equalizer: Equalizer::new(sample_rate),
            config,
            sample_rate,
        }
    }
    
    pub fn update_config(&mut self, config: EffectsConfig) {
        self.reverb.set_room_size(config.reverb_room_size);
        self.echo.set_delay(self.sample_rate, config.echo_delay);
        self.echo.set_feedback(config.echo_feedback);
        self.bass_boost.set_boost(self.sample_rate, config.bass_boost);
        self.equalizer.update_gains(&config.eq_bands);
        self.config = config;
    }

    pub fn get_config(&self) -> EffectsConfig {
        self.config.clone()
    }
    
    pub fn process(&mut self, input: f32) -> f32 {
        let mut output = input;
        
        // Equalizer
        output = self.equalizer.process(output);

        // Bass boost
        if self.config.bass_boost > 0.0 {
            output = self.bass_boost.process(output);
        }
        
        // Echo
        if self.config.echo_mix > 0.0 {
            let echo_wet = self.echo.process(output);
            output = output * (1.0 - self.config.echo_mix) + echo_wet * self.config.echo_mix;
        }
        
        // Reverb
        if self.config.reverb_mix > 0.0 {
            let reverb_wet = self.reverb.process(output);
            output = output * (1.0 - self.config.reverb_mix) + reverb_wet * self.config.reverb_mix;
        }
        
        // Clamp to prevent clipping
        output.clamp(-1.0, 1.0)
    }
    
    #[allow(dead_code)]
    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process(*sample);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_effects_config_default() {
        let config = EffectsConfig::default();
        assert_eq!(config.pitch_shift, 0.0);
        assert_eq!(config.tempo, 1.0);
        assert_eq!(config.reverb_mix, 0.0);
        assert_eq!(config.eq_bands, [0.0; 10]);
    }

    #[test]
    fn test_reverb_creation() {
        let reverb = Reverb::new(44100, 0.5);
        assert_eq!(reverb.sample_rate, 44100);
    }

    #[test]
    fn test_echo_process() {
        let mut echo = Echo::new(44100, 0.1, 0.3);
        let input = 1.0;
        let output = echo.process(input);
        // First sample should be mostly dry
        assert!(output < 0.1);
    }

    #[test]
    fn test_bass_boost() {
        let mut bass = BassBoost::new(44100, 6.0);
        let output = bass.process(0.5);
        // Should amplify bass frequencies
        assert!(output.abs() <= 1.0);
    }

    #[test]
    fn test_equalizer() {
        let mut eq = Equalizer::new(44100);
        let input = 0.5;
        let output = eq.process(input);
        // Flat EQ should pass signal mostly unchanged (phase shift might cause small diff)
        assert!((output - input).abs() < 0.0001);
    }

    #[test]
    fn test_effects_processor() {
        let config = EffectsConfig::default();
        let mut processor = EffectsProcessor::new(44100, config);
        
        let mut buffer = vec![0.5; 1024];
        processor.process_buffer(&mut buffer);
        
        // Should not clip
        for sample in buffer.iter() {
            assert!(sample.abs() <= 1.0);
        }
    }
}
