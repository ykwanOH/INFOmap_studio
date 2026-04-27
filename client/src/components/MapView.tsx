/**
 * MACRO Map Studio — MapView Component (v3)
 * - 시작점: 한국(127.5, 36.5), zoom 4.5, 2D CAM (pitch:0)
 * - showLabels / showRoads 토글 반영
 * - 새 ColorConfig: landmass/hydro/green/expressway/streetroad
 * - 도로 레이어 컬러 실시간 반영
 * - Extra Look CSS filter overlay
 */
import { useEffect, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore } from '@/store/useMapStore';
import { booleanPointInPolygon, point } from '@turf/turf';

mapboxgl.accessToken =
  (import.meta.env.VITE_MAPBOX_TOKEN as string) ||
  '';

const VECTOR_STYLE = 'mapbox://styles/mapbox/streets-v12';
const SATELLITE_STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

// BW Print stripe pattern generator — seamless tiling at any angle
// 타일링 이음새 제거: 각도에 맞는 타일 크기를 수학적으로 계산
// period 방향으로 타일이 완벽히 반복되도록 타일을 충분히 크게 설정
function createStripeImageData(
  color: string, angleDeg: number, lineWidth: number, gap: number
): { width: number; height: number; data: Uint8Array } {
  const period = Math.max(2, lineWidth + (gap > 0 ? gap : 0));
  const rad = (angleDeg * Math.PI) / 180;

  // 이음새 없는 타일 크기 계산:
  // sin/cos 값의 최소공배수 크기로 타일을 만들어 경계가 맞도록 함
  const sinA = Math.abs(Math.sin(rad));
  const cosA = Math.abs(Math.cos(rad));

  let tileW: number, tileH: number;
  if (sinA < 0.001) {
    // 수평선 (0°, 180°)
    tileW = period; tileH = period;
  } else if (cosA < 0.001) {
    // 수직선 (90°)
    tileW = period; tileH = period;
  } else {
    // 일반 각도: 타일 크기 = period / sin × period / cos 의 LCM
    // 실용적 계산: 타일 한 변에 period가 정수 번 들어가게
    const wBase = period / sinA;
    const hBase = period / cosA;
    // 타일 크기를 period의 배수로 반올림해서 seamless 보장
    const repeats = Math.max(2, Math.round(Math.sqrt(wBase * hBase) / period));
    tileW = Math.round(wBase * repeats);
    tileH = Math.round(hBase * repeats);
    // 최대 512px 제한 (VRAM 절약)
    const scale = Math.min(1, 512 / Math.max(tileW, tileH));
    tileW = Math.max(64, Math.round(tileW * scale));
    tileH = Math.max(64, Math.round(tileH * scale));
  }

  const canvas = document.createElement('canvas');
  canvas.width = tileW;
  canvas.height = tileH;
  const ctx = canvas.getContext('2d')!;

  // 흰 배경 (수계 기반색)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, tileW, tileH);

  // 줄무늬: 타일 전체를 2배 크기로 그려서 경계 처리
  ctx.fillStyle = color;
  const diag = Math.sqrt(tileW * tileW + tileH * tileH) * 1.5;
  ctx.save();
  ctx.translate(tileW / 2, tileH / 2);
  ctx.rotate(rad);
  for (let x = -diag; x <= diag; x += period) {
    const w = gap === 0 ? period : Math.max(1, lineWidth);
    ctx.fillRect(x, -diag, w, diag * 2);
  }
  ctx.restore();

  const raw = ctx.getImageData(0, 0, tileW, tileH);
  return { width: tileW, height: tileH, data: new Uint8Array(raw.data.buffer) };
}

// Vintage color palettes
const VINTAGE_PALETTES = {
  kodachrome: { land: '#FAEDCD', hydro: '#D4A373', green: '#CCD5AE', expressway: '#E9EDC9', streetroad: '#C8B59A' },
  desert:     { land: '#FEFAE0', hydro: '#DDA15E', green: '#606C38', expressway: '#BC6C25', streetroad: '#283618' },
  bauhaus:    { land: '#F1FAEE', hydro: '#1D3557', green: '#A8DADC', expressway: '#457B9D', streetroad: '#E63946' },
};

// Digital color palettes — land uses neon mid-tone, expressway full bright
const DIGITAL_PALETTES = {
  // Cyber Glitch: dark teal land, deep navy water, neon cyan on roads
  cyberglitch: { land: '#0D2137', hydro: '#030A14', green: '#0A1F10', expressway: '#66FCF1', streetroad: '#45A29E' },
  // Neon Nights: deep indigo land, near-black water, magenta/violet roads
  neonnights:  { land: '#1A0035', hydro: '#07000F', green: '#0D0025', expressway: '#E040FB', streetroad: '#9C27B0' },
};

// 지역명 관련 레이어 ID 패턴 (모든 텍스트 레이어 포함)
const LABEL_LAYER_PATTERNS = [
  'country-label', 'state-label', 'settlement-label', 'settlement-subdivision-label',
  'airport-label', 'poi-label', 'water-point-label', 'water-line-label',
  'natural-point-label', 'natural-line-label', 'waterway-label',
  'road-label', 'road-number-shield', 'road-exit-shield',
  '-label', // 위에 포함 안 된 추가 레이블 패턴
];

// 도로 관련 레이어 ID 패턴
const ROAD_LAYER_PATTERNS = [
  'road-', 'bridge-', 'tunnel-', 'turning-feature',
];

function isLabelLayer(id: string): boolean {
  return LABEL_LAYER_PATTERNS.some(p => id.includes(p));
}

function isRoadLayer(id: string): boolean {
  return ROAD_LAYER_PATTERNS.some(p => id.startsWith(p));
}

// 도로 레이어 분류 — 패턴 기반 (벡터/위성 스타일 모두 대응)
// 주의: bridge-primary-secondary-tertiary처럼 복합 ID는
//        secondary/tertiary를 먼저 체크해야 올바르게 street으로 분류됨

// 레이어 ID가 도로 선 레이어인지 확인
function isRoadLineLayer(id: string, type: string): boolean {
  if (type !== 'line') return false;
  return id.startsWith('road-') || id.startsWith('bridge-') || id.startsWith('tunnel-');
}

// 케이싱 레이어 여부 (아웃라인 역할 — 색 덮어쓰기 제외)
function isRoadCaseLayer(id: string): boolean {
  return id.endsWith('-case');
}

// 레이어 ID로 도로 등급 판별
// expressway = motorway + trunk + primary (bridge/tunnel 포함)
// streetroad = secondary + tertiary + street + residential + simple
// local      = minor, path, steps, service, pedestrian 등
function getRoadTier(id: string): 'expressway' | 'street' | 'local' | null {
  const lower = id.toLowerCase();
  // ① expressway: motorway, trunk, primary
  if (lower.includes('motorway') || lower.includes('trunk') || lower.includes('primary')) return 'expressway';
  // ② streetroad: secondary, tertiary, street, residential, simple
  if (lower.includes('secondary') || lower.includes('tertiary') ||
      lower.includes('street') || lower.includes('residential') ||
      lower.includes('simple')) return 'street';
  // ③ local
  if (lower.includes('minor') || lower.includes('path') || lower.includes('steps') ||
      lower.includes('service') || lower.includes('pedestrian') || lower.includes('ferry') ||
      lower.includes('rail') || lower.includes('cycleway') || lower.includes('trail') || lower.includes('piste')) return 'local';
  // ④ 나머지 road- bridge- tunnel-
  if (lower.startsWith('road-') || lower.startsWith('bridge-') || lower.startsWith('tunnel-')) return 'local';
  return null;
}

