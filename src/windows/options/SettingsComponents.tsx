import React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Prop Interfaces ─────────────────────────────────────────────────

interface SettingToggleProps {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon?: LucideIcon;
  accentColor?: string;
}

interface SettingSliderProps {
  label: string;
  description?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  formatValue?: (value: number) => string;
  minLabel?: string;
  maxLabel?: string;
  icon?: LucideIcon;
  accentColor?: string;
}

interface SelectOption {
  value: string;
  label: string;
}

interface SettingSelectProps {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  icon?: LucideIcon;
}

interface SettingSectionProps {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  description?: string;
}

interface SettingCardProps {
  title?: string;
  icon?: LucideIcon;
  children: React.ReactNode;
  accent?: string;
}

type ButtonVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

interface SettingButtonProps {
  label: string;
  description?: string;
  onClick: () => void;
  icon?: LucideIcon;
  variant?: ButtonVariant;
  loading?: boolean;
}

interface SettingInfoProps {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
}

interface SettingDividerProps {
  label?: string;
}

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'danger';

interface SettingBadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
}

/**
 * Reusable toggle switch with label and description
 */
export function SettingToggle({ label, description, checked, onChange, icon: Icon, accentColor }: SettingToggleProps) {
  const accent = accentColor || 'cyan';
  
  return (
    <label
      onMouseDown={e => e.stopPropagation()}
      className="group flex items-start gap-3 p-3 rounded-xl border border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 hover:border-slate-600 cursor-pointer transition-all"
    >
      {/* Custom Toggle Switch */}
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          onMouseDown={e => e.stopPropagation()}
          className="sr-only peer"
        />
        <div className={`w-9 h-5 bg-slate-700 rounded-full peer peer-checked:bg-${accent}-500 transition-colors`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-transform peer-checked:translate-x-4`} />
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-slate-400 group-hover:text-slate-300" />}
          <span className="text-white text-sm font-medium">{label}</span>
        </div>
        {description && (
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{description}</p>
        )}
      </div>
    </label>
  );
}

/**
 * Slider with label, value display, and optional formatting
 */
export function SettingSlider({ 
  label, 
  description,
  value, 
  onChange, 
  min, 
  max, 
  step = 1, 
  formatValue,
  minLabel,
  maxLabel,
  icon: Icon,
  accentColor = 'cyan'
}: SettingSliderProps) {
  const displayValue = formatValue ? formatValue(value) : value;
  
  return (
    <div className="p-4 rounded-xl border border-slate-700/50 bg-slate-800/20">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-slate-400" />}
          <span className="text-slate-300 text-sm font-medium">{label}</span>
        </div>
        <span className={`text-${accentColor}-400 text-sm font-semibold tabular-nums`}>
          {displayValue}
        </span>
      </div>
      
      {description && (
        <p className="text-xs text-slate-500 mb-3">{description}</p>
      )}
      
      {/* Custom styled slider */}
      <div className="relative">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          onMouseDown={e => e.stopPropagation()}
          className={`w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-${accentColor}-500`}
          style={{
            background: `linear-gradient(to right, var(--tw-gradient-stops))`,
            '--tw-gradient-from': `rgb(var(--color-${accentColor}-500))`,
            '--tw-gradient-to': 'rgb(51 65 85)',
            '--tw-gradient-stops': `var(--tw-gradient-from) ${((value - min) / (max - min)) * 100}%, var(--tw-gradient-to) ${((value - min) / (max - min)) * 100}%`
          } as React.CSSProperties}
        />
      </div>
      
      {(minLabel || maxLabel) && (
        <div className="flex justify-between text-xs text-slate-600 mt-1.5">
          <span>{minLabel}</span>
          <span>{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Styled select dropdown
 */
export function SettingSelect({ label, description, value, onChange, options, icon: Icon }: SettingSelectProps) {
  return (
    <div className="p-4 rounded-xl border border-slate-700/50 bg-slate-800/20">
      <div className="flex items-center gap-2 mb-2">
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
        <span className="text-slate-300 text-sm font-medium">{label}</span>
      </div>
      
      {description && (
        <p className="text-xs text-slate-500 mb-3">{description}</p>
      )}
      
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          onMouseDown={e => e.stopPropagation()}
          className="w-full bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm appearance-none cursor-pointer hover:border-slate-500 focus:border-cyan-500 focus:outline-none transition-colors"
        >
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}

/**
 * Section header with optional icon
 */
export function SettingSection({ title, icon: Icon, children, description }: SettingSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-700/50">
        {Icon && <Icon className="w-4 h-4 text-cyan-400" />}
        <h4 className="text-white text-sm font-semibold">{title}</h4>
      </div>
      {description && (
        <p className="text-xs text-slate-500">{description}</p>
      )}
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

/**
 * Card for grouping related settings
 */
export function SettingCard({ title, icon: Icon, children, accent = 'cyan' }: SettingCardProps) {
  return (
    <div className={`p-4 rounded-xl border border-slate-700/50 bg-gradient-to-br from-slate-800/50 to-slate-900/50`}>
      {title && (
        <div className="flex items-center gap-2 mb-4">
          {Icon && <Icon className={`w-5 h-5 text-${accent}-400`} />}
          <h4 className="text-white text-sm font-semibold">{title}</h4>
        </div>
      )}
      <div className="space-y-3">
        {children}
      </div>
    </div>
  );
}

/**
 * Action button with icon
 */
export function SettingButton({ label, description, onClick, icon: Icon, variant = 'default', loading = false }: SettingButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    default: 'bg-slate-700 hover:bg-slate-600 text-white',
    primary: 'bg-cyan-600 hover:bg-cyan-700 text-white',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
  };
  
  return (
    <button
      onClick={onClick}
      onMouseDown={e => e.stopPropagation()}
      disabled={loading}
      className={`w-full px-4 py-3 ${variants[variant]} text-sm rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]`}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      ) : Icon && (
        <Icon className="w-4 h-4" />
      )}
      <span className="font-medium">{label}</span>
    </button>
  );
}

/**
 * Info/stat display row
 */
export function SettingInfo({ label, value, icon: Icon }: SettingInfoProps) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-slate-500" />}
        <span className="text-slate-400 text-sm">{label}</span>
      </div>
      <span className="text-white text-sm font-medium">{value}</span>
    </div>
  );
}

/**
 * Divider with optional label
 */
export function SettingDivider({ label }: SettingDividerProps) {
  if (label) {
    return (
      <div className="relative py-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-700/50" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-3 text-xs text-slate-500 bg-slate-900">{label}</span>
        </div>
      </div>
    );
  }
  return <div className="border-t border-slate-700/50 my-4" />;
}

/**
 * Badge/tag component
 */
export function SettingBadge({ children, variant = 'default' }: SettingBadgeProps) {
  const variants: Record<BadgeVariant, string> = {
    default: 'bg-slate-700 text-slate-300',
    primary: 'bg-cyan-500/20 text-cyan-400',
    success: 'bg-emerald-500/20 text-emerald-400',
    warning: 'bg-amber-500/20 text-amber-400',
    danger: 'bg-red-500/20 text-red-400',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${variants[variant]}`}>
      {children}
    </span>
  );
}
