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
  const styleLoadedRef = useRef(false);

  const {
    setMapInstance, setZoom,
    mapStyle, viewMode,
    borders, colors,
    showLabels, showRoads,
    terrainExaggeration, hillshadeEnabled,
    isDrawingRoute, routeColor, addRoutePoint, routePoints,
    flyFromPickMode, flyToPickMode, setFlyRouteFrom, setFlyRouteTo, setFlyFromPickMode, setFlyToPickMode,
    flyRoute,
    pickMode, addPickedFeature, pickedFeatures,
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
      projection: 'globe' as any,
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
    map.on('zoom', () => setZoom(parseFloat(map.getZoom().toFixed(2))));
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
  // country  : Mapbox admin_0 (국경)
  // state    : Mapbox admin_1 (주경계) + 한국 sido 레벨 GeoJSON
  // district : 한국 sgg 레벨 GeoJSON (서울 25구, 각 도 시군)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;

    // ── 국경 (country) ──────────────────────────────────────────────────
    const countryCfg = borders.country;
    const countryLayerId = 'macro-admin-country';
    if (!map.getLayer(countryLayerId)) {
      const src = findVectorSource(map);
      if (src) {
        try {
          map.addLayer({
            id: countryLayerId,
            type: 'line',
            source: src,
            'source-layer': 'admin',
            filter: ['all', ['==', ['get', 'admin_level'], 0], ['==', ['get', 'disputed'], false]],
            layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'visible' },
            paint: {
              'line-color': countryCfg.color,
              // 줌에 따라 선 두께 자동 조절
              'line-width': ['interpolate', ['linear'], ['zoom'],
                3, countryCfg.width * 0.6,
                6, countryCfg.width,
                10, countryCfg.width * 1.4,
              ],
              'line-opacity': 0.9,
            },
          });
        } catch (_) {}
      }
    }
    if (map.getLayer(countryLayerId)) {
      map.setLayoutProperty(countryLayerId, 'visibility', countryCfg.enabled ? 'visible' : 'none');
      map.setPaintProperty(countryLayerId, 'line-color', countryCfg.color);
      map.setPaintProperty(countryLayerId, 'line-width', ['interpolate', ['linear'], ['zoom'],
        3, countryCfg.width * 0.6, 6, countryCfg.width, 10, countryCfg.width * 1.4,
      ]);
    }

    // ── 주/도 경계 (state) — Mapbox admin_1 ─────────────────────────────
    const stateCfg = borders.state;
    const stateLayerId = 'macro-admin-state';
    if (!map.getLayer(stateLayerId)) {
      const src = findVectorSource(map);
      if (src) {
        try {
          map.addLayer({
            id: stateLayerId,
            type: 'line',
            source: src,
            'source-layer': 'admin',
            filter: ['==', ['get', 'admin_level'], 1],
            layout: { 'line-join': 'round', 'line-cap': 'round', visibility: 'none' },
            paint: {
              'line-color': stateCfg.color,
              'line-width': ['interpolate', ['linear'], ['zoom'],
                4, stateCfg.width * 0.5,
                7, stateCfg.width,
                11, stateCfg.width * 1.6,
              ],
              'line-opacity': 0.85,
            },
          });
        } catch (_) {}
      }
    }
    if (map.getLayer(stateLayerId)) {
      map.setLayoutProperty(stateLayerId, 'visibility', stateCfg.enabled ? 'visible' : 'none');
      map.setPaintProperty(stateLayerId, 'line-color', stateCfg.color);
      map.setPaintProperty(stateLayerId, 'line-width', ['interpolate', ['linear'], ['zoom'],
        4, stateCfg.width * 0.5, 7, stateCfg.width, 11, stateCfg.width * 1.6,
      ]);
    }

    // ── 한국 sido 경계 (state 레벨 오버레이) ────────────────────────────
    const koSidoLayerId = 'macro-korea-sido';
    if (map.getSource('korea-admin')) {
      if (!map.getLayer(koSidoLayerId)) {
        try {
          map.addLayer({
            id: koSidoLayerId,
            type: 'line',
            source: 'korea-admin',
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

    // ── 구/시 경계 (district) — 한국 sgg 레벨 ───────────────────────────
    const districtCfg = borders.district;
    const koSggLayerId = 'macro-korea-sgg';
    if (map.getSource('korea-admin')) {
      if (!map.getLayer(koSggLayerId)) {
        try {
          map.addLayer({
            id: koSggLayerId,
            type: 'line',
            source: 'korea-admin',
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

  // ── Route drawing ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoadedRef.current) return;
    const source = map.getSource('route-draw') as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: routePoints }, properties: {} });
    }
    if (map.getLayer('route-draw-line')) {
      map.setPaintProperty('route-draw-line', 'line-color', routeColor);
      map.setPaintProperty('route-draw-line', 'line-width', 2.5);
    }
  }, [routePoints, routeColor]);

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
    const source = map.getSource('picked-features') as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;
    const features: GeoJSON.Feature[] = pickedFeatures
      .map((f) => ({
        type: 'Feature' as const,
        geometry: (f as any).geometry as GeoJSON.Geometry,
        properties: { fillColor: f.fillColor, borderColor: f.borderColor, borderWidth: f.borderWidth, extrudeHeight: f.extrudeHeight },
      }))
      .filter((f) => !!f.geometry);
    source.setData({ type: 'FeatureCollection', features });
  }, [pickedFeatures]);

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
      if (isDrawingRoute) { addRoutePoint([lng, lat]); return; }
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
        const stateOn = store.borders.state.enabled;
        const districtOn = store.borders.district.enabled;

        let target: mapboxgl.MapboxGeoJSONFeature | null = null;
        let pickGeometry: GeoJSON.Geometry | null = null;
        let pickId = `pick-${Date.now()}`;

        if (districtOn) {
          // district ON → 한국 sgg 레벨 우선 (읍면동 → sgg 코드로 그룹)
          const koFeats = map.queryRenderedFeatures(e.point, { layers: ['korea-admin-fill'] });
          if (koFeats.length > 0) {
            const feat = koFeats[0];
            const sgg = feat.properties?.sgg as string | undefined;
            if (sgg) {
              // 같은 sgg 코드의 모든 읍면동 feature를 모아 geometry 반환
              // (실제 dissolve는 export 시 turf로 처리, 여기선 각 읍면동 개별 저장)
              pickId = `korea-sgg-${sgg}`;
              pickGeometry = feat.geometry;
              addPickedFeature({
                id: pickId,
                sourceLayer: 'korea-sgg',
                fillColor: '#4a90d9', borderColor: '#2a5a9a', borderWidth: 1.5, extrudeHeight: 0,
                geometry: pickGeometry,
                meta: { type: 'korea-sgg', sgg, sggnm: feat.properties?.sggnm, sidonm: feat.properties?.sidonm },
              } as any);
              return;
            }
          }
        }

        if (stateOn && !districtOn) {
          // state ON, district OFF → 한국 sido 레벨 또는 Mapbox admin_1
          const koFeats = map.queryRenderedFeatures(e.point, { layers: ['korea-admin-fill'] });
          if (koFeats.length > 0) {
            const feat = koFeats[0];
            const sido = feat.properties?.sido as string | undefined;
            if (sido) {
              pickId = `korea-sido-${sido}`;
              pickGeometry = feat.geometry;
              addPickedFeature({
                id: pickId,
                sourceLayer: 'korea-sido',
                fillColor: '#4a90d9', borderColor: '#2a5a9a', borderWidth: 1.5, extrudeHeight: 0,
                geometry: pickGeometry,
                meta: { type: 'korea-sido', sido, sidonm: feat.properties?.sidonm },
              } as any);
              return;
            }
          }
          // 한국 아닌 경우 Mapbox admin_1
          const adminFeats = map.queryRenderedFeatures(e.point, {
            layers: ['macro-admin-state'],
          });
          target = adminFeats[0] || null;
        }

        if (!stateOn || target === null) {
          // country 기준 — Mapbox country-boundaries 폴리곤
          const countryFeats = map.queryRenderedFeatures(e.point, {
            layers: ['country-boundaries', 'admin-0-boundary'],
          });
          const allFeats = map.queryRenderedFeatures(e.point);
          const landFeat = allFeats.find((f) => f.layer?.type === 'fill' && f.geometry?.type === 'Polygon');
          target = countryFeats[0] || landFeat || null;
        }

        if (target && target.geometry) {
          addPickedFeature({
            id: String(target.id ?? pickId),
            sourceLayer: target.layer?.['source-layer'] || '',
            fillColor: '#4a90d9', borderColor: '#2a5a9a', borderWidth: 1.5, extrudeHeight: 0,
            geometry: target.geometry,
          } as any);
        }
        return;
      }
    },
    [isDrawingRoute, flyFromPickMode, flyToPickMode, pickMode, addRoutePoint,
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
          // 이전 값의 75%
          map.setPaintProperty(layer.id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            3, 0.09, 5, 0.16, 7, 0.25, 9, 0.32, 12, 0.45, 15, 0.56,
          ]);
        } else if (tier === 'street') {
          map.setPaintProperty(layer.id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            11, 0, 12.5, 0.29, 14, 0.44, 15, 0.59,
          ]);
          map.setPaintProperty(layer.id, 'line-opacity', 1);
        } else {
          map.setPaintProperty(layer.id, 'line-width', [
            'interpolate', ['linear'], ['zoom'],
            11, 0, 12.5, 0.15, 14, 0.25,
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
  // ★ setLayoutProperty('visibility') 방식 폐기:
  //   'load'/'style.load' 직후 silently fail이 반복됨.
  //   대신 setPaintProperty('line-opacity')로 on/off 제어.
  //   레이어는 항상 visible 상태로 두고 opacity만 0↔1로 전환.
  try {
    const style = map.getStyle();
    if (!style?.layers) return;

    for (const layer of style.layers) {
      const id = layer.id;
      try {
        // 도로명 텍스트 — symbol 레이어는 visibility로만 처리 (opacity 없음)
        if (isLabelLayer(id) && isRoadLayer(id)) {
          map.setLayoutProperty(id, 'visibility', 'none');
          continue;
        }
        // 도로 선 레이어만 처리
        if (!isRoadLineLayer(id, layer.type)) continue;
        const tier = getRoadTier(id);
        if (!tier) continue;

        const show = visible && (tier === 'expressway' || tier === 'street');
        map.setLayoutProperty(id, 'visibility', 'visible');
        map.setPaintProperty(id, 'line-opacity', show ? 1 : 0);
      } catch (e) {
      }
    }
  } catch (e) {
  }
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
  if (sources['composite']) return 'composite';
  return Object.keys(sources).find((k) => (sources[k] as any).type === 'vector') ?? null;
}

function initCustomLayers(map: mapboxgl.Map) {
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
  }
  if (!map.getSource('route-draw')) {
    map.addSource('route-draw', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } });
    map.addLayer({ id: 'route-draw-line', type: 'line', source: 'route-draw',
      layout: { 'line-join': 'round', 'line-cap': 'round' },
      paint: { 'line-color': '#e05c2a', 'line-width': 2.5, 'line-opacity': 0.9 },
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
  if (!map.getSource('picked-features')) {
    map.addSource('picked-features', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'picked-fill', type: 'fill', source: 'picked-features',
      paint: { 'fill-color': ['get', 'fillColor'], 'fill-opacity': 0.55 },
    });
    map.addLayer({ id: 'picked-border', type: 'line', source: 'picked-features',
      paint: { 'line-color': ['get', 'borderColor'], 'line-width': ['get', 'borderWidth'] },
    });
    map.addLayer({ id: 'picked-extrude', type: 'fill-extrusion', source: 'picked-features',
      paint: {
        'fill-extrusion-color': ['get', 'fillColor'],
        'fill-extrusion-height': ['get', 'extrudeHeight'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.7,
      },
    });
  }

  // ── 위성뷰 도로 굵기 override ─────────────────────────────────────────
  // 위성뷰 기본 도로가 너무 굵으므로 원래 대비 50% 수준으로 조절
  // Z5이하: 50%, Z5-7: 60%, Z7이후: 60% 유지, Z9 급증 억제
  // 위성 스타일일 때 도로 굵기 override는 style.load 콜백에서 applyRoadWidthOverride(map)로 처리

  // ── 한국 행정구역 GeoJSON (lazy load) ──────────────────────────────────
  // public/korea_admin.geojson — 읍면동 레벨 (3558개)
  // sido(2자리): 17개 광역, sgg(5자리): 252개 시군구
  if (!map.getSource('korea-admin')) {
    fetch('/korea_admin.geojson')
      .then((r) => r.json())
      .then((data) => {
        if (map.getSource('korea-admin')) return; // 이미 추가됨
        map.addSource('korea-admin', { type: 'geojson', data, generateId: true });

        // fill 레이어 (pick 클릭용 — 투명, 클릭 히트박스 역할)
        map.addLayer({
          id: 'korea-admin-fill',
          type: 'fill',
          source: 'korea-admin',
          paint: { 'fill-color': 'transparent', 'fill-opacity': 0 },
        });

        // 현재 border 상태 즉시 반영 (레이어는 borders effect가 처리)
        const store = useMapStore.getState();
        const stateCfg = store.borders.state;
        const districtCfg = store.borders.district;

        map.addLayer({
          id: 'macro-korea-sido',
          type: 'line',
          source: 'korea-admin',
          layout: { 'line-join': 'round', 'line-cap': 'round', visibility: stateCfg.enabled ? 'visible' : 'none' },
          paint: {
            'line-color': stateCfg.color,
            'line-width': ['interpolate', ['linear'], ['zoom'],
              4, stateCfg.width * 0.5, 7, stateCfg.width, 11, stateCfg.width * 1.6,
            ],
            'line-opacity': 0.9,
          },
        });

        map.addLayer({
          id: 'macro-korea-sgg',
          type: 'line',
          source: 'korea-admin',
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
      .catch((e) => console.warn('Korea GeoJSON load failed', e));
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