// 패턴 기반으로 현재 스타일의 레이어 목록을 동적으로 가져옴
function getRoadLayersByTier(map: mapboxgl.Map, tier: 'expressway' | 'street' | 'local'): string[] {
  try {
    const layers = map.getStyle()?.layers || [];
    return layers
      .filter(l => isRoadLineLayer(l.id, l.type) && getRoadTier(l.id) === tier)
      .map(l => l.id);
  } catch (_) { return []; }
}

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const countriesRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const worldStatesRef = useRef<GeoJSON.FeatureCollection | null>(null);

  // countries.geojson + world_states.geojson 최초 1회 로드
  useEffect(() => {
    fetch('/countries.geojson')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { countriesRef.current = data; })
      .catch(e => console.error('[Pick] countries.geojson load FAILED:', e));

    fetch('/world_states.geojson')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => { worldStatesRef.current = data; })
      .catch(e => console.error('[Pick] world_states.geojson load FAILED:', e));
  }, []);
  const styleLoadedRef = useRef(false);

  const {
    setMapInstance, setZoom,
    mapStyle, viewMode,
    borders, colors,
    showLabels, showRoads,
    terrainExaggeration, hillshadeEnabled, hillshadeSharpness, elevationPreset, elevationColors, illuminationAngle,
    isDrawingRoute, activeRouteColor, activeRouteWidth,
    draftPoints, draftDragPoint, addDraftPoint, undoLastDraftPoint, commitRoute,
    routes, selectRoute,
    flyFromPickMode, flyToPickMode, setFlyRouteFrom, setFlyRouteTo, setFlyFromPickMode, setFlyToPickMode,
    flyRoute,
    pickMode, addPickedFeature, pickedFeatures, pickDisplayMode, pickUnitMode,
    extrudeLightAzimuth, extrudeAOIntensity,
    extraLook,
    bwStripeColor, bwStripeAngle, bwStripeWidth, bwStripeGap,
    vintagePreset, digitalPreset,
  } = useMapStore();

  // ── Initialize map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: VECTOR_STYLE,
      center: [127.5, 36.5],   // 한국 중심
      zoom: 4.5,
      pitch: 0,                // 2D CAM 직부감
      bearing: 0,
      projection: 'mercator',
      antialias: true,
      preserveDrawingBuffer: true,
    });
    map.on('load', () => {
      styleLoadedRef.current = true;
      initCustomLayers(map);
      // 초기 2D CAM: pitch 고정 (직부감)
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
      // 스타일 로드 후 현재 상태 즉시 적용
      const store = useMapStore.getState();
      applyColors(map, store.colors);
      applyLabelVisibility(map, store.showLabels);
      applyRoadVisibility(map, store.showRoads, store.extraLook);
      applyRoadWidthOverride(map); // 초기 스타일 = 벡터
      // ★ idle 후 재적용: 'load' 직후 일부 레이어가 아직 초기화 중일 수 있어
      //   setLayoutProperty가 silently fail하는 경우를 보완.
      map.once('idle', () => {
        applyColors(map, store.colors);
        applyRoadVisibility(map, store.showRoads, store.extraLook);
        applyRoadWidthOverride(map);

      });
      setMapInstance(map);
    });
    map.on('zoom', () => {
      setZoom(parseFloat(map.getZoom().toFixed(2)));
    });
    mapRef.current = map;
    return () => {
      styleLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
      setMapInstance(null);
    };
  }, []);

  // ── Map style switch ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const newStyle = mapStyle === 'vector' ? VECTOR_STYLE : SATELLITE_STYLE;
    styleLoadedRef.current = false;
    map.setStyle(newStyle);
    map.once('style.load', () => {
      styleLoadedRef.current = true;
      initCustomLayers(map);
      const store = useMapStore.getState();
      applyColors(map, store.colors);
      applyLabelVisibility(map, store.showLabels);
      applyRoadVisibility(map, store.showRoads, store.extraLook);
      // 벡터/위성 모두 line-width 명시: width를 직접 찍으면
      // setLayoutProperty('visibility') 타이밍 실패를 우회하고
      // 레이어가 확실히 렌더링 파이프라인에 진입함
      applyRoadWidthOverride(map);
      // ★ idle 후 재적용: 스타일 전환 직후 레이어가 완전히 초기화되지 않은 경우 보완
      map.once('idle', () => {
        applyColors(map, store.colors);
        applyRoadVisibility(map, store.showRoads, store.extraLook);
        applyRoadWidthOverride(map);
      });
    });
  }, [mapStyle]);

  // ── View mode (2D/3D) ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (viewMode === '2d') {
      map.easeTo({ pitch: 0, bearing: 0, duration: 700 });
      // 2D CAM: pitch 변경 불가 (직부감 고정)
      map.dragRotate.disable();
      map.touchZoomRotate.disableRotation();
    } else {
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      map.easeTo({ pitch: 50, duration: 700 });
    }
  }, [viewMode]);

  // ── Color theming ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    applyColors(map, colors);
    // 색 적용 후 visibility 재동기화:
    // 'load'/'style.load' 직후 타이밍에 setLayoutProperty가 실패(catch 무시)한 경우를 보완.
    // applyColors가 레이어를 건드린 직후 visibility를 재확인하면 항상 올바른 상태가 됨.
    applyRoadVisibility(map, showRoads, extraLook);
  }, [colors]);

  // ── Label visibility ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    applyLabelVisibility(map, showLabels);
    // showLabels 변경 시 도로 레이블도 재적용 (도로 레이블은 showLabels && showRoads 둘 다 필요)
    applyRoadVisibility(map, showRoads, extraLook);
  }, [showLabels]);

  // ── Road visibility ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    applyRoadVisibility(map, showRoads, extraLook);
  }, [showRoads]);


  // ── Border layers ───────────────────────────────────────────────────────
  // streets-v12의 기존 admin 레이어를 직접 제어 (커스텀 addLayer 방식 폐기)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;

    const countryCfg  = borders.country;
    const stateCfg    = borders.state;
    const districtCfg = borders.district;

    // ── 국경 (country) — Mapbox 스타일 내 모든 admin-0 레이어 제어 ───────
    // borderTouched 여부와 관계없이 enabled 상태로 제어
    {
      const style = map.getStyle();
      const allLayers = style?.layers ?? [];
      for (const layer of allLayers) {
        const id = layer.id;
        // admin-0 계열: 국경선
        if (id.includes('admin-0') || id.includes('country-boundary')) {
          try {
            map.setLayoutProperty(id, 'visibility', countryCfg.enabled ? 'visible' : 'none');
            if (countryCfg.enabled && layer.type === 'line') {
              map.setPaintProperty(id, 'line-color', countryCfg.color);
              map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'],
                3, countryCfg.width * 0.6, 6, countryCfg.width, 10, countryCfg.width * 1.4,
              ]);
              map.setPaintProperty(id, 'line-opacity', 0.9);
            }
          } catch (_) {}
        }
      }
    }

    // ── 주/도 경계 (state) — Mapbox 스타일 내 모든 admin-1 레이어 제어 ──
    {
      const style = map.getStyle();
      const allLayers = style?.layers ?? [];
      for (const layer of allLayers) {
        const id = layer.id;
        if (id.includes('admin-1')) {
          try {
            // admin-1-boundary-bg: 흰색 글로우 배경선 → 항상 숨김 (GeoJSON선과 어긋남 방지)
            if (id.includes('bg')) {
              map.setLayoutProperty(id, 'visibility', 'none');
              continue;
            }
            map.setLayoutProperty(id, 'visibility', stateCfg.enabled ? 'visible' : 'none');
            if (stateCfg.enabled && layer.type === 'line') {
              map.setPaintProperty(id, 'line-color', stateCfg.color);
              map.setPaintProperty(id, 'line-width', ['interpolate', ['linear'], ['zoom'],
                4, stateCfg.width * 0.5, 7, stateCfg.width, 11, stateCfg.width * 1.6,
              ]);
            }
          } catch (_) {}
        }
      }
    }

    // 한국 sido GeoJSON
    const koSidoLayerId = 'macro-korea-sido';
    if (map.getSource('korea-sido')) {
      if (!map.getLayer(koSidoLayerId)) {
        try {
          map.addLayer({
            id: koSidoLayerId, type: 'line', source: 'korea-sido',
            layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
            paint: {
              'line-color': stateCfg.color,
              'line-width': ['interpolate', ['linear'], ['zoom'],
                4, stateCfg.width * 0.5, 7, stateCfg.width, 11, stateCfg.width * 1.6,
              ],
              'line-opacity': 0.9,
            },
          });
        } catch (_) {}
      }
      if (map.getLayer(koSidoLayerId)) {
        map.setLayoutProperty(koSidoLayerId, 'visibility', stateCfg.enabled ? 'visible' : 'none');
        map.setPaintProperty(koSidoLayerId, 'line-color', stateCfg.color);
        map.setPaintProperty(koSidoLayerId, 'line-width', ['interpolate', ['linear'], ['zoom'],
          4, stateCfg.width * 0.5, 7, stateCfg.width, 11, stateCfg.width * 1.6,
        ]);
      }
    }

    // ── 구/시 경계 (district) — 한국 sgg GeoJSON ─────────────────────────
    const koSggLayerId = 'macro-korea-sgg';
    if (map.getSource('korea-sgg')) {
      if (!map.getLayer(koSggLayerId)) {
        try {
          map.addLayer({
            id: koSggLayerId, type: 'line', source: 'korea-sgg',
            layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
            paint: {
              'line-color': districtCfg.color,
              'line-width': ['interpolate', ['linear'], ['zoom'],
                6, districtCfg.width * 0.5, 9, districtCfg.width, 13, districtCfg.width * 1.8,
              ],
              'line-opacity': 0.8,
            },
          });
        } catch (_) {}
      }
      if (map.getLayer(koSggLayerId)) {
        map.setLayoutProperty(koSggLayerId, 'visibility', districtCfg.enabled ? 'visible' : 'none');
        map.setPaintProperty(koSggLayerId, 'line-color', districtCfg.color);
        map.setPaintProperty(koSggLayerId, 'line-width', ['interpolate', ['linear'], ['zoom'],
          6, districtCfg.width * 0.5, 9, districtCfg.width, 13, districtCfg.width * 1.8,
        ]);
      }
    }
  }, [borders]);


  // ── Terrain exaggeration ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    try {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
      }
      if (terrainExaggeration > 1.0) {
        map.setTerrain({ source: 'mapbox-dem', exaggeration: terrainExaggeration });
      } else {
        map.setTerrain(null);
      }
    } catch (e) {}
  }, [terrainExaggeration]);

  // ── Elevation color gradient (terrain > 1일 때만 활성) ─────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;

    // 프리셋 선택 시 elevationColors를 preset 기본값으로 동기화는 패널에서 처리
    // 여기서는 elevationColors (커스텀) + illuminationAngle을 직접 사용
    try {
      if (terrainExaggeration > 1.0) {
        if (!map.getSource('mapbox-dem')) {
          map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
        }
        if (map.getLayer('elevation-color-layer')) {
          map.removeLayer('elevation-color-layer');
        }
        map.addLayer({
          id: 'elevation-color-layer',
          type: 'hillshade',
          source: 'mapbox-dem',
          paint: {
            'hillshade-exaggeration': 0.65,
            'hillshade-shadow-color': elevationColors.shadow,
            'hillshade-highlight-color': elevationColors.highlight,
            'hillshade-accent-color': elevationColors.midtone,
            'hillshade-illumination-direction': illuminationAngle,
          } as any,
        }, 'water');
        map.setLayoutProperty('elevation-color-layer', 'visibility', 'visible');
      } else {
        if (map.getLayer('elevation-color-layer')) {
          map.setLayoutProperty('elevation-color-layer', 'visibility', 'none');
        }
      }
    } catch (e) {}
  }, [terrainExaggeration, elevationColors, illuminationAngle]);

  // ── Hillshade ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    try {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512 });
      }
      if (hillshadeEnabled) {
        // 위성/벡터 모두 동작 — water 레이어 없을 수 있으니 안전하게 추가
        const beforeLayer = map.getLayer('water') ? 'water' : undefined;
        if (!map.getLayer('hillshade-layer')) {
          map.addLayer({
            id: 'hillshade-layer', type: 'hillshade', source: 'mapbox-dem',
            paint: {
              'hillshade-exaggeration': hillshadeSharpness,
              'hillshade-shadow-color': '#473B24',
              'hillshade-highlight-color': '#ffffff',
            } as any,
          }, beforeLayer);
        } else {
          map.setLayoutProperty('hillshade-layer', 'visibility', 'visible');
          map.setPaintProperty('hillshade-layer', 'hillshade-exaggeration', hillshadeSharpness);
        }
      } else {
        if (map.getLayer('hillshade-layer')) map.setLayoutProperty('hillshade-layer', 'visibility', 'none');
      }
    } catch (e) {}
  }, [hillshadeEnabled, hillshadeSharpness]);

  // ── Catmull-Rom spline helper ───────────────────────────────────────────
  // pts: 앵커 포인트 배열, samples: 각 세그먼트 분할 수
  function catmullRomToGeojson(pts: Array<[number, number]>, samples = 32): Array<[number, number]> {
    if (pts.length < 2) return pts;
    const result: Array<[number, number]> = [];
    // 양 끝에 phantom point 추가 (첫점/끝점 반사)
    const p = [
      [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]] as [number, number],
      ...pts,
      [2 * pts[pts.length - 1][0] - pts[pts.length - 2][0],
       2 * pts[pts.length - 1][1] - pts[pts.length - 2][1]] as [number, number],
    ];
    for (let i = 1; i < p.length - 2; i++) {
      for (let t = 0; t <= samples; t++) {
        const tt = t / samples;
        const tt2 = tt * tt;
        const tt3 = tt2 * tt;
        const x = 0.5 * (
          2 * p[i][0]
          + (-p[i-1][0] + p[i+1][0]) * tt
          + (2*p[i-1][0] - 5*p[i][0] + 4*p[i+1][0] - p[i+2][0]) * tt2
          + (-p[i-1][0] + 3*p[i][0] - 3*p[i+1][0] + p[i+2][0]) * tt3
        );
        const y = 0.5 * (
          2 * p[i][1]
          + (-p[i-1][1] + p[i+1][1]) * tt
          + (2*p[i-1][1] - 5*p[i][1] + 4*p[i+1][1] - p[i+2][1]) * tt2
          + (-p[i-1][1] + 3*p[i][1] - 3*p[i+1][1] + p[i+2][1]) * tt3
        );
        if (t === 0 && result.length > 0) continue; // 중복 점 방지
        result.push([x, y]);
      }
    }
    return result;
  }

  // ── Haversine 거리 (km) ─────────────────────────────────────────────────
  function haversineKm(a: [number, number], b: [number, number]): number {
    const R = 6371;
    const dLat = (b[1] - a[1]) * Math.PI / 180;
    const dLng = (b[0] - a[0]) * Math.PI / 180;
    const h = Math.sin(dLat/2)**2
            + Math.cos(a[1]*Math.PI/180) * Math.cos(b[1]*Math.PI/180) * Math.sin(dLng/2)**2;
    return R * 2 * Math.asin(Math.sqrt(h));
  }

  // ── 총 곡선 길이 계산 (km) ───────────────────────────────────────────────
  function totalLengthKm(coords: Array<[number, number]>): number {
    let total = 0;
    for (let i = 1; i < coords.length; i++) total += haversineKm(coords[i-1], coords[i]);
    return total;
  }

  // ── 균등 도트 샘플링 — cumulative distance 방식 (정확) ────────────────────
  // 1. 각 coord의 누적 km 배열 생성
  // 2. 총 길이를 dotCount로 나눈 interval 기준으로 target 거리 배열 생성
  // 3. 각 target에 대해 이분탐색 후 선형보간 → 정확한 균등 간격
  function sampleEvenlyByCount(
    coords: Array<[number, number]>,
    dotCount: number
  ): Array<[number, number]> {
    if (coords.length < 2 || dotCount < 2) return [coords[0]];
    // 1) 누적 거리 배열
    const cumDist: number[] = [0];
    for (let i = 1; i < coords.length; i++) {
      cumDist.push(cumDist[i-1] + haversineKm(coords[i-1], coords[i]));
    }
    const total = cumDist[cumDist.length - 1];
    if (total === 0) return [coords[0]];
    // 2) target 거리 배열 (0 ~ total을 dotCount 균등 분할)
    const result: Array<[number, number]> = [];
    for (let k = 0; k <= dotCount; k++) {
      const targetDist = (k / dotCount) * total;
      // 이분탐색으로 targetDist가 속한 세그먼트 찾기
      let lo = 0, hi = cumDist.length - 2;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cumDist[mid + 1] < targetDist) lo = mid + 1;
        else hi = mid;
      }
      const i = lo;
      const segLen = cumDist[i+1] - cumDist[i];
      const t = segLen > 0 ? (targetDist - cumDist[i]) / segLen : 0;
      result.push([
        coords[i][0] + t * (coords[i+1][0] - coords[i][0]),
        coords[i][1] + t * (coords[i+1][1] - coords[i][1]),
      ]);
    }
    return result;
  }

  // ── 선분 끝 방향각 (Mapbox bearing: 북=0, 시계방향) ────────────────────────
  // ▶ 문자는 동(오른쪽)이 0°이므로 bearing에서 -90° 보정
  function calcBearing(from: [number, number], to: [number, number]): number {
    const dLng = (to[0] - from[0]) * Math.cos(from[1] * Math.PI / 180);
    const dLat = to[1] - from[1];
    const bearing = (Math.atan2(dLng, dLat) * 180 / Math.PI + 360) % 360;
    return (bearing - 90 + 360) % 360;  // ▶ 문자 방향 보정
  }

  // ── Route drawing (draft + committed routes) ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const st = useMapStore.getState();
    const isDashed = st.activeRouteLineStyle === 'dashed';

    // 1) Draft line source
    const draftLineSource = map.getSource('route-draw') as mapboxgl.GeoJSONSource | undefined;
    if (draftLineSource) {
      // draftDragPoint 있으면 마지막 점으로 붙여서 미리보기
      const previewPts: Array<[number, number]> = draftDragPoint && draftPoints.length >= 1
        ? [...draftPoints, draftDragPoint]
        : draftPoints;
      const coords = previewPts.length >= 2
        ? catmullRomToGeojson(previewPts)
        : previewPts;
      draftLineSource.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      });
    }
    if (map.getLayer('route-draw-line')) {
      map.setPaintProperty('route-draw-line', 'line-color', activeRouteColor);
      map.setPaintProperty('route-draw-line', 'line-width', activeRouteWidth);
      // dasharray: [dash, gap] — line-width 단위 비율, 줌 무관하게 일정한 패턴
      map.setPaintProperty('route-draw-line', 'line-dasharray',
        isDashed ? [1.2, 2.0] : [1]
      );
    }

    // 2) Draft dots source — dasharray 방식으로 전환, 비움
    const draftDotsSource = map.getSource('route-draw-dots') as mapboxgl.GeoJSONSource | undefined;
    if (draftDotsSource) {
      draftDotsSource.setData({ type: 'FeatureCollection', features: [] });
    }

    // 3) Draft start cap (시작점 항상 원형)
    const draftCapSource = map.getSource('route-draw-cap') as mapboxgl.GeoJSONSource | undefined;
    if (draftCapSource && draftPoints.length >= 1) {
      draftCapSource.setData({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: draftPoints[0] },
        properties: { color: activeRouteColor },
      });
    } else if (draftCapSource) {
      draftCapSource.setData({ type: 'FeatureCollection', features: [] });
    }

    // 4) Committed routes
    const committedSource = map.getSource('routes-committed') as mapboxgl.GeoJSONSource | undefined;
    if (committedSource) {
      const features: GeoJSON.Feature[] = [];
      for (const route of routes) {
        const coords = route.points.length >= 2
          ? catmullRomToGeojson(route.points)
          : route.points;
        features.push({
          type: 'Feature',
          id: route.id,
          geometry: { type: 'LineString', coordinates: coords },
          properties: {
            id: route.id,
            color: route.color,
            lineStyle: route.lineStyle,
            width: route.width,
            lineOpacity: 0.95,
            selected: route.selected,
            capStyle: route.capStyle,
          },
        });
        // 시작점 항상 원형
        if (route.points.length >= 1) {
          features.push({
            type: 'Feature',
            id: `${route.id}-start`,
            geometry: { type: 'Point', coordinates: route.points[0] },
            properties: { id: route.id, color: route.color, role: 'start', width: route.width },
          });
        }
        // 종점 캡 — bearing 계산 포함
        if (route.capStyle !== 'none' && route.points.length >= 2) {
          const n = coords.length;
          const fromIdx = Math.max(0, n - Math.min(8, Math.floor(n * 0.05) + 2));
          const bearing = calcBearing(coords[fromIdx], coords[n - 1]);
          features.push({
            type: 'Feature',
            id: `${route.id}-end`,
            geometry: { type: 'Point', coordinates: route.points[route.points.length - 1] },
            properties: { id: route.id, color: route.color, capStyle: route.capStyle, role: 'end', width: route.width, bearing },
          });
        }
        // 점선은 dasharray 레이어가 처리 — 도트 포인트 불필요
      }
      committedSource.setData({ type: 'FeatureCollection', features });
    }
  }, [draftPoints, draftDragPoint, activeRouteColor, activeRouteWidth, routes]);

  // ── Fly route visualization — 끝점 circle만 (3D 포물선은 FlyToAEPanel CustomLayer) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const source = map.getSource('fly-route') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const features: GeoJSON.Feature[] = [];
    if (flyRoute.from) {
      features.push({ type: 'Feature',
        geometry: { type: 'Point', coordinates: [flyRoute.from.lng, flyRoute.from.lat] },
        properties: { pointType: 'from' },
      });
    }
    if (flyRoute.to) {
      features.push({ type: 'Feature',
        geometry: { type: 'Point', coordinates: [flyRoute.to.lng, flyRoute.to.lat] },
        properties: { pointType: 'to' },
      });
    }
    source.setData({ type: 'FeatureCollection', features });
    // fly-route-line은 CustomLayer가 대체 — 숨김 유지
    if (map.getLayer('fly-route-line')) map.setLayoutProperty('fly-route-line', 'visibility', 'none');
    if (map.getLayer('fly-route-points')) map.setLayoutProperty('fly-route-points', 'visibility', 'visible');
  }, [flyRoute]);

  // ── Extrude light & AO ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    // 빛 방향: azimuth를 Mapbox light position [radial, azimuthal, polar]로 변환
    const azRad = (extrudeLightAzimuth * Math.PI) / 180;
    try {
      map.setLight({
        anchor: 'map',
        color: 'white',
        intensity: 0.5,
        position: [1.5, extrudeLightAzimuth, 45],  // [radial, azimuthal°, polar°]
      });
    } catch (_) {}
    // AO: picked-extrude, picked-float-extrude에 적용
    for (const layerId of ['picked-extrude', 'picked-float-extrude']) {
      try {
        if (!map.getLayer(layerId)) continue;
        map.setPaintProperty(layerId, 'fill-extrusion-ambient-occlusion-intensity', extrudeAOIntensity);
        map.setPaintProperty(layerId, 'fill-extrusion-ambient-occlusion-radius', 60);
      } catch (_) {}
    }
  }, [extrudeLightAzimuth, extrudeAOIntensity]);

  // ── Picked features rendering ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;

    const baseFeatures: GeoJSON.Feature[] = pickedFeatures
      .filter((f) => !!(f as any).geometry)
      .map((f) => ({
        type: 'Feature' as const,
        geometry: (f as any).geometry as GeoJSON.Geometry,
        properties: {
          fillColor: f.fillColor,
          borderColor: f.borderColor,
          borderWidth: f.borderWidth,
          extrudeHeight: f.floatHeight ?? 0,
          opacity: f.opacity ?? 1,
        },
      }));

    const baseSrc = map.getSource('picked-features') as mapboxgl.GeoJSONSource | undefined;
    baseSrc?.setData({ type: 'FeatureCollection', features: baseFeatures });

    if (pickDisplayMode === 'extrude') {
      if (map.getLayer('picked-extrude'))       map.setLayoutProperty('picked-extrude', 'visibility', 'visible');
      if (map.getLayer('picked-float-extrude')) map.setLayoutProperty('picked-float-extrude', 'visibility', 'none');
      if (map.getLayer('picked-fill'))          // opacity는 GeoJSON properties에서 per-feature로 처리
    } else {
      // floating 모드
      if (map.getLayer('picked-extrude'))       map.setLayoutProperty('picked-extrude', 'visibility', 'none');
      if (map.getLayer('picked-extrude'))       map.setLayoutProperty('picked-extrude', 'visibility', 'none');
      if (map.getLayer('picked-fill'))          // opacity는 GeoJSON properties에서 per-feature로 처리

      const SLAB = 100;
      const floatFeatures: GeoJSON.Feature[] = pickedFeatures
        .filter((f) => !!(f as any).geometry && (f.floatHeight ?? 0) > 0)
        .map((f) => ({
          type: 'Feature' as const,
          geometry: (f as any).geometry as GeoJSON.Geometry,
          properties: {
            fillColor: f.fillColor,
            floatBase: f.floatHeight ?? 0,
            floatTop: (f.floatHeight ?? 0) + SLAB,
            opacity: f.opacity ?? 1,
          },
        }));
      const floatSrc = map.getSource('picked-float') as mapboxgl.GeoJSONSource | undefined;
      floatSrc?.setData({ type: 'FeatureCollection', features: floatFeatures });
      if (map.getLayer('picked-float-extrude')) {
        map.setLayoutProperty('picked-float-extrude', 'visibility',
          floatFeatures.length > 0 ? 'visible' : 'none');
      }
    }

    const hasHeight = pickedFeatures.some((f) => (f.floatHeight ?? 0) > 0);
    if (hasHeight && map.getPitch() < 20) {
      map.easeTo({ pitch: 40, duration: 600 });
    }
  }, [pickedFeatures, pickDisplayMode]);

  // ── Extra Look — comprehensive mode effects ────────────────────────────
  // Helper: apply color config to Mapbox style layers
  const applyColorsToMap = useCallback((map: mapboxgl.Map, c: typeof colors) => {
    const layers = map.getStyle()?.layers || [];
    for (const layer of layers) {
      const { id, type } = layer;
      try {
        if (type === 'background') { map.setPaintProperty(id, 'background-color', c.landmass); continue; }
        const isWater = id.includes('water') || id === 'water-shadow';
        if (type === 'fill' && isWater) { map.setPaintProperty(id, 'fill-color', c.hydro); continue; }
        if (type === 'line' && id.includes('waterway')) { map.setPaintProperty(id, 'line-color', c.hydro); continue; }
        if (type === 'fill' && !isWater) {
          const isGreen = id.includes('park') || id.includes('green') || id.includes('wood') || id.includes('scrub') || id.includes('crop') || id.includes('grass') || id.includes('landcover');
          map.setPaintProperty(id, 'fill-color', isGreen ? c.green : c.landmass);
          continue;
        }
      } catch (_) {}
    }
  }, [colors]);

  useEffect(() => {
    const map = mapRef.current;
    const container = containerRef.current;
    if (!container) return;
    const mapCanvas = container.querySelector('canvas') as HTMLCanvasElement | null;

    // Clear all overlays
    const clearOverlays = () => {
      container.querySelector('#macro-vignette')?.remove();
      container.querySelector('#macro-scanline')?.remove();
      container.querySelector('#macro-noise')?.remove();
      container.querySelector('#macro-grid')?.remove();
      container.querySelector('#macro-hud')?.remove();
      if (mapCanvas) mapCanvas.style.filter = '';
    };

    const addOverlay = (id: string, cssText: string) => {
      if (!container.querySelector('#' + id)) {
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText = cssText;
        container.appendChild(el);
      }
    };

    clearOverlays();

    if (!extraLook || !map || !styleLoadedRef.current) {
      // Restore base colors
      if (map && styleLoadedRef.current) applyColorsToMap(map, colors);
      // Restore water fill-color, remove stripe pattern
      if (map && styleLoadedRef.current) {
        ['water', 'water-shadow'].forEach(id => {
          try { if (map.getLayer(id)) { map.setPaintProperty(id, 'fill-pattern', null); map.setPaintProperty(id, 'fill-color', colors.hydro); } } catch (_) {}
        });
        if (map.hasImage('bw-stripe')) map.removeImage('bw-stripe');
        // Restore road blur & zoom range
        const layers2 = map.getStyle()?.layers || [];
        layers2.filter(l => l.id.startsWith('road-') || l.id.startsWith('bridge-') || l.id.startsWith('tunnel-')).forEach(l => {
          try { map.setPaintProperty(l.id, 'line-blur', 0); } catch (_) {}
          try { map.setLayerZoomRange(l.id, (l as any).minzoom ?? 0, (l as any).maxzoom ?? 24); } catch (_) {}
        });
      }
      return;
    }

    // ── BW PRINT ──────────────────────────────────────────────────────────
    if (extraLook === 'bwprint') {
      if (mapCanvas) mapCanvas.style.filter = 'grayscale(1) contrast(1.08) brightness(1.04)';
      // 육지·녹지 → 미색 흰색 / 수계 기반색은 흰색(패턴 아래 배경)
      applyColorsToMap(map, { landmass: '#F5F5EE', hydro: '#FFFFFF', green: '#E8E8E0', expressway: '#DEDEDE', streetroad: '#D4D4D0' });
      // 수계 → 사선 패턴 (흰 배경 위에 줄무늬 색상이 보임)
      const stripeImg = createStripeImageData(bwStripeColor, bwStripeAngle, bwStripeWidth, bwStripeGap);
      if (map.hasImage('bw-stripe')) map.removeImage('bw-stripe');
      map.addImage('bw-stripe', stripeImg);
      // 모든 water fill 레이어에 패턴 적용 (줌별 소실 방지)
      const allLy = map.getStyle()?.layers || [];
      for (const ly of allLy) {
        const isWaterFill = ly.type === 'fill' && (ly.id.includes('water') || ly.id === 'water-shadow');
        if (!isWaterFill) continue;
        try {
          map.setPaintProperty(ly.id, 'fill-color', '#FFFFFF');
          map.setPaintProperty(ly.id, 'fill-pattern', 'bw-stripe');
        } catch (_) {}
      }
    }

    // ── VINTAGE ───────────────────────────────────────────────────────────
    if (extraLook === 'vintage') {
      const pal = VINTAGE_PALETTES[vintagePreset ?? 'kodachrome'];
      applyColorsToMap(map, { landmass: pal.land, hydro: pal.hydro, green: pal.green, expressway: pal.expressway, streetroad: pal.streetroad });
      if (mapCanvas) mapCanvas.style.filter = 'sepia(0.3) contrast(1.05) brightness(0.96) saturate(0.9)';
      // Vignette overlay
      addOverlay('macro-vignette', 'position:absolute;inset:0;pointer-events:none;z-index:4;background:radial-gradient(ellipse at center, transparent 40%, rgba(30,15,5,0.55) 100%);');
      // Scanline/interlace
      addOverlay('macro-scanline', 'position:absolute;inset:0;pointer-events:none;z-index:5;background-image:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.05) 3px,rgba(0,0,0,0.05) 4px);');
      // Color noise via SVG feTurbulence filter
      addOverlay('macro-noise', `position:absolute;inset:0;pointer-events:none;z-index:6;opacity:0.18;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");background-size:200px 200px;mix-blend-mode:multiply;`);
    }

    // ── DIGITAL ───────────────────────────────────────────────────────────
    if (extraLook === 'digital') {
      const pal = DIGITAL_PALETTES[digitalPreset ?? 'cyberglitch'];
      applyColorsToMap(map, { landmass: pal.land, hydro: pal.hydro, green: pal.green, expressway: pal.expressway, streetroad: pal.streetroad });
      if (mapCanvas) mapCanvas.style.filter = 'saturate(1.8) contrast(1.25) brightness(1.1)';
      // 회색 얼룩 원인: fill-extrusion(건물 등) · raster 레이어가 landmass 색을 받지 못해 기본 회색으로 남음 → 숨김
      {
        const allL = map.getStyle()?.layers || [];
        for (const l of allL) {
          if (l.type === 'fill-extrusion' || l.type === 'raster') {
            try { map.setLayoutProperty(l.id, 'visibility', 'none'); } catch (_) {}
          }
        }
      }

      // Grid overlay — much more visible
      const gridColor  = digitalPreset === 'neonnights' ? 'rgba(224,64,251,0.22)' : 'rgba(102,252,241,0.18)';
      const gridColor2 = digitalPreset === 'neonnights' ? 'rgba(224,64,251,0.10)' : 'rgba(102,252,241,0.08)';
      addOverlay('macro-grid', [
        'position:absolute;inset:0;pointer-events:none;z-index:4;',
        `background-image:linear-gradient(${gridColor} 1px,transparent 1px),`,
        `linear-gradient(90deg,${gridColor} 1px,transparent 1px),`,
        `linear-gradient(${gridColor2} 1px,transparent 1px),`,
        `linear-gradient(90deg,${gridColor2} 1px,transparent 1px);`,
        'background-size:33px 33px,33px 33px,100px 100px,100px 100px;',
      ].join(''));

      // HUD overlay — bright neon border + inner glow
      const neonC = digitalPreset === 'neonnights' ? 'rgba(224,64,251' : 'rgba(102,252,241';
      addOverlay('macro-hud', [
        'position:absolute;inset:0;pointer-events:none;z-index:6;',
        `box-shadow:`,
        `inset 0 0 0 2px ${neonC},0.55),`,
        `inset 0 0 0 4px ${neonC},0.15),`,
        `inset 0 0 60px ${neonC},0.12),`,
        `inset 0 0 120px ${neonC},0.06);`,
      ].join(''));

      // Digital 룩: applyRoadVisibility(extraLook='digital')에서 zoom 6 처리
      // glow blur만 별도 적용
      {
        const allLayers = map.getStyle()?.layers || [];
        allLayers.forEach(l => {
          const isRoad = l.id.startsWith('road-') || l.id.startsWith('bridge-') || l.id.startsWith('tunnel-');
          if (!isRoad) return;
          try { map.setPaintProperty(l.id, 'line-blur', 3); } catch (_) {}
        });
        // zoom range는 applyRoadVisibility에서 처리
        applyRoadVisibility(map, showRoads, 'digital');
      }
    }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraLook, bwStripeColor, bwStripeAngle, bwStripeWidth, bwStripeGap, vintagePreset, digitalPreset, colors]);

  // ── Map click handler ───────────────────────────────────────────────────
  const handleMapClick = useCallback(
    (e: mapboxgl.MapMouseEvent & { features?: mapboxgl.MapboxGeoJSONFeature[] }) => {
      const map = mapRef.current;
      if (!map) return;
      const { lng, lat } = e.lngLat;
      if (isDrawingRoute) { addDraftPoint([lng, lat]); return; }
      if (flyFromPickMode) {
        setFlyRouteFrom({ lng, lat, name: `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E` });
        setFlyFromPickMode(false);
        return;
      }
      if (flyToPickMode) {
        setFlyRouteTo({ lng, lat, name: `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E` });
        setFlyToPickMode(false);
        return;
      }
      if (pickMode) {
        const store = useMapStore.getState();
        const pickId = `pick-${Date.now()}`;
        const unit = store.pickUnitMode ?? 'country';

        if (unit === 'country') {
          // ── 국가 단위: countries.geojson point-in-polygon ──
          const countries = countriesRef.current;
          if (countries) {
            const pt = point([lng, lat]);
            let found: GeoJSON.Feature | undefined;
            for (const f of countries.features) {
              if (!f.geometry) continue;
              try { if (booleanPointInPolygon(pt, f as any)) { found = f; break; } }
              catch { /* skip */ }
            }
            if (found && found.geometry) {
              const props = found.properties || {};
              addPickedFeature({
                id: `country-${props.iso_n3 || props.name || pickId}`,
                sourceLayer: 'country',
                fillColor: '#4a90d9', borderColor: '#2a5a9a', borderWidth: 1.5, floatHeight: 0,
                groupId: store.currentGroupId,
                geometry: found.geometry,
                meta: { type: 'country', name: props.name, iso_n3: props.iso_n3 },
              } as any);
            }
          }
          return;
        }

        if (unit === 'state') {
          // ── 주/도 단위 ──
          // 1순위: 한국 GeoJSON (korea-sgg-fill / korea-sido-fill)
          const koFeats = map.queryRenderedFeatures(e.point, { layers: ['korea-sgg-fill', 'korea-sido-fill'] });
          if (koFeats.length > 0) {
            const feat = koFeats[0];
            const usesSgg = map.getZoom() >= 7;
            if (usesSgg) {
              const sgg = feat.properties?.sgg as string | undefined;
              if (sgg) {
                addPickedFeature({
                  id: `korea-sgg-${sgg}`,
                  sourceLayer: 'korea-sgg',
                  fillColor: '#4a90d9', borderColor: '#2a5a9a', borderWidth: 1.5, floatHeight: 0,
                  groupId: store.currentGroupId,
                  geometry: feat.geometry,
                  meta: { type: 'korea-sgg', sgg, sggnm: feat.properties?.sggnm, sidonm: feat.properties?.sidonm },
                } as any);
                return;
              }
            }
            const sido = feat.properties?.sido as string | undefined;
            if (sido) {
              addPickedFeature({
                id: `korea-sido-${sido}`,
                sourceLayer: 'korea-sido',
                fillColor: '#4a90d9', borderColor: '#2a5a9a', borderWidth: 1.5, floatHeight: 0,
                groupId: store.currentGroupId,
                geometry: feat.geometry,
                meta: { type: 'korea-sido', sido, sidonm: feat.properties?.sidonm },
              } as any);
              return;
            }
          }

          // 2순위: world_states.geojson point-in-polygon (US, CN, CA 등)
          const worldStates = worldStatesRef.current;
          if (worldStates) {
            const pt = point([lng, lat]);
            let found: GeoJSON.Feature | undefined;
            for (const f of worldStates.features) {
              if (!f.geometry) continue;
              try { if (booleanPointInPolygon(pt, f as any)) { found = f; break; } }
              catch { /* skip */ }
            }
            if (found && found.geometry) {
              const props = found.properties || {};
              const stateId = `state-${props.iso_a2 || ''}-${props.name || pickId}`;
              addPickedFeature({
                id: stateId,
                sourceLayer: 'state',
                fillColor: '#4a90d9', borderColor: '#2a5a9a', borderWidth: 1.5, floatHeight: 0,
                groupId: store.currentGroupId,
                geometry: found.geometry,
                meta: { type: 'state', name: props.name_en || props.name, iso_a2: props.iso_a2 },
              } as any);
              return;
            }
          }

          // 3순위: world_states에 없는 국가(중동, 일본 등) → countries.geojson 국가 단위 fallback
          const countries = countriesRef.current;
          if (countries) {
            const pt = point([lng, lat]);
            let found: GeoJSON.Feature | undefined;
            for (const f of countries.features) {
              if (!f.geometry) continue;
              try { if (booleanPointInPolygon(pt, f as any)) { found = f; break; } }
              catch { /* skip */ }
            }
            if (found && found.geometry) {
              const props = found.properties || {};
              addPickedFeature({
                id: `state-country-${props.name || pickId}`,
                sourceLayer: 'country',
                fillColor: '#4a90d9', borderColor: '#2a5a9a', borderWidth: 1.5, floatHeight: 0,
                groupId: store.currentGroupId,
                geometry: found.geometry,
                meta: { type: 'country-fallback', name: props.name },
              } as any);
            }
          }
          return;
        }
      }
    },
    [isDrawingRoute, flyFromPickMode, flyToPickMode, pickMode, addDraftPoint,
     setFlyRouteFrom, setFlyRouteTo, setFlyFromPickMode, setFlyToPickMode, addPickedFeature]
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.on('click', handleMapClick);
    return () => { map.off('click', handleMapClick); };
  }, [handleMapClick]);

  // ── Cursor style ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const canvas = map.getCanvas();
    canvas.style.cursor = (isDrawingRoute || flyFromPickMode || flyToPickMode || pickMode) ? 'crosshair' : '';
  }, [isDrawingRoute, flyFromPickMode, flyToPickMode, pickMode]);

  // ── Keyboard: Enter = commit route, Backspace = undo last point ──────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // 입력창 포커스 중이면 무시
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      const state = useMapStore.getState();
      if (e.key === 'Enter' && state.isDrawingRoute) {
        e.preventDefault();
        state.commitRoute();
      }
      if (e.key === 'Backspace' && state.isDrawingRoute) {
        e.preventDefault();
        state.undoLastDraftPoint();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && !state.isDrawingRoute) {
        // 그리기 모드 아닐 때 선택된 라인 삭제
        const hasSelected = state.routes.some((r) => r.selected);
        if (hasSelected) { e.preventDefault(); state.deleteSelectedRoute(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // 한 번만 등록, 내부에서 getState()로 최신값 읽음

  // ── Committed route click → select ──────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      const state = useMapStore.getState();
      if (state.isDrawingRoute || state.pickMode) return;
      // 실선: routes-committed-line, 점선: routes-committed-dots (dot 클릭)
      // 히트 반경 확장 — 5px box로 쿼리
      const bbox: [mapboxgl.PointLike, mapboxgl.PointLike] = [
        [e.point.x - 8, e.point.y - 8],
        [e.point.x + 8, e.point.y + 8],
      ];
      const features = map.queryRenderedFeatures(bbox, {
        layers: ['routes-committed-line', 'routes-committed-dots', 'routes-committed-start', 'routes-committed-end-circle'],
      });
      if (features.length > 0) {
        const id = features[0].properties?.id as string;
        selectRoute(id);
      } else {
        selectRoute(null);
      }
    };
    map.on('click', onClick);
    return () => { map.off('click', onClick); };
  }, [selectRoute]);

  // ── Mouse move → draft 곡률 미리보기 (마지막 점 이후 커서 위치 추적) ──────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onMove = (e: mapboxgl.MapMouseEvent) => {
      const state = useMapStore.getState();
      if (!state.isDrawingRoute || state.draftPoints.length === 0) return;
      state.setDraftDragPoint([e.lngLat.lng, e.lngLat.lat]);
    };
    const onLeave = () => {
      useMapStore.getState().setDraftDragPoint(null);
    };
    map.on('mousemove', onMove);
    map.on('mouseout', onLeave);
    return () => {
      map.off('mousemove', onMove);
      map.off('mouseout', onLeave);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ background: '#E9E4E0', position: 'relative' }}
    />
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function applyRoadWidthOverride(map: mapboxgl.Map) {
  try {
    const layers = map.getStyle()?.layers || [];
    for (const layer of layers) {
      if (!isRoadLineLayer(layer.id, layer.type)) continue;
      const tier = getRoadTier(layer.id);
      if (!tier) continue;
      try {
        if (tier === 'expressway') {
          map.setPaintProperty(layer.id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            7, 0.09, 9, 0.32, 12, 0.45, 15, 0.56,
          ]);
        } else if (tier === 'street') {
          map.setPaintProperty(layer.id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            12.5, 0.29, 14, 0.44, 15, 0.59,
          ]);
          map.setPaintProperty(layer.id, 'line-opacity', 1);
        } else {
          map.setPaintProperty(layer.id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            12.5, 0.15, 14, 0.25,
          ]);
        }
      } catch (_) {}
    }
  } catch (e) {}
}

