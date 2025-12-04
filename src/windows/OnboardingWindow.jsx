import React, { useState } from 'react';
import { Music, FolderPlus, ArrowRight, CheckCircle, Sparkles, Volume2, Palette, Keyboard } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

/**
 * Onboarding Window - First-run experience for new users
 */
export function OnboardingWindow({ 
  onComplete, 
  onAddFolder,
  currentColors 
}) {
  const [step, setStep] = useState(0);
  const [folderAdded, setFolderAdded] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState(null);

  const steps = [
    {
      id: 'welcome',
      title: 'Welcome to VPlayer',
      description: 'A modern music player built with performance in mind',
      icon: Music,
      content: <WelcomeStep />,
    },
    {
      id: 'library',
      title: 'Add Your Music',
      description: 'Point VPlayer to your music collection',
      icon: FolderPlus,
      content: (
        <LibraryStep 
          onAddFolder={handleAddFolder} 
          folderAdded={folderAdded}
          selectedFolder={selectedFolder}
        />
      ),
    },
    {
      id: 'features',
      title: 'Key Features',
      description: 'Get to know what VPlayer can do',
      icon: Sparkles,
      content: <FeaturesStep />,
    },
    {
      id: 'shortcuts',
      title: 'Quick Tips',
      description: 'Keyboard shortcuts to boost your workflow',
      icon: Keyboard,
      content: <ShortcutsStep />,
    },
    {
      id: 'complete',
      title: "You're All Set!",
      description: 'Start enjoying your music',
      icon: CheckCircle,
      content: <CompleteStep />,
    },
  ];

  async function handleAddFolder() {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Music Folder',
      });

      if (selected) {
        setSelectedFolder(selected);
        if (onAddFolder) {
          await onAddFolder();
        }
        setFolderAdded(true);
      }
    } catch (err) {
      console.error('Failed to select folder:', err);
    }
  }

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      handleComplete();
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  const handleComplete = () => {
    // Mark onboarding as complete
    localStorage.setItem('vplayer_onboarding_complete', 'true');
    if (onComplete) {
      onComplete();
    }
  };

  const handleSkip = () => {
    localStorage.setItem('vplayer_onboarding_complete', 'true');
    if (onComplete) {
      onComplete();
    }
  };

  const currentStep = steps[step];
  const StepIcon = currentStep.icon;

  return (
    <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-50 flex items-center justify-center">
      <div className="w-full max-w-2xl mx-4">
        {/* Progress */}
        <div className="flex justify-center gap-2 mb-8">
          {steps.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setStep(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === step 
                  ? 'w-8 bg-cyan-500' 
                  : i < step 
                    ? 'bg-cyan-500/50' 
                    : 'bg-slate-700'
              }`}
            />
          ))}
        </div>

        {/* Content Card */}
        <div className="bg-slate-800/50 backdrop-blur-lg rounded-2xl border border-slate-700/50 overflow-hidden">
          {/* Header */}
          <div className="p-8 text-center border-b border-slate-700/50">
            <div className={`inline-flex p-4 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 mb-4`}>
              <StepIcon className="w-10 h-10 text-cyan-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">{currentStep.title}</h1>
            <p className="text-slate-400">{currentStep.description}</p>
          </div>

          {/* Step Content */}
          <div className="p-8">
            {currentStep.content}
          </div>

          {/* Footer */}
          <div className="px-8 pb-8 flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-slate-500 hover:text-white text-sm transition-colors"
            >
              Skip setup
            </button>
            
            <div className="flex gap-3">
              {step > 0 && (
                <button
                  onClick={handleBack}
                  className="px-6 py-2.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white rounded-xl transition-all flex items-center gap-2 font-medium"
              >
                {step === steps.length - 1 ? 'Get Started' : 'Continue'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Step Components
function WelcomeStep() {
  return (
    <div className="text-center space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <FeaturePreview 
          icon={Volume2} 
          title="High-Quality Audio" 
          description="Native Rust backend for lossless playback"
          color="cyan"
        />
        <FeaturePreview 
          icon={Palette} 
          title="Beautiful Themes" 
          description="Customize your listening experience"
          color="violet"
        />
        <FeaturePreview 
          icon={Sparkles} 
          title="Smart Playlists" 
          description="Auto-generated playlists based on your taste"
          color="pink"
        />
      </div>
    </div>
  );
}

function LibraryStep({ onAddFolder, folderAdded, selectedFolder }) {
  return (
    <div className="space-y-6">
      {folderAdded ? (
        <div className="p-6 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-emerald-300 font-medium">Folder added successfully!</p>
          {selectedFolder && (
            <p className="text-emerald-400/70 text-sm mt-1 truncate">{selectedFolder}</p>
          )}
          <p className="text-slate-500 text-sm mt-2">VPlayer is scanning your music...</p>
        </div>
      ) : (
        <button
          onClick={onAddFolder}
          className="w-full p-8 border-2 border-dashed border-slate-600 hover:border-cyan-500 rounded-xl transition-all group"
        >
          <FolderPlus className="w-12 h-12 text-slate-600 group-hover:text-cyan-400 mx-auto mb-3 transition-colors" />
          <p className="text-white font-medium">Select Music Folder</p>
          <p className="text-slate-500 text-sm mt-1">Choose a folder containing your music files</p>
        </button>
      )}

      <div className="p-4 bg-slate-700/30 rounded-xl">
        <p className="text-slate-400 text-sm">
          <strong className="text-white">Tip:</strong> VPlayer supports MP3, FLAC, WAV, OGG, M4A, and more. 
          You can add multiple folders later from the Library window.
        </p>
      </div>
    </div>
  );
}

function FeaturesStep() {
  const features = [
    { icon: Music, title: '10-Band Equalizer', description: 'Fine-tune your sound with presets or custom settings' },
    { icon: Sparkles, title: 'Smart Playlists', description: 'Auto-create playlists based on mood, genre, or play history' },
    { icon: Palette, title: 'Custom Themes', description: 'Choose from 20+ color schemes or create your own' },
    { icon: Volume2, title: 'Gapless Playback', description: 'Seamless transitions between tracks' },
  ];

  return (
    <div className="grid grid-cols-2 gap-4">
      {features.map((feature, i) => (
        <div key={i} className="p-4 bg-slate-700/30 rounded-xl">
          <feature.icon className="w-6 h-6 text-cyan-400 mb-2" />
          <h3 className="text-white font-medium mb-1">{feature.title}</h3>
          <p className="text-slate-500 text-sm">{feature.description}</p>
        </div>
      ))}
    </div>
  );
}

function ShortcutsStep() {
  const shortcuts = [
    { key: 'Space', action: 'Play / Pause' },
    { key: '← / →', action: 'Previous / Next track' },
    { key: '↑ / ↓', action: 'Volume up / down' },
    { key: 'Ctrl + L', action: 'Toggle Library' },
    { key: 'Ctrl + E', action: 'Toggle Equalizer' },
    { key: 'Ctrl + F', action: 'Focus search' },
  ];

  return (
    <div className="space-y-3">
      {shortcuts.map((shortcut, i) => (
        <div key={i} className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
          <span className="text-slate-300">{shortcut.action}</span>
          <kbd className="px-3 py-1 bg-slate-800 text-cyan-400 text-sm font-mono rounded border border-slate-600">
            {shortcut.key}
          </kbd>
        </div>
      ))}
      <p className="text-slate-500 text-sm text-center mt-4">
        Press <kbd className="px-2 py-0.5 bg-slate-800 rounded text-xs">Ctrl + ?</kbd> anytime to see all shortcuts
      </p>
    </div>
  );
}

function CompleteStep() {
  return (
    <div className="text-center space-y-6">
      <div className="inline-flex p-6 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20">
        <CheckCircle className="w-16 h-16 text-emerald-400" />
      </div>
      <div>
        <p className="text-white text-lg mb-2">Your music player is ready!</p>
        <p className="text-slate-400">
          Start exploring your library, create playlists, and enjoy your music.
        </p>
      </div>
      <div className="p-4 bg-slate-700/30 rounded-xl inline-block">
        <p className="text-slate-400 text-sm">
          Need help? Press <kbd className="px-2 py-0.5 bg-slate-800 rounded text-xs mx-1">F1</kbd> or visit our documentation
        </p>
      </div>
    </div>
  );
}

function FeaturePreview({ icon: Icon, title, description, color }) {
  const colors = {
    cyan: 'from-cyan-500/20 to-cyan-500/5 text-cyan-400',
    violet: 'from-violet-500/20 to-violet-500/5 text-violet-400',
    pink: 'from-pink-500/20 to-pink-500/5 text-pink-400',
  };

  return (
    <div className={`p-4 rounded-xl bg-gradient-to-br ${colors[color]}`}>
      <Icon className="w-8 h-8 mb-3" />
      <h3 className="text-white font-medium text-sm mb-1">{title}</h3>
      <p className="text-slate-500 text-xs">{description}</p>
    </div>
  );
}

export default OnboardingWindow;
