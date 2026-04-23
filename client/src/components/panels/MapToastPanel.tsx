/**
 * INFOmap Studio — Map Toast Panel (Hi-Res Capture)
 * 캡처 방식:
 *   1. pixelRatio × 4로 미니맵 캔버스 업스케일 렌더
 *   2. 업스케일 캔버스 중앙에서 정사각형 crop
 *   3. 384×384로 다운샘플
 *   4. pixelRatio 원복 · PNG 저장
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore, type MapToastScheme } from '@/store/useMapStore';
import { SectionPanel } from '@/components/ui/SectionPanel';

if (!mapboxgl.accessToken) {
  mapboxgl.accessToken = (import.meta.env.VITE_MAPBOX_TOKEN as string) || '';
}

const OUTPUT_SIZE = 1080;
const BORDER_COLOR = 'rgb(200,200,200)';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
};

const monoStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '10px',
  color: 'var(--section-label-color)',
} as const;

interface SchemeConfig {
  labelKo: string;
  land: string;
  water: string;
  border: string;
  pickSelected: string;
  altLand1?: string;
  altLand2?: string;
}

const SCHEME_CONFIGS: Record<MapToastScheme, SchemeConfig> = {
  twotone: {
    labelKo: '투톤-그레이',
    land: '#A0A0A0', water: '#4D4C4C', border: '#F5F5F5', pickSelected: '#FFFFFF',
  },
  beigegray: {
    labelKo: '베이지-그레이',
    land: '#DBD4CF', water: '#99AAAB', border: '#F5F5F5', pickSelected: '#C6A25F',
    altLand1: '#989474', altLand2: '#9B8874',
  },
  bluegray: {
    labelKo: '블루-그레이',
    land: '#A6ABCD', water: '#282D4B', border: '#F5F5F5',
    pickSelected: '#d1e6ff', altLand1: '#7A8FB5', altLand2: '#6B7FA8',
  },
};

const SCHEME_ORDER: MapToastScheme[] = ['twotone', 'beigegray', 'bluegray'];
const BORDER_IDS = ['admin-0-boundary', 'admin-0-boundary-disputed'];

function applySchemeToMini(
  map: mapboxgl.Map,
  scheme: MapToastScheme,
  showRoads: boolean,
  borderWidth?: number,
) {
  const cfg = SCHEME_CONFIGS[scheme];
  const bColor = 'rgb(220,220,220)';
  const bWidth = (borderWidth ?? 1.5) * 0.7;
  const bWidthExpr: mapboxgl.Expression = ['interpolate', ['linear'], ['zoom'],
    3, bWidth * 0.6, 6, bWidth, 10, bWidth * 1.4,
  ];
  const layers = map.getStyle()?.layers || [];

  for (const layer of layers) {
    const { id, type } = layer;
    try {
      if (type === 'symbol') { map.setLayoutProperty(id, 'visibility', 'none'); continue; }
      if (type === 'background') { map.setPaintProperty(id, 'background-color', cfg.land); continue; }
      if (type === 'fill' && (id.includes('water'))) { map.setPaintProperty(id, 'fill-color', cfg.water); continue; }
      if (type === 'line' && (id === 'waterway' || id.includes('waterway'))) {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'line-color', cfg.water); continue;
      }
      if (type === 'fill' && !id.includes('water')) {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'fill-color', cfg.land);
        map.setPaintProperty(id, 'fill-opacity', 1); continue;
      }
      if (type === 'line' && BORDER_IDS.includes(id)) {
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'line-color', bColor);
        map.setPaintProperty(id, 'line-width', bWidthExpr);
        map.setPaintProperty(id, 'line-opacity', 0.9); continue;
      }
      if (type === 'line' && (id.includes('admin-1') || id.includes('admin-2') || id.startsWith('macro-korea'))) {
        map.setLayoutProperty(id, 'visibility', 'none'); continue;
      }
      if (type === 'line' && (id.startsWith('road-') || id.startsWith('bridge-') || id.startsWith('tunnel-'))) {
        map.setLayoutProperty(id, 'visibility', showRoads ? 'visible' : 'none'); continue;
      }
      if (type === 'line') { map.setLayoutProperty(id, 'visibility', 'none'); continue; }
      if (type === 'fill-extrusion') { map.setLayoutProperty(id, 'visibility', 'none'); continue; }
    } catch (_) {}
  }

  // 대지-수계 경계 anti-aliasing 완화
  const OUTLINE_ID = 'mini-land-outline';
  try {
    if (!map.getLayer(OUTLINE_ID)) {
      map.addLayer({
        id: OUTLINE_ID, type: 'line', source: 'composite', 'source-layer': 'water',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': 'rgb(200,200,200)', 'line-width': 1, 'line-opacity': 1 },
      });
    } else {
      map.setPaintProperty(OUTLINE_ID, 'line-color', 'rgb(200,200,200)');
      map.setPaintProperty(OUTLINE_ID, 'line-width', 1);
    }
  } catch (_) {}
}

export function MapToastPanel() {
  const miniContainerRef = useRef<HTMLDivElement>(null);
  const miniMapRef       = useRef<mapboxgl.Map | null>(null);
  const miniLoadedRef    = useRef(false);

  const { mapInstance, setMapToastActive, mapToastScheme, setMapToastScheme, showRoads, borders } = useMapStore();

  const [miniReady,  setMiniReady]  = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [capturing,  setCapturing]  = useState(false);
  const [saved,      setSaved]      = useState(false);

  // ── 미니맵 초기화 ────────────────────────────────────────────────────────
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
      projection: 'mercator' as any,
    });
    mini.on('load', () => {
      miniLoadedRef.current = true;
      const store = useMapStore.getState();
      applySchemeToMini(mini, store.mapToastScheme, store.showRoads, store.borders.country.width);
      setMiniReady(true);
    });
    miniMapRef.current = mini;
    return () => {
      miniLoadedRef.current = false;
      mini.remove();
      miniMapRef.current = null;
    };
  }, []);

  // ── 스킴·도로·국경 변경 시 재적용 ────────────────────────────────────────
  useEffect(() => {
    const mini = miniMapRef.current;
    if (!mini || !miniLoadedRef.current) return;
    applySchemeToMini(mini, mapToastScheme, showRoads, borders.country.width);
  }, [mapToastScheme, showRoads, borders]);

  // ── 메인맵 동기화 ────────────────────────────────────────────────────────
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

  // ── Hi-Res 캡처 (옵션 A) ─────────────────────────────────────────────────
  const doCapture = useCallback(() => {
    const mini = miniMapRef.current;
    if (!mini || !miniLoadedRef.current || capturing) return;
    setCapturing(true);

    // 컨테이너 크기 기준으로 pixelRatio 계산 → 1080px 직접 렌더
    const containerSize = miniContainerRef.current?.offsetWidth ?? 270;
    const mult = Math.max(1, Math.ceil(OUTPUT_SIZE / containerSize));
    const origRatio = (mini as any).getPixelRatio?.() ?? window.devicePixelRatio ?? 1;

    // 1. pixelRatio 올려서 1080px급 렌더
    try { (mini as any).setPixelRatio(origRatio * mult); } catch (_) {}

    mini.once('idle', () => {
      try {
        const src = mini.getCanvas();

        // 2. 중앙 정사각형 crop
        const cropSize = Math.min(src.width, src.height);
        const cropX = Math.floor((src.width  - cropSize) / 2);
        const cropY = Math.floor((src.height - cropSize) / 2);

        // 3. OUTPUT_SIZE(1080)×OUTPUT_SIZE 출력 — 다운샘플 없음
        const out = document.createElement('canvas');
        out.width  = OUTPUT_SIZE;
        out.height = OUTPUT_SIZE;
        const oCtx = out.getContext('2d')!;
        oCtx.imageSmoothingEnabled = true;
        oCtx.imageSmoothingQuality = 'high';
        oCtx.drawImage(src, cropX, cropY, cropSize, cropSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

        // 4. 저장
        out.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a   = Object.assign(document.createElement('a'), {
            href: url,
            download: `map-toast_${mapToastScheme}_${OUTPUT_SIZE}px_${Date.now()}.png`,
          });
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          URL.revokeObjectURL(url);
          setSaved(true);
          setTimeout(() => setSaved(false), 1800);
        }, 'image/png');

      } catch (e) {
        console.error('MapToast capture error', e);
      } finally {
        // 6. pixelRatio 원복
        try { (mini as any).setPixelRatio(origRatio); } catch (_) {}
        setCapturing(false);
      }
    });

    mini.triggerRepaint();
  }, [capturing, mapToastScheme]);

  // ── 미니맵 클릭 핸들러 ──────────────────────────────────────────────────
  const handleClick = useCallback(() => {
    if (!syncing) {
      setSyncing(true);
      setMapToastActive(true);
    } else {
      doCapture();
    }
  }, [syncing, doCapture, setMapToastActive]);

  const cfg = SCHEME_CONFIGS[mapToastScheme];

  return (
    <SectionPanel sectionKey="mapToast" title="Map Toast" noPadding keepMounted>
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

        {/* 미니맵 */}
        <div
          onClick={handleClick}
          style={{
            position: 'relative', width: '100%', aspectRatio: '1 / 1',
            border: `2px solid ${syncing ? 'var(--accent)' : 'var(--glass-border)'}`,
            overflow: 'hidden', cursor: 'pointer', transition: 'border-color 0.2s', flexShrink: 0,
          }}
          title={syncing ? `클릭 → ${OUTPUT_SIZE}×${OUTPUT_SIZE} Hi-Res PNG 캡처` : '클릭하면 LIVE 싱크 시작'}
        >
          <div ref={miniContainerRef} style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            filter: syncing ? 'none' : 'brightness(0.7)',
            opacity: miniReady ? 1 : 0,
            transition: 'opacity 0.3s, filter 0.3s',
          }} />

          {/* inset 경계선 */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
            boxShadow: `inset 0 0 0 1px ${BORDER_COLOR}`,
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

          {syncing && !saved && !capturing && (
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

          {capturing && (
            <div style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10,
            }}>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: '11px', color: 'white',
                letterSpacing: '0.10em', fontWeight: 600,
              }}>RENDERING…</span>
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

        {/* 컬러 스킴 */}
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
          {capturing
            ? `${OUTPUT_SIZE}px 렌더 중…`
            : syncing
              ? `클릭 → ${OUTPUT_SIZE}×${OUTPUT_SIZE}px 캡처`
              : `${cfg.labelKo} · Click to activate`}
        </p>
      </div>

      <style>{`
        @keyframes livePulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </SectionPanel>
  );
}
