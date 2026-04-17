/**
 * MACRO Map Studio — Border & Marker Panel (v2)
 *
 * Border 3레벨:
 *   country  — 국경 (기본 on, 1.5px)
 *   state    — 주/도 경계: 미국 주, 한국 17개 광역 (기본 off, 0.8px)
 *   district — 구/시 경계: 서울 25구 + 각 도 시군 (기본 off, 0.6px)
 */

import { useState } from 'react';
import { useMapStore, type BorderLevel } from '@/store/useMapStore';
import { SectionPanel, Toggle, SliderControl, ColorPicker } from '@/components/ui/SectionPanel';
import { MapPin, X } from 'lucide-react';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
} as const;

const BORDER_LEVELS: { key: BorderLevel; label: string; sublabel: string }[] = [
  { key: 'country',  label: 'Country',          sublabel: '국경' },
  { key: 'state',    label: 'State / Province',  sublabel: '한국 17개 광역' },
  { key: 'district', label: 'District / Si-Gun', sublabel: '서울 구 · 각 도 시군' },
];

const MARKER_COLORS = ['#e05c2a', '#2a7ae0', '#2aae5c', '#e0c02a', '#ae2ae0'];

export function BorderMarkerPanel() {
  const {
    borders, setBorderEnabled, setBorderColor, setBorderWidth,
    addMarker, clearMarkers, markers, mapInstance,
  } = useMapStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [markerColor, setMarkerColor] = useState(MARKER_COLORS[0]);
  const [isSearching, setIsSearching] = useState(false);

  const handleMark = async () => {
    if (!searchQuery.trim() || !mapInstance) return;
    setIsSearching(true);
    try {
      const token =
        (import.meta.env.VITE_MAPBOX_TOKEN as string) ||
        '';
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(searchQuery)}.json?access_token=${token}&types=place,locality,region,country&limit=1`
      );
      const data = await res.json();
      if (data.features?.length > 0) {
        const [lng, lat] = data.features[0].center;
        const name = data.features[0].place_name;
        addMarker(lng, lat, name, markerColor);
        mapInstance.flyTo({ center: [lng, lat], zoom: Math.max(mapInstance.getZoom(), 5), duration: 1200 });
        setSearchQuery('');
      }
    } catch (e) {
      console.error('Geocoding error', e);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <SectionPanel sectionKey="borderMarker" title="Border & Marker">

      {/* Border toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {BORDER_LEVELS.map(({ key, label, sublabel }) => {
          const cfg = borders[key];
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1 }}>
                  <Toggle
                    checked={cfg.enabled}
                    onChange={(v) => setBorderEnabled(key, v)}
                    label={label}
                  />
                  <span style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)', paddingLeft: '2px' }}>
                    {sublabel}
                  </span>
                </div>
                <ColorPicker color={cfg.color} onChange={(c) => setBorderColor(key, c)} />
              </div>
              {cfg.enabled && (
                <SliderControl
                  label="Width"
                  value={cfg.width}
                  min={0.3}
                  max={4}
                  step={0.1}
                  onChange={(v) => setBorderWidth(key, v)}
                  displayValue={`${cfg.width.toFixed(1)}px`}
                />
              )}
              {key === 'district' && cfg.enabled && (
                <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)' }}>
                  줌 6+ 에서 선명하게 표시됩니다
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Pick 모드 현재 단위 안내 */}
      <div style={{ padding: '6px 8px', background: 'var(--glass-border)', opacity: 0.9 }}>
        <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)', margin: 0 }}>
          {borders.district.enabled
            ? 'Pick → 구 / 시군 단위 선택'
            : borders.state.enabled
              ? 'Pick → 주 / 도 단위 선택'
              : 'Pick → 국가 단위 선택'}
        </p>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--glass-border)' }} />

      {/* Marker search */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span style={{ ...labelStyle, fontWeight: 500 }}>City Marker</span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <input
            type="text"
            className="text-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleMark()}
            placeholder="Search city..."
            style={{ flex: 1 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
            {MARKER_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setMarkerColor(c)}
                style={{
                  width: 10, height: 10, borderRadius: '50%', background: c,
                  border: `1.5px solid ${markerColor === c ? 'var(--foreground)' : 'transparent'}`,
                  cursor: 'pointer', flexShrink: 0,
                }}
              />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            className="action-btn"
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
            onClick={handleMark}
            disabled={isSearching || !searchQuery.trim()}
          >
            <MapPin size={11} />
            {isSearching ? 'Searching...' : 'Mark'}
          </button>
          <button
            className="action-btn danger"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
            onClick={clearMarkers}
            disabled={markers.length === 0}
          >
            <X size={11} />
            Clear
          </button>
        </div>
        {markers.length > 0 && (
          <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
            {markers.length} marker{markers.length > 1 ? 's' : ''} placed
          </p>
        )}
      </div>
    </SectionPanel>
  );
}
