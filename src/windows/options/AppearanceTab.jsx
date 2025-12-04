import React from 'react';
import { Palette, Image, Eye, Type, Sparkles } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { SettingSlider, SettingSection, SettingCard, SettingDivider } from './SettingsComponents';

// Color scheme definitions
export const COLOR_SCHEMES = [
  { name: 'default', label: 'Classic Cyan', background: '#0f172a', backgroundSecondary: '#1e293b', color: '#06b6d4' },
  { name: 'blue', label: 'Ocean Blue', background: '#0c1929', backgroundSecondary: '#1e3a5f', color: '#3b82f6' },
  { name: 'emerald', label: 'Forest Green', background: '#022c22', backgroundSecondary: '#064e3b', color: '#10b981' },
  { name: 'rose', label: 'Sunset Rose', background: '#1c0a14', backgroundSecondary: '#4c0519', color: '#f43f5e' },
  { name: 'amber', label: 'Golden Amber', background: '#1c1509', backgroundSecondary: '#451a03', color: '#f59e0b' },
  { name: 'purple', label: 'Royal Purple', background: '#1a0a2e', backgroundSecondary: '#3b0764', color: '#a855f7' },
  { name: 'pink', label: 'Bubblegum Pink', background: '#1f0818', backgroundSecondary: '#500724', color: '#ec4899' },
  { name: 'indigo', label: 'Deep Indigo', background: '#0f0d1e', backgroundSecondary: '#1e1b4b', color: '#6366f1' },
  { name: 'teal', label: 'Ocean Teal', background: '#042f2e', backgroundSecondary: '#134e4a', color: '#14b8a6' },
  { name: 'orange', label: 'Tangerine', background: '#1c1008', backgroundSecondary: '#431407', color: '#f97316' },
  { name: 'slate', label: 'Midnight Slate', background: '#020617', backgroundSecondary: '#0f172a', color: '#64748b' },
  { name: 'red', label: 'Cherry Red', background: '#1c0808', backgroundSecondary: '#450a0a', color: '#ef4444' },
  // Gradient themes
  { name: 'sunset', label: 'Sunset Gradient', background: '#1a0a1e', backgroundSecondary: '#3d1a2e', color: '#f97316', isGradient: true, gradient: 'from-orange-500 to-pink-500' },
  { name: 'ocean', label: 'Deep Ocean', background: '#0a1628', backgroundSecondary: '#0c2439', color: '#06b6d4', isGradient: true, gradient: 'from-cyan-500 to-blue-500' },
  { name: 'forest', label: 'Enchanted Forest', background: '#0a1a0a', backgroundSecondary: '#14352a', color: '#22c55e', isGradient: true, gradient: 'from-emerald-500 to-lime-500' },
  { name: 'synthwave', label: 'Synthwave', background: '#0d0221', backgroundSecondary: '#1a0536', color: '#d946ef', isGradient: true, gradient: 'from-fuchsia-500 to-cyan-400' },
  { name: 'monochrome', label: 'Monochrome', background: '#0a0a0a', backgroundSecondary: '#171717', color: '#a3a3a3' },
];

