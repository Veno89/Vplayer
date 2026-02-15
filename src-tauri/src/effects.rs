use serde::{Serialize, Deserialize};
use std::f32::consts::PI;

/**
 * Audio DSP effects module
 * 
 * Provides high-quality real-time audio effects processing:
 * - 10-band Equalizer (Biquad IIR)
 * - Tempo/speed control (applied at Sink level)
 * - Reverb (Freeverb-style Schroeder-Moorer)
 * - Bass boost (Low-shelf)
 * - Echo/delay (Feedback delay)
 * - Soft Clipper (Limiter)
 */

/// Audio effects configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectsConfig {
    /// Speed multiplier (0.5 to 2.0). Applied at the `Sink` level.
    pub tempo: f32,
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
        let a = 10_f32.powf(gain_db / 40.0);

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
        let output = self.a0 * input + self.z1;
        self.z1 = self.a1 * input - self.b1 * output + self.z2;
        self.z2 = self.a2 * input - self.b2 * output;
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

/// Comb filter for Reverb (Schroeder/Freeverb style)
struct CombFilter {
    buffer: Vec<f32>,
    index: usize,
    feedback: f32,
    damp: f32,
    damp_hist: f32,
}

impl CombFilter {
    fn new(sample_rate: u32, delay_samples: usize) -> Self {
        // Provide enough buffer for max sample rates
        let capacity = delay_samples * (sample_rate as usize / 44100 + 1);
        Self {
            buffer: vec![0.0; capacity],
            index: 0,
            feedback: 0.7,
            damp: 0.2,
            damp_hist: 0.0,
        }
    }

    fn set_feedback(&mut self, val: f32) {
        self.feedback = val;
    }

    fn set_damp(&mut self, val: f32) {
        self.damp = val;
    }

    fn process(&mut self, input: f32) -> f32 {
        if self.buffer.is_empty() { return input; }
        
        let output = self.buffer[self.index];
        self.damp_hist = output * (1.0 - self.damp) + self.damp_hist * self.damp;
        
        self.buffer[self.index] = input + self.damp_hist * self.feedback;
        
        self.index += 1;
        if self.index >= self.buffer.len() {
            self.index = 0;
        }
        
        output
    }
    
    // Resize buffer if sample rate changes dramatically
    fn resize(&mut self, size: usize) {
        if size != self.buffer.len() {
            self.buffer = vec![0.0; size];
            self.index = 0;
            self.damp_hist = 0.0;
        }
    }
}

/// Allpass filter for Reverb
struct AllpassFilter {
    buffer: Vec<f32>,
    index: usize,
    feedback: f32,
}

impl AllpassFilter {
    fn new(sample_rate: u32, delay_samples: usize) -> Self {
        let capacity = delay_samples * (sample_rate as usize / 44100 + 1);
        Self {
            buffer: vec![0.0; capacity],
            index: 0,
            feedback: 0.5,
        }
    }
    
    fn process(&mut self, input: f32) -> f32 {
        if self.buffer.is_empty() { return input; }
        
        let buffered = self.buffer[self.index];
        let output = -input + buffered;
        self.buffer[self.index] = input + (buffered * self.feedback);
        
        self.index += 1;
        if self.index >= self.buffer.len() {
            self.index = 0;
        }
        
        output
    }
    
    fn resize(&mut self, size: usize) {
        if size != self.buffer.len() {
            self.buffer = vec![0.0; size];
            self.index = 0;
        }
    }
}

/// Enhanced Reverb (Freeverb implementation)
pub struct Reverb {
    combs: Vec<CombFilter>,
    allpasses: Vec<AllpassFilter>,
    room_size: f32,
    sample_rate: u32,
    // Tuning values (samples at 44.1kHz)
    comb_tunings: [usize; 8],
    allpass_tunings: [usize; 4],
}

