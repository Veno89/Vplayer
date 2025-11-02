use rodio::{Decoder, OutputStream, Sink};
use std::fs::File;
use std::io::BufReader;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub struct AudioPlayer {
    sink: Arc<Mutex<Sink>>,
    _stream: Arc<OutputStream>,
    current_path: Arc<Mutex<Option<String>>>,
}

// Manually implement Send and Sync for AudioPlayer
unsafe impl Send for AudioPlayer {}
unsafe impl Sync for AudioPlayer {}

impl AudioPlayer {
    pub fn new() -> Result<Self, String> {
        let (stream, stream_handle) = OutputStream::try_default()
            .map_err(|e| format!("Failed to create audio output: {}", e))?;
        
        let sink = Sink::try_new(&stream_handle)
            .map_err(|e| format!("Failed to create sink: {}", e))?;
        
        Ok(Self {
            sink: Arc::new(Mutex::new(sink)),
            _stream: Arc::new(stream),
            current_path: Arc::new(Mutex::new(None)),
        })
    }
    
    pub fn load(&self, path: String) -> Result<(), String> {
        let file = File::open(&path)
            .map_err(|e| format!("Failed to open file: {}", e))?;
        
        let source = Decoder::new(BufReader::new(file))
            .map_err(|e| format!("Failed to decode audio: {}", e))?;
        
        let sink = self.sink.lock().unwrap();
        sink.clear();
        sink.append(source);
        sink.pause();
        
        *self.current_path.lock().unwrap() = Some(path);
        
        Ok(())
    }
    
    pub fn play(&self) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.play();
        Ok(())
    }
    
    pub fn pause(&self) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.pause();
        Ok(())
    }
    
    pub fn stop(&self) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.stop();
        *self.current_path.lock().unwrap() = None;
        Ok(())
    }
    
    pub fn set_volume(&self, volume: f32) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        let clamped_volume = volume.max(0.0).min(1.0);
        sink.set_volume(clamped_volume);
        Ok(())
    }
    
    pub fn seek(&self, position: f64) -> Result<(), String> {
        let sink = self.sink.lock().unwrap();
        sink.try_seek(Duration::from_secs_f64(position))
            .map_err(|e| format!("Seek failed: {}", e))?;
        Ok(())
    }
    
    pub fn is_playing(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        !sink.is_paused()
    }
    
    pub fn is_finished(&self) -> bool {
        let sink = self.sink.lock().unwrap();
        sink.empty()
    }
    
    pub fn get_current_path(&self) -> Option<String> {
        self.current_path.lock().unwrap().clone()
    }
}
