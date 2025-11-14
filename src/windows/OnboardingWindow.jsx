import React, { useState } from 'react';
import { Music, Folder, Sparkles, CheckCircle, ArrowRight, X } from 'lucide-react';

export function OnboardingWindow({ currentColors, onComplete, onClose }) {
  const [step, setStep] = useState(0);
  const [selectedFolder, setSelectedFolder] = useState(null);

  const steps = [
    {
      icon: Music,
      title: 'Welcome to VPlayer',
      description: 'A modern, powerful music player for your local music collection',
      content: (
        <div className="space-y-4 text-slate-300">
          <p>VPlayer offers:</p>
          <ul className="space-y-2 list-disc list-inside">
            <li>Fast, efficient library management</li>
            <li>Smart playlists and advanced search</li>
            <li>10-band equalizer with presets</li>
            <li>Gapless playback and crossfade</li>
            <li>Album art and tag editing</li>
            <li>Playlist import/export (M3U)</li>
          </ul>
        </div>
      ),
    },
    {
      icon: Folder,
      title: 'Add Your Music',
      description: 'Start by adding a folder containing your music files',
      content: (
        <div className="space-y-4">
          <p className="text-slate-300">
            VPlayer will scan your folder and automatically:
          </p>
          <ul className="space-y-2 list-disc list-inside text-slate-300">
            <li>Import all supported audio files (MP3, FLAC, OGG, WAV)</li>
            <li>Extract metadata and album art</li>
            <li>Watch for new files and changes</li>
            <li>Organize your music by artist and album</li>
          </ul>
          
          {selectedFolder ? (
            <div className="p-3 rounded-lg bg-slate-800/50 border border-cyan-500/50 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-cyan-400" />
              <span className="text-sm text-slate-300 flex-1 truncate">
                {selectedFolder}
              </span>
            </div>
          ) : (
            <button
              onClick={async () => {
                try {
                  const { invoke } = await import('@tauri-apps/api/core');
                  const { open } = await import('@tauri-apps/plugin-dialog');
                  
                  const selected = await open({
                    directory: true,
                    multiple: false,
                    title: 'Select Music Folder',
                  });
                  
                  if (selected) {
                    setSelectedFolder(selected);
                    // Start scanning
                    await invoke('scan_folder', { folderPath: selected });
                  }
                } catch (err) {
                  console.error('Failed to select folder:', err);
                }
              }}
              onMouseDown={e => e.stopPropagation()}
              className="w-full px-4 py-3 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Folder className="w-5 h-5" />
              Select Music Folder
            </button>
          )}
        </div>
      ),
    },
    {
      icon: Sparkles,
      title: 'Keyboard Shortcuts',
      description: 'Control VPlayer efficiently with keyboard shortcuts',
      content: (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="p-3 rounded-lg bg-slate-800/50">
              <div className="font-mono text-cyan-400 mb-1">Space</div>
              <div className="text-slate-400">Play/Pause</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50">
              <div className="font-mono text-cyan-400 mb-1">← →</div>
              <div className="text-slate-400">Previous/Next</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50">
              <div className="font-mono text-cyan-400 mb-1">↑ ↓</div>
              <div className="text-slate-400">Volume Up/Down</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50">
              <div className="font-mono text-cyan-400 mb-1">Ctrl+L</div>
              <div className="text-slate-400">Open Library</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50">
              <div className="font-mono text-cyan-400 mb-1">Ctrl+P</div>
              <div className="text-slate-400">Open Playlists</div>
            </div>
            <div className="p-3 rounded-lg bg-slate-800/50">
              <div className="font-mono text-cyan-400 mb-1">Ctrl+E</div>
              <div className="text-slate-400">Open Equalizer</div>
            </div>
          </div>
          
          <p className="text-sm text-slate-400 text-center">
            View all shortcuts in Help → User Manual
          </p>
        </div>
      ),
    },
    {
      icon: CheckCircle,
      title: 'You\'re All Set!',
      description: 'Start enjoying your music with VPlayer',
      content: (
        <div className="space-y-4 text-slate-300">
          <p>Explore VPlayer's features:</p>
          <ul className="space-y-2 list-disc list-inside">
            <li>Create playlists and smart playlists</li>
            <li>Rate your favorite tracks</li>
            <li>Customize the equalizer settings</li>
            <li>Edit track tags and metadata</li>
            <li>View listening statistics</li>
          </ul>
          
          <div className="p-4 rounded-lg bg-slate-800/50 border border-slate-700">
            <p className="text-sm text-slate-400">
              💡 <strong>Tip:</strong> Right-click anywhere for context menus with quick actions!
            </p>
          </div>
        </div>
      ),
    },
  ];

  const currentStep = steps[step];
  const Icon = currentStep.icon;
  const isLastStep = step === steps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      setStep(step + 1);
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div 
        className="w-full max-w-2xl rounded-xl shadow-2xl overflow-hidden"
        style={{ backgroundColor: currentColors.surface }}
      >
        {/* Header */}
        <div 
          className="p-6 border-b border-slate-700 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-lg ${currentColors.primary} bg-opacity-20 flex items-center justify-center`}>
              <Icon className={`w-6 h-6 ${currentColors.accent}`} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {currentStep.title}
              </h2>
              <p className="text-sm text-slate-400">
                {currentStep.description}
              </p>
            </div>
          </div>
          
          <button
            onClick={handleSkip}
            onMouseDown={e => e.stopPropagation()}
            className="p-2 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 min-h-[300px]">
          {currentStep.content}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-700 flex items-center justify-between">
          {/* Progress dots */}
          <div className="flex gap-2">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`w-2 h-2 rounded-full transition-colors ${
                  idx === step
                    ? 'bg-cyan-400'
                    : idx < step
                    ? 'bg-cyan-600'
                    : 'bg-slate-700'
                }`}
              />
            ))}
          </div>

          {/* Navigation buttons */}
          <div className="flex gap-3">
            {!isLastStep && (
              <button
                onClick={handleSkip}
                onMouseDown={e => e.stopPropagation()}
                className="px-4 py-2 rounded-lg text-slate-400 hover:text-white transition-colors"
              >
                Skip Tutorial
              </button>
            )}
            
            <button
              onClick={handleNext}
              onMouseDown={e => e.stopPropagation()}
              className="px-6 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 text-white font-medium transition-colors flex items-center gap-2"
            >
              {isLastStep ? 'Get Started' : 'Next'}
              {!isLastStep && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
