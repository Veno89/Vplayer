import React from 'react';
import { Palette, Image, Eye, Type, Sparkles } from 'lucide-react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { SettingSlider, SettingSection, SettingCard, SettingDivider } from './SettingsComponents';
import { COLOR_SCHEME_LIST } from '../../utils/colorSchemes';

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
          {COLOR_SCHEME_LIST.map((scheme) => (
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