impl Reverb {
    // Freeverb tuning constants
    const COMB_TUNING_L1: usize = 1116;
    const COMB_TUNING_R1: usize = 1116 + 23;
    const COMB_TUNING_L2: usize = 1188;
    const COMB_TUNING_R2: usize = 1188 + 23;
    const COMB_TUNING_L3: usize = 1277;
    const COMB_TUNING_R3: usize = 1277 + 23;
    const COMB_TUNING_L4: usize = 1356;
    const COMB_TUNING_R4: usize = 1356 + 23;
    
    pub fn new(sample_rate: u32, room_size: f32) -> Self {
        let mut reverb = Self {
            combs: Vec::with_capacity(8),
            allpasses: Vec::with_capacity(4),
            room_size,
            sample_rate,
            comb_tunings: [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617],
            allpass_tunings: [556, 441, 341, 225],
        };
        reverb.init_filters();
        reverb.update_params();
        reverb
    }
    
    fn init_filters(&mut self) {
        let scale = self.sample_rate as f32 / 44100.0;
        
        self.combs.clear();
        for tuning in self.comb_tunings.iter() {
            let size = (*tuning as f32 * scale) as usize;
            self.combs.push(CombFilter::new(self.sample_rate, size));
        }
        
        self.allpasses.clear();
        for tuning in self.allpass_tunings.iter() {
            let size = (*tuning as f32 * scale) as usize;
            self.allpasses.push(AllpassFilter::new(self.sample_rate, size));
        }
    }
    
    fn update_params(&mut self) {
        let feedback = 0.7 + self.room_size * 0.28; // Max ~0.98
        let damp = 0.2 * (1.0 - self.room_size);
        
        for comb in &mut self.combs {
            comb.set_feedback(feedback);
            comb.set_damp(damp);
        }
    }
    
    pub fn set_room_size(&mut self, room_size: f32) {
        self.room_size = room_size.clamp(0.0, 1.0);
        self.update_params();
    }
    
    pub fn resize(&mut self, sample_rate: u32) {
        if sample_rate != self.sample_rate {
            self.sample_rate = sample_rate;
            // Full re-init is safer than resizing
            self.init_filters();
            self.update_params();
        }
    }
    
    pub fn process(&mut self, input: f32) -> f32 {
        let mut output = 0.0;
        let gain = 0.015; // Input gain to prevent explosion
        
        for comb in &mut self.combs {
            output += comb.process(input * gain);
        }
        
        for allpass in &mut self.allpasses {
            output = allpass.process(output);
        }
        
        output
    }
}

/// Echo/delay effect with feedback
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
            buffer: vec![0.0; delay_samples.max(1)],
            write_pos: 0,
            delay_samples,
            feedback: feedback.clamp(0.0, 0.95),
        }
    }
    
    pub fn set_delay(&mut self, sample_rate: u32, delay_seconds: f32) {
        let new_delay = (sample_rate as f32 * delay_seconds) as usize;
        if new_delay != self.delay_samples && new_delay > 0 {
            // Reallocate simple buffer, crossfading omitted for brevity in upgrade
            self.buffer = vec![0.0; new_delay];
            self.delay_samples = new_delay;
            self.write_pos = 0;
        }
    }
    
    pub fn set_feedback(&mut self, feedback: f32) {
        self.feedback = feedback.clamp(0.0, 0.95);
    }
    
    pub fn process(&mut self, input: f32) -> f32 {
        if self.buffer.is_empty() { return input; }
        
        let read_pos = if self.write_pos >= self.delay_samples {
            self.write_pos - self.delay_samples
        } else {
            self.buffer.len() + self.write_pos - self.delay_samples
        };
        
        // Safety wrap
        let read_idx = read_pos % self.buffer.len();
        
        let delayed = self.buffer[read_idx];
        self.buffer[self.write_pos] = input + delayed * self.feedback;
        
        self.write_pos = (self.write_pos + 1) % self.buffer.len();
        
        delayed
    }
}

/// Bass boost using low-shelf filter (delegates to BiquadFilter)
pub struct BassBoost {
    filter: BiquadFilter,
}

impl BassBoost {
    pub fn new(sample_rate: u32, boost_db: f32) -> Self {
        let mut filter = BiquadFilter::new();
        filter.set_lowshelf(sample_rate, 200.0, 0.707, boost_db);
        Self { filter }
    }
    
