/**
 * MACRO Map Studio — Map Toast Panel (v3)
 * - 1번 클릭: LIVE 싱크 활성화 (깜빡임 없음)
 * - 2번 클릭: 384×384 PNG 캡처 다운로드
 * - 컬러 스킴 3종: 투톤-그레이 / 베이지-그레이 / 블루-그레이
 * - 기본 스킴: 투톤-그레이
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore, type MapToastScheme, type ColorConfig } from '@/store/useMapStore';
import { SectionPanel } from '@/components/ui/SectionPanel';

if (!mapboxgl.accessToken) {
  mapboxgl.accessToken =
    (import.meta.env.VITE_MAPBOX_TOKEN as string) ||
    '';
}

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
};

// ── 컬러 스킴 정의 ──────────────────────────────────────────────────────────
// 투톤-그레이: (255,255,255), (160,160,160), (64,64,64)op80%, 국경 (190,190,190)
// 베이지-그레이: 베이지 계열 + 그레이
// 블루-그레이: 블루 계열 + 그레이

interface SchemeConfig {
  label: string;
  labelKo: string;
  // 썸네일 표시용 컬러
  thumbLand: string;
  thumbWater: string;
  thumbBorder: string;
  // 맵 스타일 커스터마이즈 함수
  applyToMap: (map: mapboxgl.Map) => void;
}

const SCHEME_CONFIGS: Record<MapToastScheme, SchemeConfig> = {
  twotone: {
    label: 'Two-Tone Gray',
    labelKo: '투톤-그레이',
    thumbLand: '#A0A0A0',
    thumbWater: '#FFFFFF',
    thumbBorder: '#BEBEBE',
    applyToMap: (map) => {
      // 대지: 중회색 (160,160,160)
      // 수계: 흰색 (255,255,255)
      // 국경: (190,190,190)
      // 배경: 짙은 회색 (64,64,64) op80%
      const layers = map.getStyle()?.layers || [];
      for (const layer of layers) {
        try {
          if (layer.id === 'background') {
            map.setPaintProperty(layer.id, 'background-color', 'rgba(64,64,64,0.80)');
          } else if (['land', 'land-structure-polygon', 'landuse', 'landuse-residential'].includes(layer.id)) {
            if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', '#A0A0A0');
          } else if (['water', 'water-shadow'].includes(layer.id)) {
            if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', '#FFFFFF');
          } else if (layer.id === 'waterway') {
            if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', '#FFFFFF');
          } else if (['national-park', 'landuse-park', 'landcover-wood', 'landcover-grass'].includes(layer.id)) {
            if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', '#909090');
          } else if (['admin-0-boundary', 'admin-0-boundary-disputed', 'admin-1-boundary'].includes(layer.id)) {
            if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', '#BEBEBE');
          }
          // 지역명, 도로명 숨김
          if (isLabelOrRoadLayer(layer.id)) {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
        } catch (_) {}
      }
    },
  },
  beigegray: {
    label: 'Beige-Gray',
    labelKo: '베이지-그레이',
    thumbLand: '#C8B89A',
    thumbWater: '#D4C8B0',
    thumbBorder: '#A89880',
    applyToMap: (map) => {
      const layers = map.getStyle()?.layers || [];
      for (const layer of layers) {
        try {
          if (layer.id === 'background') {
            map.setPaintProperty(layer.id, 'background-color', '#8A7A68');
          } else if (['land', 'land-structure-polygon', 'landuse', 'landuse-residential'].includes(layer.id)) {
            if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', '#C8B89A');
          } else if (['water', 'water-shadow'].includes(layer.id)) {
            if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', '#D4C8B0');
          } else if (layer.id === 'waterway') {
            if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', '#D4C8B0');
          } else if (['national-park', 'landuse-park', 'landcover-wood', 'landcover-grass'].includes(layer.id)) {
            if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', '#B0A888');
          } else if (['admin-0-boundary', 'admin-0-boundary-disputed', 'admin-1-boundary'].includes(layer.id)) {
            if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', '#A89880');
          }
          if (isLabelOrRoadLayer(layer.id)) {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
        } catch (_) {}
      }
    },
  },
  bluegray: {
    label: 'Blue-Gray',
    labelKo: '블루-그레이',
    thumbLand: '#B0BCC8',
    thumbWater: '#D0DCE8',
    thumbBorder: '#8898A8',
    applyToMap: (map) => {
      const layers = map.getStyle()?.layers || [];
      for (const layer of layers) {
        try {
          if (layer.id === 'background') {
            map.setPaintProperty(layer.id, 'background-color', '#607080');
          } else if (['land', 'land-structure-polygon', 'landuse', 'landuse-residential'].includes(layer.id)) {
            if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', '#B0BCC8');
          } else if (['water', 'water-shadow'].includes(layer.id)) {
            if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', '#D0DCE8');
          } else if (layer.id === 'waterway') {
            if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', '#D0DCE8');
          } else if (['national-park', 'landuse-park', 'landcover-wood', 'landcover-grass'].includes(layer.id)) {
            if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', '#98A8B8');
          } else if (['admin-0-boundary', 'admin-0-boundary-disputed', 'admin-1-boundary'].includes(layer.id)) {
            if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', '#8898A8');
          }
          if (isLabelOrRoadLayer(layer.id)) {
            map.setLayoutProperty(layer.id, 'visibility', 'none');
          }
        } catch (_) {}
      }
    },
  },
};

// 투톤-그레이 → 베이지-그레이 → 블루-그레이 순서
const SCHEME_ORDER: MapToastScheme[] = ['twotone', 'beigegray', 'bluegray'];

function isLabelOrRoadLayer(id: string): boolean {
  const LABEL_PATTERNS = [
    'country-label', 'state-label', 'settlement-label', 'settlement-subdivision-label',
    'airport-label', 'poi-label', 'water-point-label', 'water-line-label',
    'natural-point-label', 'natural-line-label', 'waterway-label',
    'road-label', 'road-number-shield', 'road-exit-shield',
  ];
  const ROAD_PATTERNS = ['road-', 'bridge-', 'tunnel-'];
  return LABEL_PATTERNS.some(p => id.includes(p)) || ROAD_PATTERNS.some(p => id.startsWith(p));
}

// Color 탭에서 설정한 콜러를 미니맵에 적용
function applyColorsToMiniMap(map: mapboxgl.Map, colors: ColorConfig) {
  try {
    const layers = map.getStyle()?.layers || [];
    for (const layer of layers) {
      try {
        if (layer.id === 'background') {
          map.setPaintProperty(layer.id, 'background-color', colors.landmass);
        } else if (['land', 'land-structure-polygon', 'landuse', 'landuse-residential'].includes(layer.id)) {
          if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', colors.landmass);
        } else if (['water', 'water-shadow'].includes(layer.id)) {
          if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', colors.hydro);
        } else if (layer.id === 'waterway') {
          if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', colors.hydro);
        } else if (['national-park', 'landuse-park', 'landcover-wood', 'landcover-grass'].includes(layer.id)) {
          if (layer.type === 'fill') map.setPaintProperty(layer.id, 'fill-color', colors.green);
        } else if (['admin-0-boundary', 'admin-0-boundary-disputed', 'admin-1-boundary'].includes(layer.id)) {
          if (layer.type === 'line') map.setPaintProperty(layer.id, 'line-color', colors.boundary);
        }
      } catch (_) {}
    }
  } catch (_) {}
}

export function MapToastPanel() {
  const miniContainerRef = useRef<HTMLDivElement>(null);
  const miniMapRef = useRef<mapboxgl.Map | null>(null);
  const miniLoadedRef = useRef(false);
  const syncCleanupRef = useRef<(() => void) | null>(null);

  const { mapInstance, mapToastActive, setMapToastActive, mapToastScheme, setMapToastScheme, colors } = useMapStore();
  const [syncing, setSyncing] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── 미니맵 초기화 (한 번만) ──────────────────────────────────────────────
  useEffect(() => {
    if (!miniContainerRef.current || miniMapRef.current) return;
    const mini = new mapboxgl.Map({
      container: miniContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [127.5, 36.5],
      zoom: 3.5,
      interactive: false,
      attributionControl: false,
      preserveDrawingBuffer: true,
    });
    mini.on('load', () => {
      miniLoadedRef.current = true;
      const store = useMapStore.getState();
      // 초기 스킴 적용
      SCHEME_CONFIGS[store.mapToastScheme].applyToMap(mini);
      // Color 탭에서 설정한 콜러 적용
      applyColorsToMiniMap(mini, store.colors);
    });
    miniMapRef.current = mini;
    return () => {
      miniLoadedRef.current = false;
      mini.remove();
      miniMapRef.current = null;
    };
  }, []);

  // ── 스킴 변경 시 미니맵 콜러 재적용 ──────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const mini = miniMapRef.current;
    if (!mini || !miniLoadedRef.current) return;
    SCHEME_CONFIGS[mapToastScheme].applyToMap(mini);
    // 스킴 변경 후 현재 Color 탭 콜러도 적용
    applyColorsToMiniMap(mini, colors);
  }, [mapToastScheme]);

  // ── Color 탭 콜러 변경 시 미니맵에도 적용 ──────────────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const mini = miniMapRef.current;
    if (!mini || !miniLoadedRef.current) return;
    applyColorsToMiniMap(mini, colors);
  }, [colors]);

  // ── 동기화 활성화 ─────────────────────────────────────────────────
  useEffect(() => {
    if (!syncing || !mapInstance || !miniMapRef.current) return;
    const mini = miniMapRef.current;

    const sync = () => {
      if (!mapInstance || !mini) return;
      mini.setCenter(mapInstance.getCenter());
      mini.setZoom(Math.max(0, mapInstance.getZoom() - 0.5));
      mini.setBearing(mapInstance.getBearing());
    };

    // 즉시 한 번 동기화
    sync();
    mapInstance.on('move', sync);

    syncCleanupRef.current = () => {
      mapInstance.off('move', sync);
    };

    return () => {
      mapInstance.off('move', sync);
      syncCleanupRef.current = null;
    };
  }, [syncing, mapInstance]);

  // ── 클릭 핸들러 ─────────────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (!syncing) {
      // 1번 클릭: LIVE 활성화
      setSyncing(true);
      setMapToastActive(true);
    } else {
      // 2번 클릭: 384×384 PNG 캡처
      const mini = miniMapRef.current;
      if (!mini) return;

      const doCapture = () => {
        try {
          const canvas = mini.getCanvas();
          // 384×384 오프스크린 캔버스로 정확한 크기 보장
          const offscreen = document.createElement('canvas');
          offscreen.width = 384;
          offscreen.height = 384;
          const ctx = offscreen.getContext('2d');
          if (!ctx) return;
          // 원본 캔버스를 384×384로 드로우
          ctx.drawImage(canvas, 0, 0, offscreen.width, offscreen.height);
          const link = document.createElement('a');
          link.download = `map-toast_${mapToastScheme}_${Date.now()}.png`;
          link.href = offscreen.toDataURL('image/png');
          link.click();
          setSaved(true);
          setTimeout(() => {
            setSaved(false);
          }, 1800);
        } catch (e) {
          console.error('Map Toast capture error', e);
        }
      };

      // 렌더 완료 후 캡처
      mini.once('render', doCapture);
      mini.triggerRepaint();
    }
  }, [syncing, mapToastScheme, setMapToastActive]);

  const cfg = SCHEME_CONFIGS[mapToastScheme];

  return (
    <SectionPanel sectionKey="mapToast" title="Map Toast" noPadding>
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

        {/* 미니맵 컨테이너 — 정사각형, 클릭 가능 */}
        <div
          onClick={handleClick}
          style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '1 / 1',
            border: `2px solid ${syncing ? 'var(--accent)' : 'var(--glass-border)'}`,
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
            flexShrink: 0,
          }}
          title={syncing ? '클릭하면 384×384 PNG 캡처' : '클릭하면 메인 맵과 LIVE 싱크'}
        >
          {/* 미니맵 DOM 컨테이너 — 항상 렌더링 유지 (깜빡임 방지) */}
          <div
            ref={miniContainerRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              // 싱크 전에는 흐리게 표시
              filter: syncing ? 'none' : 'brightness(0.7)',
              transition: 'filter 0.3s',
            }}
          />

          {/* 비활성 상태 오버레이 — 클릭 유도 */}
          {!syncing && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(245,242,237,0.55)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              pointerEvents: 'none',
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

          {/* LIVE 배지 — 싱크 중 */}
          {syncing && !saved && (
            <div style={{
              position: 'absolute',
              top: 6,
              right: 6,
              background: '#c0392b',
              padding: '2px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              zIndex: 10,
            }}>
              <span style={{
                width: 5, height: 5,
                borderRadius: '50%',
                background: 'white',
                display: 'inline-block',
                animation: 'livePulse 1.4s ease-in-out infinite',
              }} />
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '9px',
                color: 'white',
                letterSpacing: '0.06em',
                fontWeight: 600,
              }}>
                LIVE
              </span>
            </div>
          )}

          {/* SAVED 오버레이 */}
          {saved && (
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(30,80,35,0.40)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10,
            }}>
              <span style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '12px',
                color: 'white',
                letterSpacing: '0.12em',
                fontWeight: 600,
              }}>
                SAVED ✓
              </span>
            </div>
          )}
        </div>

        {/* 컬러 스킴 선택 — 투톤-그레이 / 베이지-그레이 / 블루-그레이 */}
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
                  width: 28,
                  height: 28,
                  border: `2px solid ${isActive ? '#4a4540' : 'var(--glass-border)'}`,
                  background: s.thumbLand,
                  cursor: 'pointer',
                  transition: 'border-color 0.12s, transform 0.1s',
                  position: 'relative',
                  overflow: 'hidden',
                  flexShrink: 0,
                  borderRadius: 0,
                  transform: isActive ? 'scale(1.12)' : 'scale(1)',
                }}
              >
                {/* 상단 대지 */}
                <div style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0,
                  height: '55%',
                  background: s.thumbLand,
                }} />
                {/* 하단 수계 */}
                <div style={{
                  position: 'absolute',
                  bottom: 0, left: 0, right: 0,
                  height: '45%',
                  background: s.thumbWater,
                }} />
                {/* 경계선 */}
                <div style={{
                  position: 'absolute',
                  top: '52%', left: 0, right: 0,
                  height: '1.5px',
                  background: s.thumbBorder,
                }} />
              </button>
            );
          })}
        </div>

        {/* 안내 텍스트 */}
        <p style={{ ...labelStyle, textAlign: 'center', fontSize: '10px', color: 'var(--muted-foreground)', margin: 0 }}>
          {syncing
            ? 'Click minimap to capture 384×384 PNG'
            : `${cfg.labelKo} · Click to activate`}
        </p>
      </div>

      {/* LIVE 펄스 애니메이션 */}
      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </SectionPanel>
  );
}
