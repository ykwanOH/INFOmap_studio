/**
 * MACRO Map Studio — Route Line Panel (v2)
 *
 * - Catmull-Rom 자동 곡선 (점만 찍으면 됨)
 * - Backspace: 마지막 점 취소
 * - Enter: 라인 확정 (이후 추가 라인 그리기 가능)
 * - 지도에서 완료 라인 클릭 → 선택 → Delete로 삭제
 * - 시점/종점 캡 스타일: none / circle / arrow
 * - 라인 스타일: solid / dashed
 */

import { useMapStore, type RouteCapStyle, type RouteLineStyle } from '@/store/useMapStore';
import { SectionPanel, ColorPicker } from '@/components/ui/SectionPanel';
import { Pen, Trash2 } from 'lucide-react';

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
    draftPoints,
    routes,
    deleteSelectedRoute,
    clearAllRoutes,
  } = useMapStore();

  const selectedRoute = routes.find((r) => r.selected) ?? null;

  const handleDraw = () => {
    if (isDrawingRoute) {
      useMapStore.setState({ isDrawingRoute: false, draftPoints: [] });
    } else {
      setIsDrawingRoute(true);
    }
  };

  return (
    <SectionPanel sectionKey="routeLine" title="Route Line">

      {/* Draw controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          className={`action-btn ${isDrawingRoute ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          onClick={handleDraw}
        >
          <Pen size={11} />
          {isDrawingRoute ? `Drawing… (${draftPoints.length} pts)` : 'Draw Route'}
        </button>
        <ColorPicker color={activeRouteColor} onChange={setActiveRouteColor} />
      </div>

      {isDrawingRoute && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)', lineHeight: 1.5 }}>
          Click to add points · <b>Enter</b> confirm · <b>Backspace</b> undo
        </p>
      )}

      {/* Line style */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>Line Style</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['solid', 'dashed'] as RouteLineStyle[]).map((s) => (
            <button
              key={s}
              onClick={() => setActiveRouteLineStyle(s)}
              style={{
                padding: '3px 8px',
                fontFamily: "'DM Mono', monospace",
                fontSize: '10px',
                border: `1.5px solid ${activeRouteLineStyle === s ? 'var(--accent)' : 'var(--glass-border)'}`,
                background: activeRouteLineStyle === s ? 'var(--accent)' : 'transparent',
                color: activeRouteLineStyle === s ? 'white' : 'var(--section-label-color)',
                cursor: 'pointer',
              }}
            >
              {s === 'solid' ? '———' : '- - -'}
            </button>
          ))}
        </div>
      </div>

      {/* Cap style */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>Endpoints</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {CAP_OPTIONS.map(({ key, label, icon }) => (
            <button
              key={key}
              title={label}
              onClick={() => setActiveRouteCapStyle(key)}
              style={{
                width: 28, height: 24,
                fontFamily: "'DM Mono', monospace",
                fontSize: '11px',
                border: `1.5px solid ${activeRouteCapStyle === key ? 'var(--accent)' : 'var(--glass-border)'}`,
                background: activeRouteCapStyle === key ? 'var(--accent)' : 'transparent',
                color: activeRouteCapStyle === key ? 'white' : 'var(--section-label-color)',
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* Routes list */}
      {routes.length > 0 && (
        <>
          <div style={{ height: 1, background: 'var(--glass-border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
              {routes.length} route{routes.length > 1 ? 's' : ''} · click map to select
            </span>
            <button
              className="action-btn danger"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '3px 6px', gap: '3px' }}
              onClick={clearAllRoutes}
            >
              <Trash2 size={10} /> All
            </button>
          </div>

          {selectedRoute && (
            <div style={{
              padding: '6px 8px',
              background: 'var(--glass-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ ...labelStyle, fontSize: '11px' }}>Selected</span>
              <button
                className="action-btn danger"
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 8px' }}
                onClick={deleteSelectedRoute}
              >
                <Trash2 size={10} /> Delete
              </button>
            </div>
          )}
        </>
      )}

    </SectionPanel>
  );
}
