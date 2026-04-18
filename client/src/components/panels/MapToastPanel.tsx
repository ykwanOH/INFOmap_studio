/**
 * MACRO Map Studio — Map Toast Panel
 * A. 2D/3D CAM 따름  B. 지명 항상 숨김  C. 국경 항상 표시
 * D. 도로 토글 따름  E/F. 컬러 스킴 3종  G/H/I. 스킴 컬러  J. 기본=투톤-그레이
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore, type MapToastScheme } from '@/store/useMapStore';
import { SectionPanel } from '@/components/ui/SectionPanel';

if (!mapboxgl.accessToken) {
  mapboxgl.accessToken = (import.meta.env.VITE_MAPBOX_TOKEN as string) || '';
}

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
};

interface SchemeConfig {
  labelKo: string;
  land: string;         // 대지·녹지 기본
  water: string;        // 수계
  border: string;       // 국경
  pickSelected: string; // Pick&Push 선택 국가/주 표시색 (추후 활용)
  altLand1?: string;    // 대지 보조1 (추후 활용)
  altLand2?: string;    // 대지 보조2 (추후 활용)
}

const SCHEME_CONFIGS: Record<MapToastScheme, SchemeConfig> = {
  // 투톤-그레이: 수계 #4d4c4c / 대지·녹지 #a0a0a0 / 대지선택 #ffffff
  twotone: {
    labelKo: '투톤-그레이',
    land:         '#A0A0A0',
    water:        '#4D4C4C',
    border:       '#BEBEBE',
    pickSelected: '#FFFFFF',
  },
  // 베이지-그레이: 수계 #99aaab / 대지·녹지 #dbd4cf / 대지선택 #c6a25f / 보조1 #989474 / 보조2 #9b8874
  beigegray: {
    labelKo: '베이지-그레이',
    land:         '#DBD4CF',
    water:        '#99AAAB',
    border:       '#C8C8C8',
    pickSelected: '#C6A25F',
    altLand1:     '#989474',
    altLand2:     '#9B8874',
  },
  // 블루-그레이: 수계 #282d4b / 대지·녹지 #a6abcd / 대지선택 #d1e6ff / 보조1 #7a8fb5 / 보조2 #6b7fa8
  bluegray: {
    labelKo: '블루-그레이',
    land:         '#A6ABCD',
    water:        '#282D4B',
    border:       '#BEBEBE',
    pickSelected: '#D1E6FF',
    altLand1:     '#7A8FB5', // 블루그레이 계열 중간톤
    altLand2:     '#6B7FA8', // 블루그레이 계열 진한톤
  },
};

const SCHEME_ORDER: MapToastScheme[] = ['twotone', 'beigegray', 'bluegray'];

// 허용할 레이어 패턴 — 이 외 모든 레이어는 숨김
const ALLOWED_LAYER_TYPES = new Set(['background', 'fill', 'line']);
const LAND_IDS  = [
  'land', 'land-structure-polygon', 'landuse', 'landuse-residential',
  'landcover', 'landcover-crop', 'landcover-grass', 'landcover-scrub',  // streets-v12 추가
  'national-park', 'landuse-park',
];
const GREEN_IDS = ['landcover-wood', 'landcover-grass', 'national-park', 'landuse-park'];
const WATER_IDS = ['water', 'water-shadow'];
const BORDER_IDS = ['admin-0-boundary', 'admin-0-boundary-disputed'];

// borders useEffect에서 추가하는 커스텀 국경 레이어
const CUSTOM_BORDER_IDS = ['macro-admin-country', 'macro-admin-state', 'macro-korea-sido', 'macro-korea-sgg'];

function applySchemeToMini(
  map: mapboxgl.Map,
  scheme: MapToastScheme,
  showRoads: boolean,
  borderColor?: string,
  borderWidth?: number,
) {
  const cfg = SCHEME_CONFIGS[scheme];
  const bColor = borderColor || cfg.border;
  const bWidth = borderWidth ?? 1.5;
  const bWidthExpr: mapboxgl.Expression = ['interpolate', ['linear'], ['zoom'],
    3, bWidth * 0.6, 6, bWidth, 10, bWidth * 1.4,
  ];
  const layers = map.getStyle()?.layers || [];

  for (const layer of layers) {
    const { id, type } = layer;
    try {
      // B. symbol 전체 숨김 (지명, POI, 도로번호 등)
      if (type === 'symbol') {
        map.setLayoutProperty(id, 'visibility', 'none');
        continue;
      }

      // 배경 → 대지색
      if (type === 'background') {
        map.setPaintProperty(id, 'background-color', cfg.land);
        continue;
      }

      // 수계 fill → 수계색
      if (type === 'fill' && (id.includes('water') || WATER_IDS.includes(id))) {
        map.setPaintProperty(id, 'fill-color', cfg.water);
        continue;
      }

      // 수계 line
      if (type === 'line' && (id === 'waterway' || id.includes('waterway'))) {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'line-color', cfg.water);
        continue;
      }

      // 대지·녹지 fill → 대지색 (수계 제외한 모든 fill)
      if (type === 'fill' && !id.includes('water')) {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'fill-color', cfg.land);
        map.setPaintProperty(id, 'fill-opacity', 1);
        continue;
      }

      // C. 국경 → 항상 표시, 스킴 국경색
      if (type === 'line' && BORDER_IDS.includes(id)) {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'line-color', bColor);
        map.setPaintProperty(id, 'line-width', bWidthExpr);
        map.setPaintProperty(id, 'line-opacity', 0.9);
        continue;
      }

      // 국경 이하 경계선 숨김
      if (type === 'line' && (id.includes('admin-1') || id.includes('admin-2') ||
          id.startsWith('macro-korea'))) {
        map.setLayoutProperty(id, 'visibility', 'none');
        continue;
      }

      // D. 도로 → 토글 따름
      if (type === 'line' && (id.startsWith('road-') || id.startsWith('bridge-') || id.startsWith('tunnel-'))) {
        map.setLayoutProperty(id, 'visibility', showRoads ? 'visible' : 'none');
        continue;
      }

      // 나머지 line (fence, cliff 등) 숨김
      if (type === 'line') {
        map.setLayoutProperty(id, 'visibility', 'none');
        continue;
      }

      // fill-extrusion (건물 등) 숨김
      if (type === 'fill-extrusion') {
        map.setLayoutProperty(id, 'visibility', 'none');
        continue;
      }
    } catch (_) {}
  }
}

export function MapToastPanel() {
  const miniContainerRef = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<mapboxgl.Map | null>(null);
  const miniLoadedRef = useRef(false);

  const {
    mapInstance,
    setMapToastActive,
    mapToastScheme, setMapToastScheme,
    showRoads,
    borders,
  } = useMapStore();

  const [miniReady, setMiniReady] = useState(false);

  // ── 미니맵 초기화 ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!miniContainerRef.current || miniMapRef.current) return;
    const mini = new mapboxgl.Map({
      container: miniContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [127.5, 36.5],
      zoom: 3.5,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
    });
    mini.on('load', () => {
      miniLoadedRef.current = true;
      const store = useMapStore.getState();
      applySchemeToMini(mini, store.mapToastScheme, store.showRoads, store.borders.country.color, store.borders.country.width);
      // 스킴 적용 완료 후 표시 — 기본 Mapbox 테마 노출 방지
      setMiniReady(true);
    });
    miniMapRef.current = mini;
    return () => {
      miniLoadedRef.current = false;
      mini.remove();
      miniMapRef.current = null;
    };
  }, []);

  // ── 스킴·도로·국경색 변경 시 재적용 ──────────────────────────────────────
  useEffect(() => {
    const mini = miniMapRef.current;
    if (!mini || !miniLoadedRef.current) return;
    applySchemeToMini(mini, mapToastScheme, showRoads, borders.country.color, borders.country.width);
  }, [mapToastScheme, showRoads, borders]);

  // ── A. 동기화: 메인맵 이동·pitch 따라감 ──────────────────────────────────
  useEffect(() => {
    if (!syncing || !mapInstance || !miniMapRef.current) return;
    const mini = miniMapRef.current;
    const sync = () => {
      mini.setCenter(mapInstance.getCenter());
      mini.setZoom(Math.max(0, mapInstance.getZoom() - 0.5));
      mini.setBearing(mapInstance.getBearing());
      mini.setPitch(mapInstance.getPitch());
    };
    sync();
    mapInstance.on('move', sync);
    return () => { mapInstance.off('move', sync); };
  }, [syncing, mapInstance]);

  // ── 클릭: 1차=LIVE, 2차=PNG 캡처 ─────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (!syncing) {
      setSyncing(true);
      setMapToastActive(true);
    } else {
      const mini = miniMapRef.current;
      if (!mini) return;
      mini.once('render', () => {
        try {
          const off = document.createElement('canvas');
          off.width = 384; off.height = 384;
          off.getContext('2d')?.drawImage(mini.getCanvas(), 0, 0, 384, 384);
          const a = document.createElement('a');
          a.download = `map-toast_${mapToastScheme}_${Date.now()}.png`;
          a.href = off.toDataURL('image/png');
          a.click();
          setSaved(true);
          setTimeout(() => setSaved(false), 1800);
        } catch (e) { console.error('capture error', e); }
      });
      mini.triggerRepaint();
    }
  }, [syncing, mapToastScheme, setMapToastActive]);

  const cfg = SCHEME_CONFIGS[mapToastScheme];

  return (
    <SectionPanel sectionKey="mapToast" title="Map Toast" noPadding>
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

        {/* 미니맵 */}
        <div
          onClick={handleClick}
          style={{
            position: 'relative', width: '100%', aspectRatio: '1 / 1',
            border: `2px solid ${syncing ? 'var(--accent)' : 'var(--glass-border)'}`,
            overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s', flexShrink: 0,
          }}
          title={syncing ? '클릭하면 384×384 PNG 캡처' : '클릭하면 LIVE 싱크 시작'}
        >
          <div ref={miniContainerRef} style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            filter: syncing ? 'none' : 'brightness(0.7)', transition: 'filter 0.3s',
            opacity: miniReady ? 1 : 0, transition: 'opacity 0.3s, filter 0.3s',
          }} />

          {!syncing && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(245,242,237,0.55)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: '4px', pointerEvents: 'none',
            }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="8" stroke="var(--muted-foreground)" strokeWidth="1.5" />
                <circle cx="10" cy="10" r="3" fill="var(--muted-foreground)" />
              </svg>
              <span style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)' }}>
                Click to sync
              </span>
            </div>
          )}

          {syncing && !saved && (
            <div style={{
              position: 'absolute', top: 6, right: 6, background: '#c0392b',
              padding: '2px 6px', display: 'flex', alignItems: 'center', gap: '4px', zIndex: 10,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%', background: 'white',
                display: 'inline-block', animation: 'livePulse 1.4s ease-in-out infinite',
              }} />
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: '9px', color: 'white',
                letterSpacing: '0.06em', fontWeight: 600,
              }}>LIVE</span>
            </div>
          )}

          {saved && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(30,80,35,0.40)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
            }}>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'white',
                letterSpacing: '0.12em', fontWeight: 600,
              }}>SAVED ✓</span>
            </div>
          )}
        </div>

        {/* E. 컬러 스킴 아이콘 3개 */}
        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
          {SCHEME_ORDER.map((scheme) => {
            const s = SCHEME_CONFIGS[scheme];
            const isActive = mapToastScheme === scheme;
            return (
              <button
                key={scheme}
                onClick={(e) => { e.stopPropagation(); setMapToastScheme(scheme); }}
                title={s.labelKo}
                style={{
                  width: 28, height: 28,
                  border: `2px solid ${isActive ? '#4a4540' : 'var(--glass-border)'}`,
                  cursor: 'pointer', position: 'relative', overflow: 'hidden',
                  flexShrink: 0, borderRadius: 0, background: 'transparent',
                  transform: isActive ? 'scale(1.12)' : 'scale(1)',
                  transition: 'border-color 0.12s, transform 0.1s',
                }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '55%', background: s.land }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%', background: s.water }} />
                <div style={{ position: 'absolute', top: '52%', left: 0, right: 0, height: '1.5px', background: s.border }} />
              </button>
            );
          })}
        </div>

        <p style={{ ...labelStyle, textAlign: 'center', fontSize: '10px', color: 'var(--muted-foreground)', margin: 0 }}>
          {syncing ? 'Click minimap to capture 384×384 PNG' : `${cfg.labelKo} · Click to activate`}
        </p>
      </div>

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </SectionPanel>
  );
}
