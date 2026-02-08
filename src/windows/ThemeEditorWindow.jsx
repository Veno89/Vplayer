import React, { useState, useEffect, useMemo } from 'react';
import { Palette, Save, Plus, Trash2, Check } from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/Modal';
import { useStore } from '../store/useStore';
import { useCurrentColors } from '../hooks/useStoreHooks';
import { COLOR_SCHEMES } from '../utils/colorSchemes';
import { nativeConfirm } from '../utils/nativeDialog';

export default function ThemeEditorWindow() {
  const isOpen = useStore(s => s.themeEditorOpen);
  const setThemeEditorOpen = useStore(s => s.setThemeEditorOpen);
  const currentColors = useCurrentColors();
  const customThemes = useStore(s => s.customThemes);
  const saveCustomTheme = useStore(s => s.saveCustomTheme);
  const deleteCustomTheme = useStore(s => s.deleteCustomTheme);
  const applyCustomTheme = useStore(s => s.applyCustomTheme);
  const colorSchemes = useMemo(() => ({ ...COLOR_SCHEMES, ...customThemes }), [customThemes]);
  const onClose = () => setThemeEditorOpen(false);
  const [editingTheme, setEditingTheme] = useState(null);
  const [themeName, setThemeName] = useState('');
  const [colors, setColors] = useState({
    primary: '#3b82f6',
    accent: '#60a5fa',
    bg1: '#0f172a',
    bg2: '#1e293b',
    bg3: '#334155',
    text: '#ffffff',
    textSecondary: '#94a3b8',
    border: '#475569'
  });
  const { showSuccess, showError } = useToast();

  // Initialize with current colors when opened
  useEffect(() => {
    if (isOpen && currentColors) {
      // Parse Tailwind classes back to hex colors (simplified)
      setColors({
        primary: '#3b82f6',
        accent: '#60a5fa',
        bg1: '#0f172a',
        bg2: '#1e293b',
        bg3: '#334155',
        text: '#ffffff',
        textSecondary: '#94a3b8',
        border: '#475569'
      });
    }
  }, [isOpen, currentColors]);

  const handleColorChange = (key, value) => {
    setColors(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSaveTheme = () => {
    if (!themeName.trim()) {
      showError('Please enter a theme name');
      return;
    }

    const newTheme = {
      name: themeName,
      colors: colors,
      createdAt: Date.now()
    };

    saveCustomTheme(newTheme);
    showSuccess(`Theme "${themeName}" saved!`);
    setThemeName('');
    setEditingTheme(null);
  };

  const handleApplyTheme = (theme) => {
    setColors(theme.colors);
    applyCustomTheme(theme);
    showSuccess(`Applied theme: ${theme.name}`);
  };

  const handleDeleteTheme = async (themeName) => {
    if (await nativeConfirm(`Delete theme "${themeName}"?`)) {
      deleteCustomTheme(themeName);
      showSuccess(`Theme "${themeName}" deleted`);
    }
  };

  const handleNewTheme = () => {
    setEditingTheme('new');
    setThemeName('New Theme');
    setColors({
      primary: '#3b82f6',
      accent: '#60a5fa',
      bg1: '#0f172a',
      bg2: '#1e293b',
      bg3: '#334155',
      text: '#ffffff',
      textSecondary: '#94a3b8',
      border: '#475569'
    });
  };

  const colorLabels = {
    primary: 'Primary Color',
    accent: 'Accent Color',
    bg1: 'Background 1 (Darkest)',
    bg2: 'Background 2 (Medium)',
    bg3: 'Background 3 (Lightest)',
    text: 'Text Color',
    textSecondary: 'Secondary Text',
    border: 'Border Color'
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Theme Editor" maxWidth="max-w-2xl">
      <div className="flex flex-col space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
              <Palette className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold">Customize Your Theme</h3>
            </div>
            <button
              onClick={handleNewTheme}
              className="px-3 py-1 bg-purple-600 hover:bg-purple-700 rounded text-sm flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              New Theme
            </button>
          </div>

          {/* Theme Name Input */}
          {editingTheme && (
            <div className="bg-white/5 rounded-lg p-4 border border-white/10">
              <label className="block text-sm font-medium mb-2">Theme Name</label>
              <input
                type="text"
                value={themeName}
                onChange={(e) => setThemeName(e.target.value)}
                placeholder="Enter theme name"
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded focus:outline-none focus:border-purple-500"
              />
            </div>
          )}

          {/* Color Pickers */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h4 className="text-sm font-medium mb-4">Colors</h4>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(colorLabels).map(([key, label]) => (
                <div key={key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors[key]}
                    onChange={(e) => handleColorChange(key, e.target.value)}
                    className="w-12 h-12 rounded cursor-pointer border-2 border-white/20"
                    title={label}
                  />
                  <div className="flex-1">
                    <div className="text-xs font-medium">{label}</div>
                    <div className="text-xs text-white/50 font-mono">{colors[key]}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Preview */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h4 className="text-sm font-medium mb-3">Preview</h4>
            <div 
              className="rounded-lg p-4 border"
              style={{
                backgroundColor: colors.bg1,
                borderColor: colors.border,
                color: colors.text
              }}
            >
              <div 
                className="font-semibold mb-2"
                style={{ color: colors.primary }}
              >
                Primary Text Sample
              </div>
              <div 
                className="text-sm mb-3"
                style={{ color: colors.textSecondary }}
              >
                Secondary text appears like this in the UI
              </div>
              <button
                className="px-4 py-2 rounded text-sm font-medium"
                style={{
                  backgroundColor: colors.accent,
                  color: colors.text
                }}
              >
                Sample Button
              </button>
            </div>
          </div>

          {/* Save Button */}
          {editingTheme && (
            <button
              onClick={handleSaveTheme}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded font-medium flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              Save Theme
            </button>
          )}

          {/* Saved Themes List */}
          <div className="bg-white/5 rounded-lg p-4 border border-white/10">
            <h4 className="text-sm font-medium mb-3">Saved Themes</h4>
            {colorSchemes && Object.keys(colorSchemes).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(colorSchemes).map(([key, scheme]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between p-3 bg-white/5 rounded hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex gap-1">
                        {scheme.colors && Object.values(scheme.colors).slice(0, 5).map((color, i) => (
                          <div
                            key={i}
                            className="w-6 h-6 rounded border border-white/20"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                      <span className="font-medium">{scheme.name || key}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApplyTheme(scheme)}
                        className="p-2 hover:bg-green-600/20 rounded text-green-400"
                        title="Apply theme"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      {!['winamp', 'retro', 'modern', 'dark'].includes(key) && (
                        <button
                          onClick={() => handleDeleteTheme(key)}
                          className="p-2 hover:bg-red-600/20 rounded text-red-400"
                          title="Delete theme"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-white/50 text-sm">No saved themes yet. Create one above!</p>
            )}
          </div>
      </div>
    </Modal>
  );
}
