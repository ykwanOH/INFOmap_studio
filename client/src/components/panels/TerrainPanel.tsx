/**
 * MACRO Map Studio — Terrain Panel
 * Exaggeration / Hillshade / Elevation Colors (with portal modal)
 * accent → midtone rename applied
 */

import { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMapStore } from '@/store/useMapStore';
import { SectionPanel, SliderControl, Toggle, ColorPicker } from '@/components/ui/SectionPanel';

// Elevation preset definitions (using midtone instead of accent)
const ELEVATION_PRESETS = [
  {
    key: 'natural' as const, label: 'Natural',
    gradientColors: ['#4a8a4a', '#a8c870', '#e8d890', '#d0a870', '#b08060'],
    hillshade: { shadow: '#c09050', highlight: '#d0d0d0', midtone: '#4a8a4a' },
  },
  {
    key: 'vivid' as const, label: 'Vivid',
    gradientColors: ['#2060c0', '#40a060', '#e0c040', '#e06020', '#c02020'],
    hillshade: { shadow: '#e06020', highlight: '#ffffff', midtone: '#2060c0' },
  },
  {
    key: 'arctic' as const, label: 'Arctic',
    gradientColors: ['#c0d8f0', '#a0c0e0', '#e0e8f0', '#f0f4f8', '#ffffff'],
    hillshade: { shadow: '#a0c0e0', highlight: '#ffffff', midtone: '#c0d8f0' },
  },
];

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
} as const;

const monoStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '10px',
} as const;

export function TerrainPanel() {
  const {
    terrainExaggeration, setTerrainExaggeration,
    hillshadeEnabled, setHillshadeEnabled,
    hillshadeSharpness, setHillshadeSharpness,
    elevationPreset, setElevationPreset,
    elevationColors, setElevationColors,
    illuminationAngle, setIlluminationAngle,
  } = useMapStore();

  const [elevationModalOpen, setElevationModalOpen] = useState(false);
  const [modalPos, setModalPos] = useState({ top: 200, right: 280 });
  const elevationBtnRef = useRef<HTMLDivElement>(null);

  const openModal = useCallback((presetKey: typeof elevationPreset) => {
    const preset = ELEVATION_PRESETS.find(p => p.key === presetKey);
    if (!preset) return;
    setElevationPreset(preset.key);
    setElevationColors(preset.hillshade);
    if (elevationBtnRef.current) {
      const rect = elevationBtnRef.current.getBoundingClientRect();
      setModalPos({
        top: Math.min(rect.top, window.innerHeight - 350),
        right: window.innerWidth - rect.left + 8,
      });
    }
    setElevationModalOpen(true);
  }, [setElevationPreset, setElevationColors]);

  const modal = elevationModalOpen && createPortal(
    <>
      {/* Backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
        onClick={() => setElevationModalOpen(false)}
      />
      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: modalPos.top,
        right: modalPos.right,
        zIndex: 9999,
        background: 'var(--glass-bg)',
        border: '1px solid var(--glass-border)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.22)',
        padding: '14px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        minWidth: 210,
      }}>
        <span style={{
          ...labelStyle, fontWeight: 600, fontSize: '11px',
          letterSpacing: '0.06em', textTransform: 'uppercase' as const,
        }}>
          Elevation Colors
        </span>

        {([ 
          { key: 'shadow'    as const, label: 'Shadow'    },
          { key: 'highlight' as const, label: 'Highlight' },
          { key: 'midtone'   as const, label: 'Midtone'   },
        ] as const).map(({ key, label }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
            <span style={{ ...labelStyle, fontSize: '11px' }}>{label}</span>
            <input
              type="color"
              value={elevationColors[key]}
              onChange={(e) => setElevationColors({ ...elevationColors, [key]: e.target.value })}
              style={{ width: 32, height: 20, border: '1px solid var(--glass-border)', cursor: 'pointer', padding: 0, background: 'none' }}
            />
          </div>
        ))}

        {/* Light Direction */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...labelStyle, fontSize: '11px' }}>Light Direction</span>
            <span style={{ ...monoStyle, fontSize: '10px', color: 'var(--section-label-color)' }}>{illuminationAngle}°</span>
          </div>
          <input
            type="range" className="custom-slider"
            min={0} max={359} step={1} value={illuminationAngle}
            onChange={(e) => setIlluminationAngle(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            {['N 0°', 'E 90°', 'S 180°', 'W 270°'].map((l) => (
              <span key={l} style={{ ...monoStyle, fontSize: '9px', opacity: 0.5 }}>{l}</span>
            ))}
          </div>
        </div>

        <button
          className="action-btn primary"
          style={{ width: '100%', justifyContent: 'center', display: 'flex' }}
          onClick={() => setElevationModalOpen(false)}
        >
          Done
        </button>
      </div>
    </>,
    document.body
  );

  return (
    <SectionPanel sectionKey="terrain" title="Terrain">
      <SliderControl
        label="Exaggeration"
        value={terrainExaggeration}
        min={1} max={5} step={0.1}
        onChange={setTerrainExaggeration}
        displayValue={`${terrainExaggeration.toFixed(1)}×`}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <Toggle checked={hillshadeEnabled} onChange={setHillshadeEnabled} label="Hillshade" />
        {hillshadeEnabled && (
          <SliderControl
            label="Shade"
            value={hillshadeSharpness}
            min={0.1} max={1.0} step={0.05}
            onChange={setHillshadeSharpness}
            displayValue={`${Math.round(hillshadeSharpness * 100)}%`}
          />
        )}
      </div>

      {/* Elevation Color Presets */}
      <div ref={elevationBtnRef} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ ...labelStyle, fontSize: '11px' }}>Elevation Colors</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {ELEVATION_PRESETS.map((preset) => (
            <button
              key={preset.key}
              title={`${preset.label} — 클릭하여 편집`}
              onClick={() => openModal(preset.key)}
              style={{
                flex: 1, height: 18,
                border: `2px solid ${elevationPreset === preset.key ? '#59787f' : 'var(--glass-border)'}`,
                background: `linear-gradient(to right, ${preset.gradientColors.join(', ')})`,
                cursor: 'pointer', transition: 'border-color 0.12s', borderRadius: 0,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {ELEVATION_PRESETS.map((p) => (
            <span key={p.key} style={{
              ...labelStyle, flex: 1, textAlign: 'center' as const, fontSize: '10px',
              color: elevationPreset === p.key ? '#59787f' : 'var(--section-label-color)',
              fontWeight: elevationPreset === p.key ? 600 : 400,
            }}>
              {p.label}
            </span>
          ))}
        </div>
      </div>

      {modal}
    </SectionPanel>
  );
}
