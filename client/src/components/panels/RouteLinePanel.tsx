/**
 * MACRO Map Studio — Route Line Panel
 * Direct path drawing + terrain exaggeration controls
 * Matches sibling app design system
 */

import { useMapStore } from '@/store/useMapStore';
import { SectionPanel, Toggle, SliderControl, ColorPicker } from '@/components/ui/SectionPanel';
import { Pen, Trash2 } from 'lucide-react';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
};

const ELEVATION_PRESETS = [
  { key: 'natural' as const, label: 'Natural', colors: ['#4a8a4a', '#a8c870', '#e8d890', '#d0a870', '#b08060'] },
  { key: 'vivid'   as const, label: 'Vivid',   colors: ['#2060c0', '#40a060', '#e0c040', '#e06020', '#c02020'] },
  { key: 'arctic'  as const, label: 'Arctic',  colors: ['#c0d8f0', '#a0c0e0', '#e0e8f0', '#f0f4f8', '#ffffff'] },
];

export function RouteLinePanel() {
  const {
    isDrawingRoute, setIsDrawingRoute,
    routeColor, setRouteColor,
    routePoints, clearRoutePoints,
    terrainExaggeration, setTerrainExaggeration,
    hillshadeEnabled, setHillshadeEnabled,
    elevationPreset, setElevationPreset,
  } = useMapStore();

  return (
    <SectionPanel sectionKey="routeLine" title="Route Line">
      {/* Drawing controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          className={`action-btn ${isDrawingRoute ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          onClick={() => setIsDrawingRoute(!isDrawingRoute)}
        >
          <Pen size={11} />
          {isDrawingRoute ? 'Drawing...' : 'Draw Route'}
        </button>
        <ColorPicker
          color={routeColor}
          onChange={setRouteColor}
        />
        <button
          className="action-btn danger"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 8px' }}
          onClick={clearRoutePoints}
          disabled={routePoints.length === 0}
          title="Clear route"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {isDrawingRoute && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)' }}>
          Click on map to add points · {routePoints.length} pts
        </p>
      )}

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--glass-border)' }} />

      {/* Terrain label */}
      <span style={{ ...labelStyle, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontSize: '11px' }}>
        Terrain
      </span>

      <SliderControl
        label="Exaggeration"
        value={terrainExaggeration}
        min={1}
        max={5}
        step={0.1}
        onChange={setTerrainExaggeration}
        displayValue={`${terrainExaggeration.toFixed(1)}×`}
      />

      <Toggle
        checked={hillshadeEnabled}
        onChange={setHillshadeEnabled}
        label="Hillshade"
      />

      {/* Elevation color presets */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ ...labelStyle, fontSize: '11px' }}>Elevation Colors</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {ELEVATION_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => setElevationPreset(preset.key)}
              title={preset.label}
              style={{
                flex: 1,
                height: 18,
                border: `2px solid ${elevationPreset === preset.key ? 'var(--primary)' : 'var(--glass-border)'}`,
                background: `linear-gradient(to right, ${preset.colors.join(', ')})`,
                cursor: 'pointer',
                transition: 'border-color 0.12s',
                borderRadius: 0,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {ELEVATION_PRESETS.map((p) => (
            <span key={p.key} style={{ ...labelStyle, flex: 1, textAlign: 'center' as const, fontSize: '10px' }}>
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </SectionPanel>
  );
}