function applyLabelVisibility(map: mapboxgl.Map, visible: boolean) {
  try {
    const style = map.getStyle();
    if (!style?.layers) return;
    for (const layer of style.layers) {
      if (!isLabelLayer(layer.id)) continue;
      try {
        map.setLayoutProperty(layer.id, 'visibility', visible ? 'visible' : 'none');
        // 켜질 때 한글 우선 표시 설정
        if (visible) {
          map.setLayoutProperty(layer.id, 'text-field', [
            'coalesce',
            ['get', 'name_ko'],
            ['get', 'name'],
          ]);
        }
      } catch (_) {}
    }
  } catch (e) {}
}

function applyRoadVisibility(map: mapboxgl.Map, visible: boolean, extraLook?: string | null) {
  try {
    const style = map.getStyle();
    if (!style?.layers) return;

    const isDigital = extraLook === 'digital';

    for (const layer of style.layers) {
      const id = layer.id;
      try {
        if (isLabelLayer(id) && isRoadLayer(id)) {
          map.setLayoutProperty(id, 'visibility', 'none');
          continue;
        }
        if (!isRoadLineLayer(id, layer.type)) continue;
        const tier = getRoadTier(id);
        if (!tier) continue;

        if (!visible) {
          map.setLayoutProperty(id, 'visibility', 'none');
          continue;
        }

        map.setLayoutProperty(id, 'visibility', 'visible');

        if (isDigital) {
          const newMin = tier === 'expressway' ? 6 : tier === 'street' ? 8 : 9;
          map.setLayerZoomRange(id, newMin, 24);
        } else {
          if (tier === 'expressway') {
            map.setLayerZoomRange(id, 7, 24);
          } else {
            map.setLayerZoomRange(id, 12.5, 24);
          }
        }
      } catch (e) {}
    }

    // ferry, ferry-auto: 명시적 zoom 설정
    for (const ferryId of ['ferry', 'ferry-auto']) {
      try {
        if (!map.getLayer(ferryId)) continue;
        map.setLayoutProperty(ferryId, 'visibility', visible ? 'visible' : 'none');
        if (visible) {
          map.setLayerZoomRange(ferryId, isDigital ? 5 : 8, 24);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

function applyColors(map: mapboxgl.Map, colors: import('@/store/useMapStore').ColorConfig) {
  try {
    const style = map.getStyle();
    if (!style?.layers) return;

    for (const layer of style.layers) {
      const id = layer.id;
      try {
        // ── 배경 ──
        if (layer.type === 'background') {
          map.setPaintProperty(id, 'background-color', colors.landmass);
        }
        // ── 대지 fill (수계/녹지 제외) ──
        else if (
          layer.type === 'fill' &&
          (id.startsWith('land') || id.includes('landuse') || id.includes('landcover') ||
           id === 'national-park' || id === 'landuse-park')
        ) {
          if (id.includes('water') || id.includes('hydro')) continue;
          if (id.includes('wood') || id.includes('grass') || id.includes('park') || id.includes('national')) {
            map.setPaintProperty(id, 'fill-color', colors.green);
            // ★ 녹지 opacity 완전 불투명: light-v11 기본값(국립공원 등 0.5↓)을 1로 강제
            map.setPaintProperty(id, 'fill-opacity', 1);
          } else {
            map.setPaintProperty(id, 'fill-color', colors.landmass);
          }
        }
        // ── 수계 fill ──
        else if (layer.type === 'fill' && id.includes('water')) {
          map.setPaintProperty(id, 'fill-color', colors.hydro);
        }
        // ── 수계 line ──
        else if (layer.type === 'line' && (id === 'waterway' || id.includes('waterway'))) {
          map.setPaintProperty(id, 'line-color', colors.hydro);
        }
      } catch (_) {}
    }

    // ── 수계 명시 레이어 ──
    for (const id of ['water', 'water-shadow']) {
      if (map.getLayer(id)) map.setPaintProperty(id, 'fill-color', colors.hydro);
    }
    if (map.getLayer('waterway')) map.setPaintProperty('waterway', 'line-color', colors.hydro);

    // ── 녹지 (opacity 1 강제 포함) ──
    for (const id of ['national-park', 'landuse-park', 'landcover-wood', 'landcover-grass']) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, 'fill-color', colors.green);
      map.setPaintProperty(id, 'fill-opacity', 1);
    }

    // ── 도로 컬러 — 등급별 분류하여 적용 (벡터/위성 공통) ──
    for (const layer of style.layers) {
      if (!isRoadLineLayer(layer.id, layer.type)) continue;
      const tier = getRoadTier(layer.id);
      if (!tier) continue;
      try {
        const color = tier === 'expressway' ? colors.expressway
                    : colors.streetroad; // street + local 모두 일반도로 색
        map.setPaintProperty(layer.id, 'line-color', color);
        map.setPaintProperty(layer.id, 'line-opacity', 1);
      } catch (_) {}
    }

    // ── 경계선은 Border & Marker 패널의 borders 상태가 직접 제어 ──
    // (applyColors에서 boundary 컬러를 덮어쓰지 않음)

  } catch (e) { /* layer may not exist */ }
}

function findVectorSource(map: mapboxgl.Map): string | null {
  const sources = map.getStyle()?.sources || {};
  for (const name of ['composite', 'mapbox', 'mapbox-streets', 'vectorTiles']) {
    if (sources[name]) return name;
  }
  return Object.keys(sources).find((k) => (sources[k] as any).type === 'vector') ?? null;
}

function initCustomLayers(map: mapboxgl.Map) {
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
  }
  // ── Draft: 라인, 도트(점선), 시작 캡 ─────────────────────────────────────
  if (!map.getSource('route-draw')) {
    map.addSource('route-draw', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} },
    });
    map.addLayer({
      id: 'route-draw-line', type: 'line', source: 'route-draw',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#e05c2a', 'line-width': 2.5, 'line-opacity': 0.9 },
    });
  }
  if (!map.getSource('route-draw-dots')) {
    map.addSource('route-draw-dots', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'route-draw-dots-layer', type: 'circle', source: 'route-draw-dots',
      paint: {
        'circle-radius': ['/', ['get', 'radius'], 1],  // properties.radius로 전달
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.9,
      },
    });
  }
  if (!map.getSource('route-draw-cap')) {
    map.addSource('route-draw-cap', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'route-draw-cap-layer', type: 'circle', source: 'route-draw-cap',
      paint: {
        'circle-radius': 7.5,      // 기본 5 × 1.5
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
        'circle-opacity': 1,
      },
    });
  }
  // ── Committed routes ────────────────────────────────────────────────────
  if (!map.getSource('routes-committed')) {
    map.addSource('routes-committed', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

    // 선택 하이라이트 (메인 라인 아래)
    map.addLayer({
      id: 'routes-committed-select',
      type: 'line',
      source: 'routes-committed',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['==', ['get', 'selected'], true]],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#ffffff',
        'line-width': ['+', ['get', 'width'], 5],
        'line-opacity': 0.35,
        'line-blur': 2,
      },
    });
    // 메인 라인 — solid/dashed 모두 line-dasharray로 처리 (줌 무관 일정 패턴)
    map.addLayer({
      id: 'routes-committed-line',
      type: 'line',
      source: 'routes-committed',
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-opacity': ['coalesce', ['get', 'lineOpacity'], 0.95],
        'line-dasharray': ['case',
          ['==', ['get', 'lineStyle'], 'dashed'], ['literal', [1.2, 2.0]],
          ['literal', [1]],
        ],
      },
    });
    // 점선 dot 레이어는 dasharray로 대체됨 — 히트 영역용 투명 레이어만 유지
    map.addLayer({
      id: 'routes-committed-dots',
      type: 'circle',
      source: 'routes-committed',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['/', ['get', 'width'], 2.2],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0,  // 완전 투명 — 클릭 히트 영역만
        'circle-stroke-width': 0,
      },
    });
    // 시작점 항상 원형 (1.5배)
    map.addLayer({
      id: 'routes-committed-start',
      type: 'circle',
      source: 'routes-committed',
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'role'], 'start']],
      paint: {
        'circle-radius': ['*', ['get', 'width'], 1.5],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
    // 종점 circle 캡
    map.addLayer({
      id: 'routes-committed-end-circle',
      type: 'circle',
      source: 'routes-committed',
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'role'], 'end'], ['==', ['get', 'capStyle'], 'circle']],
      paint: {
        'circle-radius': ['*', ['get', 'width'], 1.5],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
    // 종점 화살표 — width 비례 크기, bearing 방향 회전, halo 없음
    // text-size 기준: width=5 → 42px (3배 기준값)
    // text-rotate: bearing 값 (Mapbox는 북=0 시계방향, text도 동일)
    map.addLayer({
      id: 'routes-committed-arrows',
      type: 'symbol',
      source: 'routes-committed',
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'role'], 'end'], ['==', ['get', 'capStyle'], 'arrow']],
      layout: {
        'text-field': '▶',
        'text-size': ['*', ['/', ['get', 'width'], 5], 63],
        'text-rotate': ['get', 'bearing'],
        'text-rotation-alignment': 'map',
        'text-allow-overlap': true,
        'text-ignore-placement': true,
        'text-anchor': 'center',
      },
      paint: {
        'text-color': ['get', 'color'],
      },
    });
  }
  if (!map.getSource('fly-route')) {
    map.addSource('fly-route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'fly-route-line', type: 'line', source: 'fly-route',
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': '#e05c2a',
        'line-width': 2.5,
        'line-dasharray': [1, 0],
        'line-opacity': 0.9,
      },
    });
    map.addLayer({
      id: 'fly-route-points', type: 'circle', source: 'fly-route',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 7,
        'circle-color': '#e05c2a',
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
      },
    });
  }
  // fly 아이콘 소스 (패널에서 addImage 후 이 source에 point 추가)
  if (!map.getSource('fly-icon-source')) {
    map.addSource('fly-icon-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'fly-icon-layer', type: 'symbol', source: 'fly-icon-source',
      layout: {
        'icon-image': 'fly-icon',
        'icon-size': 0.7,
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    });
  }
  // picked-extrude 소스: extrude 모드용 (base=0, height=floatHeight)
  if (!map.getSource('picked-features')) {
    map.addSource('picked-features', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'picked-fill', type: 'fill', source: 'picked-features',
      paint: { 'fill-color': ['get', 'fillColor'], 'fill-opacity': ['get', 'opacity'] },
    });
    map.addLayer({ id: 'picked-border', type: 'line', source: 'picked-features',
      paint: { 'line-color': ['get', 'borderColor'], 'line-width': ['get', 'borderWidth'] },
    });
    map.addLayer({ id: 'picked-extrude', type: 'fill-extrusion', source: 'picked-features',
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': ['get', 'fillColor'],
        'fill-extrusion-height': ['get', 'extrudeHeight'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': ['get', 'opacity'],
      },
    });
  }
  if (!map.getSource('picked-float')) {
    map.addSource('picked-float', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'picked-float-extrude', type: 'fill-extrusion', source: 'picked-float',
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': ['get', 'fillColor'],
        'fill-extrusion-height': ['get', 'floatTop'],
        'fill-extrusion-base': ['get', 'floatBase'],
        'fill-extrusion-opacity': ['get', 'opacity'],
      },
    });
  }

  // ── 위성뷰 도로 굵기 override ─────────────────────────────────────────
  // 위성뷰 기본 도로가 너무 굵으므로 원래 대비 50% 수준으로 조절
  // Z5이하: 50%, Z5-7: 60%, Z7이후: 60% 유지, Z9 급증 억제
  // 위성 스타일일 때 도로 굵기 override는 style.load 콜백에서 applyRoadWidthOverride(map)로 처리

  // ── 한국 행정구역 GeoJSON (sido/sgg 분리 로드) ──────────────────────────
  // korea_sido.geojson: 17개 광역 (읍면동→sido dissolve)
  // korea_sgg.geojson:  252개 시군구 (읍면동→sgg dissolve)

  // ── 해외 admin-1 pick용 투명 fill 레이어 ──────────────────────────────
  // admin-1-boundary는 line이라 geometry를 못 가져오므로
  // composite/admin fill 레이어를 별도로 추가하여 queryRenderedFeatures로 geometry 획득
  if (!map.getLayer('admin-1-fill-hit')) {
    try {
      // admin_level 필터를 ['<=', 1]로 넓혀야 Mapbox composite/admin 소스에서
      // 실제 geometry를 queryRenderedFeatures로 얻을 수 있음.
      // (일부 타일에서 admin_level이 숫자 비교에 실패하는 경우 대비)
      map.addLayer({
        id: 'admin-1-fill-hit',
        type: 'fill',
        source: 'composite',
        'source-layer': 'admin',
        filter: ['<=', ['get', 'admin_level'], 1],
        paint: { 'fill-color': 'rgba(0,0,0,0)', 'fill-opacity': 0.001 },
      });
    } catch (_) {}
  }

  // sido 소스
  if (!map.getSource('korea-sido')) {
    fetch('/korea_sido.geojson')
      .then((r) => r.json())
      .then((data) => {
        if (map.getSource('korea-sido')) return;
        map.addSource('korea-sido', { type: 'geojson', data, generateId: true });

        // pick 히트박스 (투명 fill)
        map.addLayer({
          id: 'korea-sido-fill',
          type: 'fill',
          source: 'korea-sido',
          paint: { 'fill-color': 'transparent', 'fill-opacity': 0 },
        });

        const store = useMapStore.getState();
        const stateCfg = store.borders.state;
        map.addLayer({
          id: 'macro-korea-sido',
          type: 'line',
          source: 'korea-sido',
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: stateCfg.enabled ? 'visible' : 'none' },
          paint: {
            'line-color': stateCfg.color,
            'line-width': ['interpolate', ['linear'], ['zoom'],
              4, stateCfg.width * 0.5, 7, stateCfg.width, 11, stateCfg.width * 1.6,
            ],
            'line-opacity': 0.9,
          },
        });
      })
      .catch((e) => console.warn('Korea sido GeoJSON load failed', e));
  }

  // sgg 소스
  if (!map.getSource('korea-sgg')) {
    fetch('/korea_sgg.geojson')
      .then((r) => r.json())
      .then((data) => {
        if (map.getSource('korea-sgg')) return;
        map.addSource('korea-sgg', { type: 'geojson', data, generateId: true });

        // pick 히트박스
        map.addLayer({
          id: 'korea-sgg-fill',
          type: 'fill',
          source: 'korea-sgg',
          paint: { 'fill-color': 'transparent', 'fill-opacity': 0 },
        });

        const store = useMapStore.getState();
        const districtCfg = store.borders.district;
        map.addLayer({
          id: 'macro-korea-sgg',
          type: 'line',
          source: 'korea-sgg',
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: districtCfg.enabled ? 'visible' : 'none' },
          paint: {
            'line-color': districtCfg.color,
            'line-width': ['interpolate', ['linear'], ['zoom'],
              6, districtCfg.width * 0.5, 9, districtCfg.width, 13, districtCfg.width * 1.8,
            ],
            'line-opacity': 0.8,
          },
        });
      })
      .catch((e) => console.warn('Korea sgg GeoJSON load failed', e));
  }
}

function interpolateGreatCircle(from: [number, number], to: [number, number], steps: number): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lng = from[0] + (to[0] - from[0]) * t;
    const lat = from[1] + (to[1] - from[1]) * t;
    const arc = Math.sin(Math.PI * t) * 8;
    coords.push([lng, lat + arc * 0.12]);
  }
  return coords;
}
