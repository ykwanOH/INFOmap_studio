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

const EXTRA_LOOK_FILTERS: Record<string, string> = {
  monotone: 'grayscale(1) contrast(1.1) brightness(1.05)',
  vintage: 'sepia(0.55) contrast(1.05) brightness(0.95) saturate(0.8) hue-rotate(-8deg)',
  digital: 'saturate(1.6) contrast(1.15) brightness(1.05) hue-rotate(10deg)',
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
  // countries.geojson 최초 1회 로드
  useEffect(() => {
    fetch('/countries.geojson')
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(data => {
        countriesRef.current = data;
        console.log(`[Pick] countries.geojson loaded: ${data.features?.length} features`);
      })
      .catch(e => console.error('[Pick] countries.geojson load FAILED:', e));
  }, []);
  const styleLoadedRef = useRef(false);

  const {
    setMapInstance, setZoom,
    mapStyle, viewMode,
    borders, colors,
    showLabels, showRoads,
    terrainExaggeration, hillshadeEnabled,
    isDrawingRoute, activeRouteColor, activeRouteWidth,
    draftPoints, draftDragPoint, addDraftPoint, undoLastDraftPoint, commitRoute,
    routes, selectRoute,
    flyFromPickMode, flyToPickMode, setFlyRouteFrom, setFlyRouteTo, setFlyFromPickMode, setFlyToPickMode,
    flyRoute,
    pickMode, addPickedFeature, pickedFeatures, pickDisplayMode, pickUnitMode,
    extraLook,
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
      applyRoadVisibility(map, store.showRoads);
      applyRoadWidthOverride(map); // 초기 스타일 = 벡터
      // ★ idle 후 재적용: 'load' 직후 일부 레이어가 아직 초기화 중일 수 있어
      //   setLayoutProperty가 silently fail하는 경우를 보완.
      map.once('idle', () => {
        applyColors(map, store.colors);
        applyRoadVisibility(map, store.showRoads);
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
      applyRoadVisibility(map, store.showRoads);
      // 벡터/위성 모두 line-width 명시: width를 직접 찍으면
      // setLayoutProperty('visibility') 타이밍 실패를 우회하고
      // 레이어가 확실히 렌더링 파이프라인에 진입함
      applyRoadWidthOverride(map);
      // ★ idle 후 재적용: 스타일 전환 직후 레이어가 완전히 초기화되지 않은 경우 보완
      map.once('idle', () => {
        applyColors(map, store.colors);
        applyRoadVisibility(map, store.showRoads);
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
    applyRoadVisibility(map, showRoads);
  }, [colors]);

  // ── Label visibility ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    applyLabelVisibility(map, showLabels);
    // showLabels 변경 시 도로 레이블도 재적용 (도로 레이블은 showLabels && showRoads 둘 다 필요)
    applyRoadVisibility(map, showRoads);
  }, [showLabels]);

  // ── Road visibility ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    applyRoadVisibility(map, showRoads);
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

  // ── Hillshade ───────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    try {
      if (!map.getSource('mapbox-dem')) {
        map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512 });
      }
      if (hillshadeEnabled) {
        if (!map.getLayer('hillshade-layer')) {
          map.addLayer({ id: 'hillshade-layer', type: 'hillshade', source: 'mapbox-dem',
            paint: { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': '#473B24' } as any,
          }, 'water');
        } else {
          map.setLayoutProperty('hillshade-layer', 'visibility', 'visible');
        }
      } else {
        if (map.getLayer('hillshade-layer')) map.setLayoutProperty('hillshade-layer', 'visibility', 'none');
      }
    } catch (e) {}
  }, [hillshadeEnabled]);

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
      // 실선은 dasharray 없음, 점선은 도트 간격으로
      if (!isDashed) {
        map.setPaintProperty('route-draw-line', 'line-dasharray', [1]);
      }
    }

    // 2) Draft dots source — Haversine 균등 샘플링
    const draftDotsSource = map.getSource('route-draw-dots') as mapboxgl.GeoJSONSource | undefined;
    if (draftDotsSource) {
      const previewPts: Array<[number, number]> = draftDragPoint && draftPoints.length >= 1
        ? [...draftPoints, draftDragPoint]
        : draftPoints;
      const coords = previewPts.length >= 2 ? catmullRomToGeojson(previewPts, 256) : previewPts;
      const dotRadius = activeRouteWidth / 2;
      let dotFeatures: GeoJSON.Feature[] = [];
      if (isDashed && coords.length >= 2) {
        // 총 길이 기준 도트 개수: 도트 지름 * 2.5 간격으로 몇 개 들어가는지
        // 화면 픽셀 대신 km 기준: 1° ≈ 111km 참고, width px를 고정 km로 환산 불가
        // → 총 길이(km) / (width * 0.12) 개수로 결정 (경험값, 줌 무관하게 시각적 균등)
        const totalKm = totalLengthKm(coords);
        const dotCount = Math.max(2, Math.round(totalKm / (activeRouteWidth * 0.12)));
        const dotPts = sampleEvenlyByCount(coords, dotCount);
        dotFeatures = dotPts.map((pt) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: pt },
          properties: { color: activeRouteColor, radius: dotRadius },
        }));
      }
      draftDotsSource.setData({ type: 'FeatureCollection', features: dotFeatures });
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
            // 점선은 투명(dot 레이어로 표현) — 히트영역은 width 유지
            lineOpacity: route.lineStyle === 'dashed' ? 0 : 0.95,
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
          // 끝 방향: 마지막 몇 점 평균으로 안정화 (단일 점 noise 방지)
          const fromIdx = Math.max(0, n - Math.min(8, Math.floor(n * 0.05) + 2));
          const bearing = calcBearing(coords[fromIdx], coords[n - 1]);
          features.push({
            type: 'Feature',
            id: `${route.id}-end`,
            geometry: { type: 'Point', coordinates: route.points[route.points.length - 1] },
            properties: { id: route.id, color: route.color, capStyle: route.capStyle, role: 'end', width: route.width, bearing },
          });
        }
        // 도트 — Haversine 균등 샘플링
        if (route.lineStyle === 'dashed') {
          const dotCoords = catmullRomToGeojson(route.points, 256);
          const totalKm = totalLengthKm(dotCoords);
          const dotCount = Math.max(2, Math.round(totalKm / (route.width * 0.12)));
          const dotPts = sampleEvenlyByCount(dotCoords, dotCount);
          dotPts.forEach((pt, idx) => {
            features.push({
              type: 'Feature',
              id: `${route.id}-dot-${idx}`,
              geometry: { type: 'Point', coordinates: pt },
              properties: { id: route.id, color: route.color, role: 'dot', width: route.width },
            });
          });
        }
      }
      committedSource.setData({ type: 'FeatureCollection', features });
    }
  }, [draftPoints, draftDragPoint, activeRouteColor, activeRouteWidth, routes]);

  // ── Fly route visualization ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const source = map.getSource('fly-route') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const features: GeoJSON.Feature[] = [];
    if (flyRoute.from) {
      features.push({ type: 'Feature',
        geometry: { type: 'Point', coordinates: [flyRoute.from.lng, flyRoute.from.lat] },
        properties: { name: flyRoute.from.name, pointType: 'from' },
      });
    }
    if (flyRoute.to) {
      features.push({ type: 'Feature',
        geometry: { type: 'Point', coordinates: [flyRoute.to.lng, flyRoute.to.lat] },
        properties: { name: flyRoute.to.name, pointType: 'to' },
      });
    }
    if (flyRoute.from && flyRoute.to && flyRoute.showLine) {
      const coords = interpolateGreatCircle(
        [flyRoute.from.lng, flyRoute.from.lat],
        [flyRoute.to.lng, flyRoute.to.lat],
        80
      );
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} });
    }
    source.setData({ type: 'FeatureCollection', features });
    if (map.getLayer('fly-route-line')) {
      map.setPaintProperty('fly-route-line', 'line-dasharray', flyRoute.lineStyle === 'dashed' ? [3, 2] : [1, 0]);
      map.setLayoutProperty('fly-route-line', 'visibility', flyRoute.showLine ? 'visible' : 'none');
    }
    if (map.getLayer('fly-route-points')) {
      map.setLayoutProperty('fly-route-points', 'visibility', 'visible');
    }
  }, [flyRoute]);

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
        },
      }));

    const baseSrc = map.getSource('picked-features') as mapboxgl.GeoJSONSource | undefined;
    baseSrc?.setData({ type: 'FeatureCollection', features: baseFeatures });

    if (pickDisplayMode === 'extrude') {
      if (map.getLayer('picked-extrude'))       map.setLayoutProperty('picked-extrude', 'visibility', 'visible');
      if (map.getLayer('picked-float-extrude')) map.setLayoutProperty('picked-float-extrude', 'visibility', 'none');
      if (map.getLayer('picked-fill'))          map.setPaintProperty('picked-fill', 'fill-opacity', 0.2);
    } else {
      // floating 모드
      if (map.getLayer('picked-extrude'))       map.setLayoutProperty('picked-extrude', 'visibility', 'none');
      if (map.getLayer('picked-fill'))          map.setPaintProperty('picked-fill', 'fill-opacity', 0.35);

      const SLAB = 8000;
      const floatFeatures: GeoJSON.Feature[] = pickedFeatures
        .filter((f) => !!(f as any).geometry && (f.floatHeight ?? 0) > 0)
        .map((f) => ({
          type: 'Feature' as const,
          geometry: (f as any).geometry as GeoJSON.Geometry,
          properties: {
            fillColor: f.fillColor,
            floatBase: f.floatHeight ?? 0,
            floatTop: (f.floatHeight ?? 0) + SLAB,
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

  // ── Extra Look — CSS filter overlay on map canvas ───────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const canvas = container.querySelector('canvas');
    if (!canvas) return;
    if (extraLook && EXTRA_LOOK_FILTERS[extraLook]) {
      canvas.style.filter = EXTRA_LOOK_FILTERS[extraLook];
      // Scanline for vintage
      let scanline = container.querySelector('#macro-scanline') as HTMLDivElement | null;
      if (extraLook === 'vintage') {
        if (!scanline) {
          scanline = document.createElement('div');
          scanline.id = 'macro-scanline';
          scanline.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;background-image:repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.07) 2px,rgba(0,0,0,0.07) 4px);';
          container.appendChild(scanline);
        }
      } else {
        scanline?.remove();
      }
      // Grid for digital
      let grid = container.querySelector('#macro-grid') as HTMLDivElement | null;
      if (extraLook === 'digital') {
        if (!grid) {
          grid = document.createElement('div');
          grid.id = 'macro-grid';
          grid.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;background-image:linear-gradient(rgba(0,120,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,120,255,0.04) 1px,transparent 1px);background-size:24px 24px;';
          container.appendChild(grid);
        }
      } else {
        grid?.remove();
      }
    } else {
      canvas.style.filter = '';
      container.querySelector('#macro-scanline')?.remove();
      container.querySelector('#macro-grid')?.remove();
    }
  }, [extraLook]);

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
                geometry: found.geometry,
                meta: { type: 'country', name: props.name, iso_n3: props.iso_n3 },
              } as any);
            }
          }
          return;
        }

        if (unit === 'state') {
          // ── 주/도 단위 ──
          // 한국: sgg(시군구) 또는 sido(광역)
          const koFeats = map.queryRenderedFeatures(e.point, { layers: ['korea-sgg-fill', 'korea-sido-fill'] });
          if (koFeats.length > 0) {
            const feat = koFeats[0];
            // zoom 7 이상이면 sgg(시군구), 미만이면 sido(광역)
            const usesSgg = map.getZoom() >= 7;
            if (usesSgg) {
              const sgg = feat.properties?.sgg as string | undefined;
              if (sgg) {
                addPickedFeature({
                  id: `korea-sgg-${sgg}`,
                  sourceLayer: 'korea-sgg',
                  fillColor: '#4a90d9', borderColor: '#2a5a9a', borderWidth: 1.5, floatHeight: 0,
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
                geometry: feat.geometry,
                meta: { type: 'korea-sido', sido, sidonm: feat.properties?.sidonm },
              } as any);
              return;
            }
          }
          // 한국 외: Mapbox admin_1 레이어
          const adminFeats = map.queryRenderedFeatures(e.point, { layers: ['admin-1-boundary', 'macro-admin-state'] });
          const adminTarget = adminFeats[0] || null;
          if (adminTarget?.geometry) {
            addPickedFeature({
              id: String(adminTarget.id ?? pickId),
              sourceLayer: adminTarget.layer?.['source-layer'] || '',
              fillColor: '#4a90d9', borderColor: '#2a5a9a', borderWidth: 1.5, floatHeight: 0,
              geometry: adminTarget.geometry,
            } as any);
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

function applyRoadVisibility(map: mapboxgl.Map, visible: boolean) {
  try {
    const style = map.getStyle();
    if (!style?.layers) return;

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

        // ★ minzoom 직접 설정 — 근본적인 줌 레벨 제어
        // expressway: zoom 7 미만 숨김
        // street/local: zoom 12.5 미만 숨김
        if (tier === 'expressway') {
          map.setLayerZoomRange(id, 7, 24);
        } else {
          map.setLayerZoomRange(id, 12.5, 24);
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
    // 메인 라인 (실선 전용 — 점선은 dot 레이어로)
    map.addLayer({
      id: 'routes-committed-line',
      type: 'line',
      source: 'routes-committed',
      filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!=', ['get', 'lineStyle'], 'dashed']],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-opacity': ['coalesce', ['get', 'lineOpacity'], 0.95],
      },
    });
    // 점선: 도트 포인트 레이어
    map.addLayer({
      id: 'routes-committed-dots',
      type: 'circle',
      source: 'routes-committed',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': ['/', ['get', 'width'], 1.6],
        'circle-color': ['get', 'color'],
        'circle-opacity': ['case', ['==', ['get', 'role'], 'dot'], 0.88, 0],
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
    map.addLayer({ id: 'fly-route-line', type: 'line', source: 'fly-route',
      filter: ['==', ['geometry-type'], 'LineString'],
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#e05c2a', 'line-width': 2.5, 'line-dasharray': [1, 0] },
    });
    map.addLayer({ id: 'fly-route-points', type: 'circle', source: 'fly-route',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 7, 'circle-color': '#e05c2a', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff' },
    });
  }
  // picked-extrude 소스: extrude 모드용 (base=0, height=floatHeight)
  if (!map.getSource('picked-features')) {
    map.addSource('picked-features', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // flat fill/border: 항상 렌더 (extrude 모드에서도 바닥 표시)
    map.addLayer({ id: 'picked-fill', type: 'fill', source: 'picked-features',
      paint: { 'fill-color': ['get', 'fillColor'], 'fill-opacity': 0.35 },
    });
    map.addLayer({ id: 'picked-border', type: 'line', source: 'picked-features',
      paint: { 'line-color': ['get', 'borderColor'], 'line-width': ['get', 'borderWidth'] },
    });
    // extrude 레이어: extrude 모드 전용
    map.addLayer({ id: 'picked-extrude', type: 'fill-extrusion', source: 'picked-features',
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': ['get', 'fillColor'],
        'fill-extrusion-height': ['get', 'extrudeHeight'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.75,
      },
    });
  }
  // picked-float 소스: floating 모드용 (복사본이 공중에 뜸)
  if (!map.getSource('picked-float')) {
    map.addSource('picked-float', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'picked-float-extrude', type: 'fill-extrusion', source: 'picked-float',
      layout: { visibility: 'none' },
      paint: {
        'fill-extrusion-color': ['get', 'fillColor'],
        'fill-extrusion-height': ['get', 'floatTop'],
        'fill-extrusion-base': ['get', 'floatBase'],
        'fill-extrusion-opacity': 0.85,
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