    pub fn set_boost(&mut self, sample_rate: u32, boost_db: f32) {
        self.filter.set_lowshelf(sample_rate, 200.0, 0.707, boost_db);
    }
    
    pub fn process(&mut self, input: f32) -> f32 {
        self.filter.process(input)
    }
}

/// Soft Clipper / Limiter
/// Prevents harsh digital clipping by rounding off peaks
pub struct SoftClipper;

impl SoftClipper {
    pub fn process(input: f32) -> f32 {
        // Simple cubic soft clipper
        // f(x) = x - x^3/3 for -1.5 < x < 1.5
        let threshold = 1.0;
        if input > threshold {
            let x = input - threshold;
            threshold + (1.0 - (-x).exp()) * 0.5 // Soft knee
            // Alternatively, use tanh for standard saturation:
            // input.tanh()
        } else if input < -threshold {
            let x = input + threshold;
            -threshold - (1.0 - (x).exp()) * 0.5
        } else {
            input
        }
    }
    
    // Standard tanh saturation (smoother, analog-like)
    pub fn saturate(input: f32) -> f32 {
        // Boost slightly to allow saturation effect
        (input * 1.0).tanh()
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
    
    pub fn set_sample_rate(&mut self, new_sample_rate: u32) {
        if new_sample_rate != self.sample_rate {
            log::info!("Updating effects processor sample rate: {} -> {}", self.sample_rate, new_sample_rate);
            self.sample_rate = new_sample_rate;
            
            // Reinitialize/Resize effects
            self.reverb.resize(new_sample_rate);
            self.echo = Echo::new(new_sample_rate, self.config.echo_delay, self.config.echo_feedback);
            self.bass_boost = BassBoost::new(new_sample_rate, self.config.bass_boost);
            self.equalizer = Equalizer::new(new_sample_rate);
            self.equalizer.update_gains(&self.config.eq_bands);
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
        
        // 1. Equalizer
        output = self.equalizer.process(output);

        // 2. Bass boost
        if self.config.bass_boost > 0.0 {
            output = self.bass_boost.process(output);
        }
        
        // 3. Echo
        if self.config.echo_mix > 0.0 {
            let echo_wet = self.echo.process(output);
            output = output * (1.0 - self.config.echo_mix) + echo_wet * self.config.echo_mix;
        }
        
        // 4. Reverb
        if self.config.reverb_mix > 0.0 {
            let reverb_wet = self.reverb.process(output);
            output = output * (1.0 - self.config.reverb_mix) + reverb_wet * self.config.reverb_mix;
        }
        
        // 5. Soft Clipper (Safety Limiter)
        // Use tanh saturation for analog-style limiting
        SoftClipper::saturate(output)
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
        assert_eq!(config.tempo, 1.0);
        assert_eq!(config.reverb_mix, 0.0);
        assert_eq!(config.eq_bands, [0.0; 10]);
    }

    #[test]
    fn test_soft_clipper() {
        // Linear region
        assert!((SoftClipper::saturate(0.5) - 0.462).abs() < 0.01);
        
        // Limiting region
        let loud = SoftClipper::saturate(2.0); // tanh(2.0) ≈ 0.964
        assert!(loud < 1.0);
        assert!(loud > 0.9);
        
        // Extreme input
        let very_loud = SoftClipper::saturate(10.0);
        assert!(very_loud <= 1.0);
    }

    #[test]
    fn test_reverb_process() {
        let mut reverb = Reverb::new(44100, 0.5);
        let output = reverb.process(1.0);
        // Should produce some non-zero output/tail over time
        assert!(output.is_finite());
    }

    #[test]
    fn test_effects_processor_chain() {
        let config = EffectsConfig::default();
        let mut processor = EffectsProcessor::new(44100, config);
        
        let mut buffer = vec![0.5; 100];
        processor.process_buffer(&mut buffer);
        
        for sample in buffer.iter() {
            assert!(sample.abs() <= 1.0);
        }
    }
}
