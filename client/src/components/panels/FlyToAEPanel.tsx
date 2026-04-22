/**
 * MACRO Map Studio — Fly To AE Panel (v2)
 * - 아이콘: plane(포물선/거리비례), ship(평면), missile(고각)
 * - 라인: 3D 고도 LineString
 * - FLY: 자동 3D 전환 + 아이콘별 카메라 시퀀스
 * - to AE: 배경 캡처 + 3점 키프레임 JSX
 */

import { useState, useRef, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore, type RouteIconType } from '@/store/useMapStore';
import { SectionPanel, Toggle } from '@/components/ui/SectionPanel';
import { MapPin, Play, FileDown, Upload } from 'lucide-react';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
};

// ── SVG 아이콘 정의 ───────────────────────────────────────────────────────────
const PLANE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g transform="translate(32,32) rotate(-45) translate(-32,-32)">
    <path d="M32 6 L40 28 H58 L44 36 L48 58 L32 46 L16 58 L20 36 L6 28 H24 Z"
      fill="white" stroke="#2a2a2a" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="32" cy="30" rx="6" ry="20" fill="#ddd" stroke="#2a2a2a" stroke-width="1.5"/>
  </g>
</svg>`;

const SHIP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <path d="M10 40 Q32 28 54 40 L50 52 Q32 58 14 52 Z"
    fill="white" stroke="#2a2a2a" stroke-width="2" stroke-linejoin="round"/>
  <rect x="29" y="20" width="5" height="20" fill="white" stroke="#2a2a2a" stroke-width="1.5"/>
  <path d="M34 20 L50 30 L34 32 Z" fill="#eee" stroke="#2a2a2a" stroke-width="1.2"/>
  <path d="M29 20 L14 30 L29 32 Z" fill="#eee" stroke="#2a2a2a" stroke-width="1.2"/>
  <rect x="24" y="38" width="16" height="6" rx="2" fill="#ccc" stroke="#2a2a2a" stroke-width="1"/>
</svg>`;

const MISSILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g transform="translate(32,32) rotate(-60) translate(-32,-32)">
    <ellipse cx="32" cy="28" rx="7" ry="18" fill="white" stroke="#2a2a2a" stroke-width="2"/>
    <path d="M32 8 L25 18 L39 18 Z" fill="#e05c2a" stroke="#2a2a2a" stroke-width="1.5"/>
    <path d="M25 40 L14 54 L32 46 Z" fill="#999" stroke="#2a2a2a" stroke-width="1.2"/>
    <path d="M39 40 L50 54 L32 46 Z" fill="#999" stroke="#2a2a2a" stroke-width="1.2"/>
    <rect x="28" y="22" width="8" height="12" rx="2" fill="#ddd"/>
  </g>
