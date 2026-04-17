/**
 * MACRO Map Studio — SectionPanel & Shared UI Primitives
 * Matches sibling app (3D Miniature Map Studio) design system exactly:
 * - Section header: 11px DM Sans uppercase, 10px 14px padding, chevron right/down
 * - Content area: 14px horizontal padding, 10px vertical, 8px gap between rows
 * - Labels: 12px DM Sans, color #5a5550
 * - Values: 12px DM Mono, right-aligned
 * - Sliders: 2px track, 14px thumb, full-width
 * - Toggles: 36x20px pill
 */

import { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';

interface SectionPanelProps {
  sectionKey: string;
  title: string;
  children: ReactNode;
  noPadding?: boolean;
}

export function SectionPanel({ sectionKey, title, children, noPadding }: SectionPanelProps) {
  const { sections, toggleSection } = useMapStore();
  const isOpen = sections[sectionKey] ?? false;

  return (
    <div style={{ borderBottom: '1px solid var(--glass-border)' }}>
      <button
        className="section-header w-full"
        onClick={() => toggleSection(sectionKey)}
      >
        <span className="section-label">{title}</span>
        {isOpen
          ? <ChevronDown size={13} color="var(--section-label-color)" />
          : <ChevronRight size={13} color="var(--section-label-color)" />
        }
      </button>
      {isOpen && (
        <div style={noPadding ? {} : {
          padding: '8px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '7px',
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────
export function PanelDivider() {
  return (
    <div style={{
      height: '1px',
      background: 'var(--glass-border)',
      margin: '2px 0',
    }} />
  );
}

// ── Row with label + right content ────────────────────────────────────────
export function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
      <span style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: '12px',
        color: 'var(--section-label-color)',
        fontWeight: 400,
        lineHeight: 1.2,
        flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {children}
      </div>
    </div>
  );
}

// ── Toggle Switch ──────────────────────────────────────────────────────────
interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      {label && (
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px',
          color: 'var(--section-label-color)',
          fontWeight: 400,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
      )}
      <label className="toggle-switch" style={{ marginLeft: label ? 'auto' : 0 }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-slider" />
      </label>
    </div>
  );
}

// ── Slider with label + value (matches sibling: label left, value right, track below) ──
interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  displayValue?: string;
}

export function SliderControl({ label, value, min, max, step = 0.01, onChange, displayValue }: SliderProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px',
          color: 'var(--section-label-color)',
          fontWeight: 400,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
        <span className="value-readout">
          {displayValue ?? value.toFixed(1)}
        </span>
      </div>
      <input
        type="range"
        className="custom-slider"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

// ── Color Swatch with picker ───────────────────────────────────────────────
interface ColorPickerProps {
  color: string;
  onChange: (c: string) => void;
  label?: string;
}

export function ColorPicker({ color, onChange, label }: ColorPickerProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: label ? 'space-between' : 'flex-end', width: label ? '100%' : 'auto', gap: '8px' }}>
      {label && (
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px',
          color: 'var(--section-label-color)',
          fontWeight: 400,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {label}
        </span>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '11px',
          color: 'var(--section-label-color)',
          letterSpacing: '0.04em',
        }}>
          {color.toUpperCase()}
        </span>
        <label className="color-swatch" style={{ background: color, width: '18px', height: '18px' }}>
          <input
            type="color"
            value={color}
            onChange={(e) => onChange(e.target.value)}
            style={{ opacity: 0, position: 'absolute', width: 0, height: 0 }}
          />
        </label>
      </div>
    </div>
  );
}