export function AppearanceTab({
  colorScheme,
  setColorScheme,
  currentColors,
  onOpenThemeEditor,
  backgroundImage,
  setBackgroundImage,
  backgroundBlur,
  setBackgroundBlur,
  backgroundOpacity,
  setBackgroundOpacity,
  windowOpacity,
  setWindowOpacity,
  fontSize,
  setFontSize,
}) {
  const handleSelectImage = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
      });
      if (selected) {
        const assetUrl = convertFileSrc(selected);
        setBackgroundImage(assetUrl);
      }
    } catch (err) {
      console.error('Failed to select image:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Theme Selection */}
      <SettingCard title="Color Theme" icon={Palette} accent="purple">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-slate-500">Choose a color scheme for the entire interface</p>
          {onOpenThemeEditor && (
            <button
              onClick={onOpenThemeEditor}
              onMouseDown={e => e.stopPropagation()}
              className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all hover:scale-105"
            >
              <Sparkles className="w-3 h-3" />
              Create Custom
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {COLOR_SCHEMES.map((scheme) => (
            <ThemeCard
              key={scheme.name}
              scheme={scheme}
              isSelected={colorScheme === scheme.name}
              onSelect={() => setColorScheme(scheme.name)}
            />
          ))}
        </div>
      </SettingCard>

      {/* Background Image */}
      <SettingCard title="Background" icon={Image} accent="blue">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white text-sm font-medium">Custom Background Image</p>
            <p className="text-xs text-slate-500 mt-0.5">Set a custom wallpaper for the app</p>
          </div>
          <button
            onClick={handleSelectImage}
            onMouseDown={e => e.stopPropagation()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-xs font-medium transition-all hover:scale-105"
          >
            Choose Image
          </button>
        </div>

        {backgroundImage && (
          <div className="mt-4 space-y-4">
            {/* Preview */}
            <div className="relative rounded-lg overflow-hidden border border-slate-700">
              <img 
                src={backgroundImage} 
                alt="Background preview" 
                className="w-full h-24 object-cover"
                style={{ filter: `blur(${backgroundBlur}px)`, opacity: backgroundOpacity }}
              />
              <button
                onClick={() => setBackgroundImage(null)}
                onMouseDown={e => e.stopPropagation()}
                className="absolute top-2 right-2 px-2 py-1 bg-red-500/80 hover:bg-red-500 rounded text-xs font-medium transition-colors"
              >
                Remove
              </button>
            </div>

            {/* Blur slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-xs">Blur</span>
                <span className="text-cyan-400 text-xs font-medium">{backgroundBlur}px</span>
              </div>
              <input
                type="range"
                min="0"
                max="30"
                value={backgroundBlur}
                onChange={e => setBackgroundBlur(Number(e.target.value))}
                onMouseDown={e => e.stopPropagation()}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Opacity slider */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-400 text-xs">Opacity</span>
                <span className="text-cyan-400 text-xs font-medium">{Math.round(backgroundOpacity * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={backgroundOpacity}
                onChange={e => setBackgroundOpacity(Number(e.target.value))}
                onMouseDown={e => e.stopPropagation()}
                className="w-full h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>
          </div>
        )}
      </SettingCard>

      {/* Window Appearance */}
      <SettingCard title="Window Appearance" icon={Eye} accent="emerald">
        <SettingSlider
          label="Window Opacity"
          description="Transparency of all windows"
          value={windowOpacity}
          onChange={setWindowOpacity}
          min={0.5}
          max={1}
          step={0.05}
          formatValue={v => `${Math.round(v * 100)}%`}
          minLabel="50%"
          maxLabel="100%"
          accentColor="emerald"
        />
        
        <SettingSlider
          label="Font Size"
          description="Base font size for the interface"
          value={fontSize}
          onChange={setFontSize}
          min={10}
          max={20}
          step={1}
          formatValue={v => `${v}px`}
          minLabel="10px"
          maxLabel="20px"
          icon={Type}
          accentColor="emerald"
        />
      </SettingCard>
    </div>
  );
}

// Theme card component
function ThemeCard({ scheme, isSelected, onSelect }) {
  return (
    <button
      onClick={onSelect}
      onMouseDown={e => e.stopPropagation()}
      className={`relative p-2.5 rounded-xl border-2 transition-all duration-200 ${
        isSelected
          ? 'border-white shadow-lg scale-[1.02]'
          : 'border-transparent hover:border-white/20 hover:scale-[1.01]'
      }`}
      style={{ 
        background: `linear-gradient(145deg, ${scheme.background}, ${scheme.backgroundSecondary})`,
      }}
    >
      {/* Mini window preview */}
      <div 
        className="mb-2 rounded-lg overflow-hidden border"
        style={{ 
          borderColor: `${scheme.color}30`,
          background: scheme.backgroundSecondary,
        }}
      >
        {/* Mini header */}
        <div 
          className="h-2.5 flex items-center px-1.5 gap-1"
          style={{ background: `${scheme.color}15` }}
        >
          <div className="w-1 h-1 rounded-full" style={{ backgroundColor: scheme.color }} />
          <div className="flex-1 h-0.5 rounded-full" style={{ backgroundColor: `${scheme.color}40` }} />
        </div>
        {/* Mini content */}
        <div className="p-1.5 space-y-1">
          <div className="h-1 w-4/5 rounded-full" style={{ backgroundColor: `${scheme.color}50` }} />
          <div className="h-1 w-3/5 rounded-full" style={{ backgroundColor: `${scheme.color}25` }} />
        </div>
      </div>
      
      {/* Label and color dot */}
      <div className="flex items-center gap-1.5">
        <div 
          className={`w-4 h-4 rounded-full flex-shrink-0 ${scheme.isGradient ? `bg-gradient-to-r ${scheme.gradient}` : ''}`}
          style={!scheme.isGradient ? { backgroundColor: scheme.color } : {}}
        />
        <span className="text-white text-[10px] font-medium truncate">{scheme.label}</span>
      </div>
      
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-white shadow-lg" />
      )}
      
      {/* Gradient badge */}
      {scheme.isGradient && (
        <div className="absolute bottom-1.5 right-1.5">
          <span className="text-[7px] text-white/50 uppercase tracking-wider font-bold">Pro</span>
        </div>
      )}
    </button>
  );
}