</svg>`;

// ── SVG → Canvas 래스터라이즈 ─────────────────────────────────────────────────
function svgToCanvas(svgStr: string, size = 56): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(document.createElement('canvas')); };
    img.src = url;
  });
}

// ── Haversine 거리 (km) ───────────────────────────────────────────────────────
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

// ── bearing 계산 ──────────────────────────────────────────────────────────────
function calcBearing(from: [number, number], to: [number, number]): number {
  const dLng = (to[0] - from[0]) * Math.PI / 180;
  const lat1 = from[1] * Math.PI / 180;
  const lat2 = to[1] * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── 3D 포물선 좌표 ────────────────────────────────────────────────────────────
function build3DArc(
  from: [number, number],
  to: [number, number],
  iconType: RouteIconType,
  steps = 80
): [number, number, number][] {
  const distKm = haversineKm(from, to);
  let maxAltM: number;
  if (iconType === 'missile') {
    maxAltM = Math.max(1_500_000, distKm * 1500);
  } else if (iconType === 'plane' || iconType === 'custom') {
    maxAltM = Math.max(60_000, distKm * 900);
  } else {
    maxAltM = 0; // ship: 평면
  }
  const coords: [number, number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lng = from[0] + (to[0] - from[0]) * t;
    const lat = from[1] + (to[1] - from[1]) * t;
    const alt = maxAltM * Math.sin(Math.PI * t);
    coords.push([lng, lat, Math.round(alt)]);
  }
  return coords;
}

// ── 아이콘 맵 등록 ────────────────────────────────────────────────────────────
async function registerIcon(map: mapboxgl.Map, iconType: RouteIconType, customUrl?: string | null) {
  const size = 56;
  let canvas: HTMLCanvasElement;

  if (iconType === 'custom' && customUrl) {
    canvas = await new Promise((res) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        c.getContext('2d')!.drawImage(img, 0, 0, size, size);
        res(c);
      };
      img.onerror = async () => res(await svgToCanvas(PLANE_SVG, size));
      img.src = customUrl;
    });
  } else {
    const svg = iconType === 'ship' ? SHIP_SVG : iconType === 'missile' ? MISSILE_SVG : PLANE_SVG;
    canvas = await svgToCanvas(svg, size);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imageData = ctx.getImageData(0, 0, size, size);
  const id = 'fly-icon';
  if (map.hasImage(id)) map.removeImage(id);
  map.addImage(id, { width: size, height: size, data: new Uint8Array(imageData.data) });
}

export function FlyToAEPanel() {
  const {
    flyRoute,
    setFlyRouteFrom, setFlyRouteTo,
    setFlyRouteLineStyle, setFlyRouteShowLine, setFlyRouteShowIcon, setFlyRouteIconType,
    setFlyRouteCustomIcon,
    flyFromPickMode, setFlyFromPickMode,
    flyToPickMode, setFlyToPickMode,
    mapInstance,
    setViewMode,
  } = useMapStore();

  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const geocode = async (query: string) => {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&types=place,locality,region,country&limit=1`
    );
    const data = await res.json();
    if (data.features?.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lng, lat, name: data.features[0].place_name };
    }
    return null;
  };

  const handleSetFrom = async () => {
    if (!fromSearch.trim()) { setFlyFromPickMode(!flyFromPickMode); return; }
    const pt = await geocode(fromSearch);
    if (pt) { setFlyRouteFrom(pt); setFromSearch(''); }
  };

  const handleSetTo = async () => {
    if (!toSearch.trim()) { setFlyToPickMode(!flyToPickMode); return; }
    const pt = await geocode(toSearch);
    if (pt) { setFlyRouteTo(pt); setToSearch(''); }
  };

  // ── 3D 라인 + 아이콘 맵 업데이트 ────────────────────────────────────────
  const refresh3D = useCallback(async (map: mapboxgl.Map) => {
    if (!flyRoute.from || !flyRoute.to) return;
    const from: [number, number] = [flyRoute.from.lng, flyRoute.from.lat];
    const to: [number, number] = [flyRoute.to.lng, flyRoute.to.lat];
    const coords3d = build3DArc(from, to, flyRoute.iconType);

    const ptFeatures: GeoJSON.Feature[] = [
      { type: 'Feature', geometry: { type: 'Point', coordinates: from }, properties: { role: 'from' } },
      { type: 'Feature', geometry: { type: 'Point', coordinates: to }, properties: { role: 'to' } },
    ];
    const lineFeature: GeoJSON.Feature = {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords3d },
      properties: {},
    };
    const source = map.getSource('fly-route') as mapboxgl.GeoJSONSource | undefined;
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: flyRoute.showLine ? [lineFeature, ...ptFeatures] : ptFeatures,
      });
    }
    if (map.getLayer('fly-route-line')) {
      map.setLayoutProperty('fly-route-line', 'visibility', flyRoute.showLine ? 'visible' : 'none');
      map.setPaintProperty('fly-route-line', 'line-dasharray',
        flyRoute.lineStyle === 'dashed' ? [1.2, 2.0] : [1]);
    }

    // 아이콘 — 정점에 표시
    if (flyRoute.showIcon) {
      await registerIcon(map, flyRoute.iconType, flyRoute.customIconUrl);
      const midIdx = Math.floor(coords3d.length / 2);
      const iconSrc = map.getSource('fly-icon-source') as mapboxgl.GeoJSONSource | undefined;
      if (iconSrc) {
        iconSrc.setData({
          type: 'FeatureCollection',
          features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: coords3d[midIdx] }, properties: {} }],
        });
      }
      if (map.getLayer('fly-icon-layer')) map.setLayoutProperty('fly-icon-layer', 'visibility', 'visible');
    } else {
      if (map.getLayer('fly-icon-layer')) map.setLayoutProperty('fly-icon-layer', 'visibility', 'none');
    }
  }, [flyRoute]);

  // ── FLY 버튼 ─────────────────────────────────────────────────────────────
  const handleFly = useCallback(async () => {
    if (!mapInstance || !flyRoute.from || !flyRoute.to || isAnimating) return;

    // 1) 3D 자동 전환
    setViewMode('3d');
    mapInstance.easeTo({ pitch: 50, duration: 500 });

    const from: [number, number] = [flyRoute.from.lng, flyRoute.from.lat];
    const to: [number, number] = [flyRoute.to.lng, flyRoute.to.lat];
    const distKm = haversineKm(from, to);
    const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];

    let maxAltM: number;
    if (flyRoute.iconType === 'missile') maxAltM = Math.max(1_500_000, distKm * 1500);
    else if (flyRoute.iconType === 'plane' || flyRoute.iconType === 'custom') maxAltM = Math.max(60_000, distKm * 900);
    else maxAltM = 0;

    // 줌 계산: 고도가 높을수록 더 빠짐
    const peakZoom = Math.max(1.5, 7 - Math.log2(maxAltM / 80_000 + 1) * 1.2);

    setIsAnimating(true);
    await refresh3D(mapInstance);

    if (flyRoute.iconType === 'ship') {
      // 출발(줌7) → 전체 경로 맞추기 (최소줌 2.7)
      mapInstance.flyTo({ center: from, zoom: 7, pitch: 50, duration: 1000 });
      setTimeout(() => {
        const bounds = new mapboxgl.LngLatBounds(
          [Math.min(from[0], to[0]) - 2, Math.min(from[1], to[1]) - 2],
          [Math.max(from[0], to[0]) + 2, Math.max(from[1], to[1]) + 2]
        );
        mapInstance.fitBounds(bounds, { pitch: 50, padding: 80, duration: 2200, maxZoom: 7, minZoom: 2.7 });
        setTimeout(() => setIsAnimating(false), 2400);
      }, 1100);

    } else if (flyRoute.iconType === 'missile') {
      // 출발(줌7) → 정점 → 도착 방향 +1줌
      const arrivalBearing = calcBearing(mid, to);
      mapInstance.flyTo({ center: from, zoom: 7, pitch: 50, duration: 900 });
      setTimeout(() => {
        mapInstance.flyTo({ center: mid, zoom: peakZoom, pitch: 50, duration: 1800 });
        setTimeout(() => {
          mapInstance.flyTo({ center: to, zoom: peakZoom + 1, bearing: arrivalBearing, pitch: 50, duration: 1400 });
          setTimeout(() => setIsAnimating(false), 1500);
        }, 1900);
      }, 1000);

    } else {
      // plane / custom: 출발(줌7) → 정점 → 도착(줌7)
      mapInstance.flyTo({ center: from, zoom: 7, pitch: 50, duration: 900 });
      setTimeout(() => {
        mapInstance.flyTo({ center: mid, zoom: peakZoom, pitch: 50, duration: 1800 });
        setTimeout(() => {
          mapInstance.flyTo({ center: to, zoom: 7, pitch: 50, duration: 1400 });
          setTimeout(() => setIsAnimating(false), 1500);
        }, 1900);
      }, 1000);
    }
  }, [mapInstance, flyRoute, isAnimating, setViewMode, refresh3D]);

  // ── to AE ─────────────────────────────────────────────────────────────────
  const handleExportToAE = useCallback(async () => {
    if (!mapInstance || !flyRoute.from || !flyRoute.to) return;
    setExportStatus('3D 뷰 전환 중...');

    const { from: fr, to: tr, lineStyle, iconType } = flyRoute;
    const fromPt: [number, number] = [fr.lng, fr.lat];
    const toPt: [number, number] = [tr.lng, tr.lat];
    const distKm = haversineKm(fromPt, toPt);

    // 3D 전환 + 전체 경로 뷰
    setViewMode('3d');
    mapInstance.easeTo({ pitch: 50, duration: 400 });
    const bounds = new mapboxgl.LngLatBounds(
      [Math.min(fr.lng, tr.lng) - 4, Math.min(fr.lat, tr.lat) - 4],
      [Math.max(fr.lng, tr.lng) + 4, Math.max(fr.lat, tr.lat) + 4]
    );
    mapInstance.fitBounds(bounds, { pitch: 50, padding: 80, duration: 1000 });
    await new Promise(r => setTimeout(r, 1400));
    await new Promise<void>(r => {
      mapInstance.once('idle', r);
      mapInstance.triggerRepaint();
      setTimeout(r, 2500);
    });

    setExportStatus('지도 캡처 중...');

    // 픽셀 좌표 계산
    const fromPx = mapInstance.project([fr.lng, fr.lat]);
    const toPx   = mapInstance.project([tr.lng, tr.lat]);
    const midLng = (fr.lng + tr.lng) / 2;
    const midLat = (fr.lat + tr.lat) / 2;
    const midPx  = mapInstance.project([midLng, midLat]);

    const canvas = mapInstance.getCanvas();
    const cW = canvas.width;
    const cH = canvas.height;

    // 배경 캡처
    const bgDataUrl = canvas.toDataURL('image/png');

    let maxAltM: number;
    if (iconType === 'missile') maxAltM = Math.max(1_500_000, distKm * 1500);
    else if (iconType === 'plane' || iconType === 'custom') maxAltM = Math.max(60_000, distKm * 900);
    else maxAltM = 0;

    // AE Z 변환 (고도 m → AE Z px: 1000km ≈ -600px)
    const peakZ = -(maxAltM / 1_000_000) * 600;
    const totalDuration = Math.max(4, Math.min(14, distKm / 400));
    const now = new Date().toISOString();

    const jsx = `// ================================================================
// MACRO Map Studio — Fly To AE Script  v2
// Generated : ${now}
// From      : ${fr.name}
// To        : ${tr.name}
// Distance  : ${distKm.toFixed(0)} km  |  Icon: ${iconType}  |  Line: ${lineStyle}
// Duration  : ${totalDuration.toFixed(1)}s
// Map capture size: ${cW} x ${cH} px
// ================================================================

(function macroMapFlyTo() {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    alert("열려 있는 Composition이 없습니다.\\nComposition을 먼저 열거나 새로 만드세요.");
    return;
  }

  app.beginUndoGroup("MACRO Map FlyTo");

  var compW = comp.width;
  var compH = comp.height;
  var fps   = comp.frameRate;
  var dur   = ${totalDuration.toFixed(2)};

  // 캡처 이미지 → 컴프 픽셀 스케일
  var sx = compW / ${cW};
  var sy = compH / ${cH};

  // 3개 키프레임 좌표
  var fromPx = [${fromPx.x.toFixed(1)} * sx, ${fromPx.y.toFixed(1)} * sy];
  var midPx  = [${midPx.x.toFixed(1)}  * sx, ${midPx.y.toFixed(1)}  * sy];
  var toPx   = [${toPx.x.toFixed(1)}   * sx, ${toPx.y.toFixed(1)}   * sy];

  // Z 깊이 (카메라 거리)
  var zClose = -compH * 0.85;        // 클로즈업 거리
  var zPeak  = ${peakZ.toFixed(0)} * (compH / ${cH}); // 포물선 정점
  ${iconType === 'missile'
    ? `var zArrive = zPeak + compH * 0.45; // 미사일: 도착에서 반만 당김`
    : `var zArrive = zClose;               // plane/ship: 도착도 클로즈업`}

  // ── 카메라 ──────────────────────────────────────────────────────
  var cam = comp.layers.addCamera("MACRO Fly Camera", [compW / 2, compH / 2]);
  cam.inPoint  = 0;
  cam.outPoint = dur;

  var camPos = cam.property("Transform").property("Position");
  var camPOI = cam.property("Transform").property("Point of Interest");

  camPos.setValueAtTime(0,         [fromPx[0], fromPx[1], zClose]);
  camPos.setValueAtTime(dur * 0.5, [midPx[0],  midPx[1],  zPeak]);
  camPos.setValueAtTime(dur,       [toPx[0],   toPx[1],   zArrive]);

  camPOI.setValueAtTime(0,         [fromPx[0], fromPx[1], 0]);
  camPOI.setValueAtTime(dur * 0.5, [midPx[0],  midPx[1],  0]);
  camPOI.setValueAtTime(dur,       [toPx[0],   toPx[1],   0]);

  // 이즈 인/아웃
  var easeIn  = [new KeyframeEase(0, 60)];
  var easeOut = [new KeyframeEase(0, 60)];
  for (var ki = 1; ki <= camPos.numKeys; ki++) {
    camPos.setTemporalEaseAtKey(ki, easeIn, easeOut);
    camPOI.setTemporalEaseAtKey(ki, easeIn, easeOut);
  }

  // ── 경로 Null (참조용) ───────────────────────────────────────────
  var pathNull = comp.layers.addNull();
  pathNull.name = "Route Path Null";
  pathNull.enabled = false;
  pathNull.inPoint = 0; pathNull.outPoint = dur;
  var nPos = pathNull.property("Transform").property("Position");
  nPos.setValueAtTime(0,         [fromPx[0], fromPx[1]]);
  nPos.setValueAtTime(dur * 0.5, [midPx[0],  midPx[1]]);
  nPos.setValueAtTime(dur,       [toPx[0],   toPx[1]]);

  // ── 아이콘 레이어 ───────────────────────────────────────────────
  var iconStr = "${iconType === 'plane' ? '✈' : iconType === 'ship' ? '⛵' : iconType === 'missile' ? '🚀' : '●'}";
  var iconLyr = comp.layers.addText(iconStr);
  iconLyr.name = "Icon (${iconType})";
  iconLyr.inPoint = 0; iconLyr.outPoint = dur;
  var iPos = iconLyr.property("Transform").property("Position");
  iPos.setValueAtTime(0,         [fromPx[0], fromPx[1]]);
  iPos.setValueAtTime(dur * 0.5, [midPx[0],  midPx[1]]);
  iPos.setValueAtTime(dur,       [toPx[0],   toPx[1]]);
  var td = iconLyr.property("Source Text").value;
  td.fontSize = 44;
  td.fillColor = [1, 1, 1];
  td.justification = ParagraphJustification.CENTER_JUSTIFY;
  iconLyr.property("Source Text").setValue(td);

  app.endUndoGroup();

  alert(
    "MACRO Map Studio — Fly To AE 완료!\\n\\n" +
    "생성 레이어:\\n" +
    "  · MACRO Fly Camera  — Position + POI 키프레임 3개\\n" +
    "  · Route Path Null   — 경로 참조용 (비활성)\\n" +
    "  · Icon (${iconType})\\n\\n" +
    "⚠ 배경 PNG(macro_map_AE_bg_*.png)를 프로젝트에 import 후\\n" +
    "  최하단 레이어로 배치하세요.\\n\\n" +
    "From : ${fr.name.replace(/"/g, "'")}\\n" +
    "To   : ${tr.name.replace(/"/g, "'")}\\n" +
    "거리 : ${distKm.toFixed(0)} km\\n" +
    "Duration : " + dur + "s"
  );
})();`;

    // JSX 다운로드
    const jsxBlob = new Blob([jsx], { type: 'text/plain' });
    const jsxLink = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(jsxBlob),
      download: `macro_flyto_${Date.now()}.jsx`,
    });
    jsxLink.click();

    // 배경 PNG 다운로드
    await new Promise(r => setTimeout(r, 200));
    const bgLink = Object.assign(document.createElement('a'), {
      href: bgDataUrl,
      download: `macro_map_AE_bg_${Date.now()}.png`,
    });
    bgLink.click();

    setExportStatus('✓ JSX + 배경 PNG 저장 완료');
    setTimeout(() => setExportStatus(null), 3000);
  }, [mapInstance, flyRoute, setViewMode]);

  const handleCustomFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFlyRouteCustomIcon(URL.createObjectURL(file));
    setFlyRouteIconType('custom');
  };

  return (
    <SectionPanel sectionKey="flyToAE" title="Fly To AE">

      {/* FROM */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ ...labelStyle, fontWeight: 500 }}>From</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input type="text" className="text-input"
            value={fromSearch} onChange={(e) => setFromSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetFrom()}
            placeholder={flyRoute.from?.name ?? 'City name or pick...'}
            style={{ flex: 1, borderColor: flyFromPickMode ? 'var(--accent)' : undefined }}
          />
          <button className={`action-btn primary ${flyFromPickMode ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}
            onClick={handleSetFrom}>
            <MapPin size={11} />{flyFromPickMode ? '...' : 'Set'}
          </button>
        </div>
        {flyRoute.from && <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)' }}>✓ {flyRoute.from.name.split(',')[0]}</p>}
      </div>

      {/* TO */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ ...labelStyle, fontWeight: 500 }}>To</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input type="text" className="text-input"
            value={toSearch} onChange={(e) => setToSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetTo()}
            placeholder={flyRoute.to?.name ?? 'City name or pick...'}
            style={{ flex: 1, borderColor: flyToPickMode ? 'var(--accent)' : undefined }}
          />
          <button className={`action-btn primary ${flyToPickMode ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}
            onClick={handleSetTo}>
            <MapPin size={11} />{flyToPickMode ? '...' : 'Set'}
          </button>
        </div>
        {flyRoute.to && <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)' }}>✓ {flyRoute.to.name.split(',')[0]}</p>}
      </div>

      <div style={{ height: 1, background: 'var(--glass-border)' }} />

      {/* Route Line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Toggle checked={flyRoute.showLine} onChange={setFlyRouteShowLine} label="Route Line" />
        {flyRoute.showLine && (
          <div style={{ display: 'flex', gap: '3px', marginLeft: 'auto' }}>
            {(['solid', 'dashed'] as const).map((s) => (
              <button key={s}
                className={`action-btn secondary ${flyRoute.lineStyle === s ? 'active' : ''}`}
                style={{ fontSize: '10px', padding: '2px 7px' }}
                onClick={() => setFlyRouteLineStyle(s)}>
                {s === 'solid' ? '——' : '- - -'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Icon toggle + type */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <Toggle checked={flyRoute.showIcon} onChange={setFlyRouteShowIcon} label="Icon (지도 표시)" />

        {/* 종류 선택 — 항상 노출 */}
        <div style={{ display: 'flex', gap: '4px' }}>
          {([
            { key: 'plane'   as RouteIconType, label: 'Plane',   icon: '🛩' },
            { key: 'ship'    as RouteIconType, label: 'Ship',    icon: '🚢' },
            { key: 'missile' as RouteIconType, label: 'Missile', icon: '🚀' },
          ]).map(({ key, label, icon }) => (
            <button key={key}
              className={`action-btn secondary ${flyRoute.iconType === key ? 'active' : ''}`}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '1px', padding: '4px 2px', fontSize: '15px' }}
              onClick={() => setFlyRouteIconType(key)} title={label}>
              <span>{icon}</span>
              <span style={{ fontSize: '8px', fontFamily: "'DM Sans',sans-serif",
                textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            </button>
          ))}
          <button
            className={`action-btn secondary ${flyRoute.iconType === 'custom' ? 'active' : ''}`}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: '1px', padding: '4px 2px' }}
            onClick={() => fileInputRef.current?.click()} title="Custom image">
            <Upload size={14} />
            <span style={{ fontSize: '8px', fontFamily: "'DM Sans',sans-serif",
              textTransform: 'uppercase', letterSpacing: '0.04em' }}>Custom</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={handleCustomFile} />
        </div>

        <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)' }}>
          {flyRoute.iconType === 'plane'   && '포물선 · 거리비례 고도'}
          {flyRoute.iconType === 'ship'    && '평면 · 고도 없음'}
          {flyRoute.iconType === 'missile' && '고각 포물선 · 항상 높음'}
          {flyRoute.iconType === 'custom'  && '비행기 경로 따름'}
        </p>
      </div>

      <div style={{ height: 1, background: 'var(--glass-border)' }} />

      {/* FLY + To AE */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button className="action-btn primary"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          onClick={handleFly}
          disabled={!flyRoute.from || !flyRoute.to || isAnimating}>
          <Play size={11} />{isAnimating ? 'Flying...' : 'Fly'}
        </button>
        <button className="action-btn primary"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          onClick={handleExportToAE}
          disabled={!flyRoute.from || !flyRoute.to || !!exportStatus}>
          <FileDown size={11} />{exportStatus ? '...' : 'To AE'}
        </button>
      </div>

      {exportStatus && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)', textAlign: 'center' as const }}>
          {exportStatus}
        </p>
      )}
      {(!flyRoute.from || !flyRoute.to) && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
          From / To 를 모두 설정하세요
        </p>
      )}

    </SectionPanel>
  );
}
