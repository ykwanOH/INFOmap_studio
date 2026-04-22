/**
 * MACRO Map Studio — Route Line Panel (v3)
 *
 * 컨트롤 단일화:
 * - Color / Style / Endpoints / Width 항상 노출
 * - 선택된 라인 있으면 → 해당 라인 실시간 편집
 * - 선택 없으면 → 다음 라인 기본값
 * - 개별 삭제: 지도에서 선택 후 Del / Backspace
 * - 전체 삭제: Clear All 버튼만 유지
 */

import { useEffect, useState } from 'react';
import { useMapStore, type RouteCapStyle, type RouteLineStyle } from '@/store/useMapStore';
import { SectionPanel, ColorPicker, SliderControl } from '@/components/ui/SectionPanel';
import { Pen, Trash2, MapPin, X } from 'lucide-react';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
};

const CAP_OPTIONS: { key: RouteCapStyle; label: string; icon: string }[] = [
  { key: 'none',   label: 'None',   icon: '—' },
  { key: 'circle', label: 'Circle', icon: '●' },
  { key: 'arrow',  label: 'Arrow',  icon: '➤' },
];

export function RouteLinePanel() {
  const {
    isDrawingRoute, setIsDrawingRoute,
    activeRouteColor, setActiveRouteColor,
    activeRouteLineStyle, setActiveRouteLineStyle,
    activeRouteCapStyle, setActiveRouteCapStyle,
    activeRouteWidth, setActiveRouteWidth,
    draftPoints,
    routes,
    updateRoute,
    clearAllRoutes,
    addMarker, clearMarkers, markers, mapInstance,
  } = useMapStore();

  const selectedRoute = routes.find((r) => r.selected) ?? null;

  const [searchQuery, setSearchQuery] = useState('');
  const [markerColor, setMarkerColor] = useState('#e05c2a');
  const [isSearching, setIsSearching] = useState(false);

  const MARKER_COLORS = ['#e05c2a', '#2a7ae0', '#2aae5c', '#e0c02a', '#ae2ae0'];

  const handleMark = async () => {
    if (!searchQuery.trim() || !mapInstance) return;
    setIsSearching(true);
    try {
      const token = (import.meta.env.VITE_MAPBOX_TOKEN as string) || '';
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

  // 컨트롤 값: 선택 라인 있으면 그 값, 없으면 active 기본값
  const color = selectedRoute?.color     ?? activeRouteColor;
  const style = selectedRoute?.lineStyle ?? activeRouteLineStyle;
  const cap   = selectedRoute?.capStyle  ?? activeRouteCapStyle;
  const width = selectedRoute?.width     ?? activeRouteWidth;

  // 각 setter: 선택 라인 있으면 updateRoute, 없으면 active 값 변경
  const setColor = (v: string) =>
    selectedRoute ? updateRoute(selectedRoute.id, { color: v }) : setActiveRouteColor(v);
  const setStyle = (v: RouteLineStyle) =>
    selectedRoute ? updateRoute(selectedRoute.id, { lineStyle: v }) : setActiveRouteLineStyle(v);
  const setCap = (v: RouteCapStyle) =>
    selectedRoute ? updateRoute(selectedRoute.id, { capStyle: v }) : setActiveRouteCapStyle(v);
  const setWidth = (v: number) =>
    selectedRoute ? updateRoute(selectedRoute.id, { width: v }) : setActiveRouteWidth(v);

  // 선택된 라인이 생기면 active* 값도 동기화 (다음 라인 기본값 연동)
  useEffect(() => {
    if (!selectedRoute) return;
    setActiveRouteColor(selectedRoute.color);
    setActiveRouteLineStyle(selectedRoute.lineStyle);
    setActiveRouteCapStyle(selectedRoute.capStyle);
    setActiveRouteWidth(selectedRoute.width);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRoute?.id]);

  const handleDraw = () => {
    if (isDrawingRoute) {
      useMapStore.setState({ isDrawingRoute: false, draftPoints: [] });
    } else {
      setIsDrawingRoute(true);
    }
  };

  return (
    <SectionPanel sectionKey="routeLine" title="Route Line">

      {/* Draw button + color */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          className={`action-btn primary ${isDrawingRoute ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          onClick={handleDraw}
        >
          <Pen size={11} />
          {isDrawingRoute ? `Drawing… (${draftPoints.length} pts)` : 'Draw Route'}
        </button>
        <ColorPicker color={color} onChange={setColor} />
      </div>

      {/* 상태 힌트 */}
      {isDrawingRoute ? (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)', lineHeight: 1.5 }}>
          Click to add · <b>Enter</b> confirm · <b>Backspace</b> undo
        </p>
      ) : selectedRoute ? (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)' }}>
          Editing selected · <b>Del</b> to remove
        </p>
      ) : null}

      {/* Line style */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>Line Style</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['solid', 'dashed'] as RouteLineStyle[]).map((s) => (
            <button key={s} onClick={() => setStyle(s)} style={{
              padding: '3px 8px',
              fontFamily: "'DM Mono', monospace", fontSize: '10px',
              border: `1.5px solid ${style === s ? 'var(--accent)' : 'var(--glass-border)'}`,
              background: style === s ? 'var(--accent)' : 'transparent',
              color: style === s ? 'white' : 'var(--section-label-color)',
              cursor: 'pointer',
            }}>
              {s === 'solid' ? '———' : '- - -'}
            </button>
          ))}
        </div>
      </div>

      {/* Endpoints */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>Endpoints</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {CAP_OPTIONS.map(({ key, label, icon }) => (
            <button key={key} title={label} onClick={() => setCap(key)} style={{
              width: 28, height: 24,
              fontFamily: "'DM Mono', monospace", fontSize: '11px',
              border: `1.5px solid ${cap === key ? 'var(--accent)' : 'var(--glass-border)'}`,
              background: cap === key ? 'var(--accent)' : 'transparent',
              color: cap === key ? 'white' : 'var(--section-label-color)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Width */}
      <SliderControl
        label="Width"
        value={width}
        min={1} max={10} step={0.5}
        onChange={setWidth}
        displayValue={`${width.toFixed(1)}px`}
      />

      {/* Routes count + Clear All */}
      {routes.length > 0 && (
        <>
          <div style={{ height: 1, background: 'var(--glass-border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
              {routes.length} route{routes.length > 1 ? 's' : ''}
              {selectedRoute ? '  · selected' : '  · click to select'}
            </span>
            <button
              className="action-btn danger"
              style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '3px 6px' }}
              onClick={clearAllRoutes}
            >
              <Trash2 size={10} /> All
            </button>
          </div>
        </>
      )}

      {/* City Marker */}
      <div style={{ height: 1, background: 'var(--glass-border)', marginTop: 4 }} />
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
            style={{ flex: 1, color: '#1a1a1a', fontWeight: 500 }}
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
            className="action-btn primary"
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
            <X size={11} /> Clear
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
