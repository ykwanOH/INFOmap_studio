/**
 * MACRO Map Studio — Fly To AE Panel (v3)
 * - 3D 포물선: Mapbox CustomLayer (WebGL) — MercatorCoordinate 기반 실고도
 * - 배(Ship) 제거
 * - FLY 줌: 포물선 꼭지점이 화면에 들어오는 최소값 자동 계산
 * - to AE: 3점 키프레임 JSX + 배경 PNG
 */

import { useState, useRef, useCallback, useEffect } from 'react';
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

// ── SVG 아이콘 ────────────────────────────────────────────────────────────────
const PLANE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g transform="translate(32,32) rotate(-45) translate(-32,-32)">
    <path d="M32 6 L40 28 H58 L44 36 L48 58 L32 46 L16 58 L20 36 L6 28 H24 Z"
      fill="white" stroke="#2a2a2a" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="32" cy="30" rx="6" ry="20" fill="#ddd" stroke="#2a2a2a" stroke-width="1.5"/>
  </g>
</svg>`;

const MISSILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <g transform="translate(32,32) rotate(-60) translate(-32,-32)">
    <ellipse cx="32" cy="28" rx="7" ry="18" fill="white" stroke="#2a2a2a" stroke-width="2"/>
    <path d="M32 8 L25 18 L39 18 Z" fill="#e05c2a" stroke="#2a2a2a" stroke-width="1.5"/>
    <path d="M25 40 L14 54 L32 46 Z" fill="#999" stroke="#2a2a2a" stroke-width="1.2"/>
    <path d="M39 40 L50 54 L32 46 Z" fill="#999" stroke="#2a2a2a" stroke-width="1.2"/>
  </g>
</svg>`;

function svgToCanvas(svgStr: string, size = 56): Promise<HTMLCanvasElement> {
  return new Promise((resolve) => {
    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = size; c.height = size;
      c.getContext('2d')!.drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(document.createElement('canvas')); };
    img.src = url;
  });
}

// ── 거리 (km) ─────────────────────────────────────────────────────────────────
function haversineKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const dLat = (b[1] - a[1]) * Math.PI / 180;
  const dLng = (b[0] - a[0]) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * Math.PI / 180) * Math.cos(b[1] * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function calcBearing(from: [number, number], to: [number, number]): number {
  const dLng = (to[0] - from[0]) * Math.PI / 180;
  const lat1 = from[1] * Math.PI / 180;
  const lat2 = to[1] * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── 3D 포물선 좌표 (고도 m) ───────────────────────────────────────────────────
function build3DArc(
  from: [number, number],
  to: [number, number],
  iconType: RouteIconType,
  steps = 80
): [number, number, number][] {
  const distKm = haversineKm(from, to);
  let maxAltM: number;
  if (iconType === 'missile') {
    maxAltM = Math.max(500_000, distKm * 500);
  } else {
    // plane / custom
    maxAltM = Math.max(20_000, distKm * 300);
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

// ── WebGL CustomLayer — 3D 포물선 라인 ──────────────────────────────────────
// Mercator 좌표로 변환 후 gl.LINES로 렌더
class ArcLayer implements mapboxgl.CustomLayerInterface {
  id = 'fly-arc-3d';
  type = 'custom' as const;
  renderingMode = '3d' as const;

  private gl!: WebGLRenderingContext;
  private program!: WebGLProgram;
  private buf!: WebGLBuffer;
  private vertCount = 0;
  coords: [number, number, number][] = [];
  color: [number, number, number] = [0.878, 0.361, 0.165];
  lineWidth = 2.5;
  visible = true;
  dashed = false;

  onAdd(_map: mapboxgl.Map, gl: WebGLRenderingContext) {
    this.gl = gl;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, `
      uniform mat4 u_matrix;
      attribute vec3 a_pos;
      void main() { gl_Position = u_matrix * vec4(a_pos, 1.0); }
    `);
    gl.compileShader(vs);

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, `
      precision mediump float;
      uniform vec3 u_color;
      void main() { gl_FragColor = vec4(u_color, 0.92); }
    `);
    gl.compileShader(fs);

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    this.program = prog;
    this.buf = gl.createBuffer()!;
    this.updateGeometry();
  }

  updateGeometry() {
    if (!this.gl || this.coords.length < 2) return;
    const gl = this.gl;
    const verts: number[] = [];
    for (const [lng, lat, alt] of this.coords) {
      const mc = mapboxgl.MercatorCoordinate.fromLngLat({ lng, lat }, alt);
      verts.push(mc.x, mc.y, mc.z!);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    this.vertCount = this.coords.length;
  }

  render(gl: WebGLRenderingContext, matrix: number[]) {
    if (!this.visible || this.vertCount < 2) return;
    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);

    const matLoc = gl.getUniformLocation(this.program, 'u_matrix');
    gl.uniformMatrix4fv(matLoc, false, matrix);

    const colLoc = gl.getUniformLocation(this.program, 'u_color');
    gl.uniform3fv(colLoc, this.color);

    const posLoc = gl.getAttribLocation(this.program, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);

    gl.lineWidth(this.lineWidth);

    if (this.dashed) {
      // 대시: 짝수 세그먼트만 그리기
      for (let i = 0; i < this.vertCount - 1; i += 4) {
        const cnt = Math.min(2, this.vertCount - i);
        if (cnt >= 2) gl.drawArrays(gl.LINE_STRIP, i, cnt);
      }
    } else {
      gl.drawArrays(gl.LINE_STRIP, 0, this.vertCount);
    }
  }
}

// 싱글톤 레이어 인스턴스
let arcLayerInstance: ArcLayer | null = null;

function getOrCreateArcLayer(map: mapboxgl.Map): ArcLayer {
  if (!arcLayerInstance || !map.getLayer('fly-arc-3d')) {
    if (arcLayerInstance && map.getLayer('fly-arc-3d')) map.removeLayer('fly-arc-3d');
    arcLayerInstance = new ArcLayer();
    map.addLayer(arcLayerInstance);
  }
  return arcLayerInstance;
}

// ── 아이콘 등록 ───────────────────────────────────────────────────────────────
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
    canvas = await svgToCanvas(iconType === 'missile' ? MISSILE_SVG : PLANE_SVG, size);
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const id = 'fly-icon';
  if (map.hasImage(id)) map.removeImage(id);
  map.addImage(id, { width: size, height: size, data: new Uint8Array(ctx.getImageData(0, 0, size, size).data) });
}

// ── 꼭지점이 보이는 최소 줌 계산 ─────────────────────────────────────────────
// 고도(m) → 화면에서 보이려면 지도가 얼마나 빠져야 하는지 역산
function peakZoomFromAlt(altM: number, map: mapboxgl.Map, midLng: number, midLat: number): number {
  // Mapbox 줌 레벨 z에서 1타일 = 256px, 지구 반지름 = 6371km
  // 고도 altM가 화면 높이의 절반보다 작아야 보임
  // 근사: altM / (Earth circumference / 2^z * tileSize / 360) < 0.5 * viewHeight
  const containerH = map.getContainer().clientHeight || 900;
  const earthCircumM = 2 * Math.PI * 6371000;
  // 픽셀당 미터 = earthCircumM * cos(lat) / (tileSize * 2^z)
  // 화면에 고도가 들어오려면: altM / metersPerPixel < containerH * 0.45
  // → metersPerPixel > altM / (containerH * 0.45)
  // → earthCircumM * cos(lat) / (256 * 2^z) > altM / (containerH * 0.45)
  // → 2^z < earthCircumM * cos(lat) * containerH * 0.45 / (256 * altM)
  const cosLat = Math.cos(midLat * Math.PI / 180);
  const maxTiles = (earthCircumM * cosLat * containerH * 0.45) / (256 * altM);
  const z = Math.log2(maxTiles);
  return Math.max(1.5, Math.min(6, z));
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

  // ── 3D 라인 업데이트 ──────────────────────────────────────────────────────
  const refresh3D = useCallback(async (map: mapboxgl.Map) => {
    if (!flyRoute.from || !flyRoute.to) return;
    const from: [number, number] = [flyRoute.from.lng, flyRoute.from.lat];
    const to: [number, number] = [flyRoute.to.lng, flyRoute.to.lat];

    // CustomLayer 포물선
    const coords3d = build3DArc(from, to, flyRoute.iconType);
    const arc = getOrCreateArcLayer(map);
    arc.coords = coords3d;
    arc.visible = flyRoute.showLine;
    arc.dashed = flyRoute.lineStyle === 'dashed';
    arc.updateGeometry();
    map.triggerRepaint();

    // 끝점 circle 소스
    const ptSource = map.getSource('fly-route') as mapboxgl.GeoJSONSource | undefined;
    if (ptSource) {
      ptSource.setData({
        type: 'FeatureCollection',
        features: [
          { type: 'Feature', geometry: { type: 'Point', coordinates: from }, properties: { role: 'from' } },
          { type: 'Feature', geometry: { type: 'Point', coordinates: to }, properties: { role: 'to' } },
        ],
      });
    }
    if (map.getLayer('fly-route-line')) map.setLayoutProperty('fly-route-line', 'visibility', 'none');

    // 아이콘
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

  // flyRoute 변경 시 자동 refresh
  useEffect(() => {
    if (mapInstance && flyRoute.from && flyRoute.to) {
      refresh3D(mapInstance);
    }
  }, [flyRoute, mapInstance, refresh3D]);

  // ── FLY ─────────────────────────────────────────────────────────────────
  const handleFly = useCallback(async () => {
    if (!mapInstance || !flyRoute.from || !flyRoute.to || isAnimating) return;

    // 3D 전환 (pitch만 — 위치/줌/베어링은 직전 그대로 유지)
    setViewMode('3d');
    const currentZoom    = mapInstance.getZoom();
    const currentBearing = mapInstance.getBearing();
    mapInstance.easeTo({ pitch: 50, duration: 500 });

    const from: [number, number] = [flyRoute.from.lng, flyRoute.from.lat];
    const to:   [number, number] = [flyRoute.to.lng,   flyRoute.to.lat];
    const distKm = haversineKm(from, to);
    const mid: [number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];

    let maxAltM: number;
    if (flyRoute.iconType === 'missile') maxAltM = Math.max(500_000, distKm * 500);
    else maxAltM = Math.max(20_000, distKm * 300);

    // 꼭지점이 보이는 최소 줌 — 현재보다 더 빠질 때만 조정
    const peakZoom = Math.min(currentZoom, peakZoomFromAlt(maxAltM, mapInstance, mid[0], mid[1]));

    setIsAnimating(true);
    await refresh3D(mapInstance);

    if (flyRoute.iconType === 'missile') {
      const arrivalBearing = calcBearing(mid, to);
      setTimeout(() => {
        mapInstance.flyTo({ center: mid, zoom: peakZoom, pitch: 50, bearing: currentBearing, duration: 1600 });
        setTimeout(() => {
          mapInstance.flyTo({ center: to, zoom: peakZoom + 1, bearing: arrivalBearing, pitch: 50, duration: 1400 });
          setTimeout(() => setIsAnimating(false), 1500);
        }, 1700);
      }, 550);
    } else {
      // plane / custom: 정점 풀아웃 → 도착 (직전 줌 복귀)
      setTimeout(() => {
        mapInstance.flyTo({ center: mid, zoom: peakZoom, pitch: 50, bearing: currentBearing, duration: 1600 });
        setTimeout(() => {
          mapInstance.flyTo({ center: to, zoom: currentZoom, pitch: 50, bearing: currentBearing, duration: 1400 });
          setTimeout(() => setIsAnimating(false), 1500);
        }, 1700);
      }, 550);
    }
  }, [mapInstance, flyRoute, isAnimating, setViewMode, refresh3D]);

    // ── to AE ─────────────────────────────────────────────────────────────────
  const handleExportToAE = useCallback(async () => {
    if (!mapInstance || !flyRoute.from || !flyRoute.to) return;
    setExportStatus('3D 전환 중...');

    const { from: fr, to: tr, lineStyle, iconType } = flyRoute;
    const fromPt: [number, number] = [fr.lng, fr.lat];
    const toPt: [number, number] = [tr.lng, tr.lat];
    const distKm = haversineKm(fromPt, toPt);

    setViewMode('3d');
    mapInstance.easeTo({ pitch: 50, duration: 400 });

    const bounds = new mapboxgl.LngLatBounds(
      [Math.min(fr.lng, tr.lng) - 4, Math.min(fr.lat, tr.lat) - 4],
      [Math.max(fr.lng, tr.lng) + 4, Math.max(fr.lat, tr.lat) + 4]
    );
    mapInstance.fitBounds(bounds, { pitch: 50, padding: 80, duration: 1000 });
    await new Promise(r => setTimeout(r, 1400));
    await new Promise<void>(r => { mapInstance.once('idle', r); mapInstance.triggerRepaint(); setTimeout(r, 2500); });

    setExportStatus('캡처 중...');

    const fromPx = mapInstance.project([fr.lng, fr.lat]);
    const toPx   = mapInstance.project([tr.lng, tr.lat]);
    const midLng = (fr.lng + tr.lng) / 2;
    const midLat = (fr.lat + tr.lat) / 2;
    const midPx  = mapInstance.project([midLng, midLat]);

    const canvas = mapInstance.getCanvas();
    const cW = canvas.width, cH = canvas.height;
    const bgDataUrl = canvas.toDataURL('image/png');

    let maxAltM = iconType === 'missile' ? Math.max(500_000, distKm * 500) : Math.max(20_000, distKm * 300);
    const peakZ = -(maxAltM / 1_000_000) * 600;
    const totalDuration = Math.max(4, Math.min(14, distKm / 400));
    const now = new Date().toISOString();

    const jsx = `// ================================================================
// INFO map Studio — Fly To AE Script  v3
// Generated : ${now}
// From : ${fr.name}   To : ${tr.name}
// Distance : ${distKm.toFixed(0)} km  |  Icon: ${iconType}  |  Line: ${lineStyle}
// Duration : ${totalDuration.toFixed(1)}s  |  Map: ${cW}x${cH}px
// ================================================================
(function macroMapFlyTo() {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    alert("열려 있는 Composition이 없습니다.");
    return;
  }
  app.beginUndoGroup("INFO Map FlyTo");
  var compW = comp.width, compH = comp.height;
  var dur = ${totalDuration.toFixed(2)};
  var sx = compW / ${cW}, sy = compH / ${cH};
  var fromPx = [${fromPx.x.toFixed(1)}*sx, ${fromPx.y.toFixed(1)}*sy];
  var midPx  = [${midPx.x.toFixed(1)}*sx,  ${midPx.y.toFixed(1)}*sy];
  var toPx   = [${toPx.x.toFixed(1)}*sx,   ${toPx.y.toFixed(1)}*sy];
  var zClose = -compH * 0.85;
  var zPeak  = ${peakZ.toFixed(0)} * (compH / ${cH});
  ${iconType === 'missile' ? 'var zArrive = zPeak + compH * 0.45;' : 'var zArrive = zClose;'}

  var cam = comp.layers.addCamera("INFO Map Fly Camera", [compW/2, compH/2]);
  cam.inPoint = 0; cam.outPoint = dur;
  var camPos = cam.property("Transform").property("Position");
  var camPOI = cam.property("Transform").property("Point of Interest");
  camPos.setValueAtTime(0,        [fromPx[0], fromPx[1], zClose]);
  camPos.setValueAtTime(dur*0.5,  [midPx[0],  midPx[1],  zPeak]);
  camPos.setValueAtTime(dur,      [toPx[0],   toPx[1],   zArrive]);
  camPOI.setValueAtTime(0,        [fromPx[0], fromPx[1], 0]);
  camPOI.setValueAtTime(dur*0.5,  [midPx[0],  midPx[1],  0]);
  camPOI.setValueAtTime(dur,      [toPx[0],   toPx[1],   0]);
  var ease = [new KeyframeEase(0, 60)];
  for (var ki=1; ki<=camPos.numKeys; ki++) {
    camPos.setTemporalEaseAtKey(ki, ease, ease);
    camPOI.setTemporalEaseAtKey(ki, ease, ease);
  }

  var iconLyr = comp.layers.addText("${iconType === 'plane' ? '✈' : iconType === 'missile' ? '🚀' : '●'}");
  iconLyr.name = "Icon (${iconType})";
  iconLyr.inPoint = 0; iconLyr.outPoint = dur;
  var iPos = iconLyr.property("Transform").property("Position");
  iPos.setValueAtTime(0,        [fromPx[0], fromPx[1]]);
  iPos.setValueAtTime(dur*0.5,  [midPx[0],  midPx[1]]);
  iPos.setValueAtTime(dur,      [toPx[0],   toPx[1]]);

  app.endUndoGroup();
  alert("INFO Map FlyTo 완료!\\n\\n배경 PNG를 최하단 레이어로 배치하세요.\\nFrom: ${fr.name.replace(/"/g, "'")}\\nTo: ${tr.name.replace(/"/g, "'")}\\n거리: ${distKm.toFixed(0)}km  Duration: "+dur+"s");
})();`;

    const jsxLink = Object.assign(document.createElement('a'), {
      href: URL.createObjectURL(new Blob([jsx], { type: 'text/plain' })),
      download: `info_flyto_${Date.now()}.jsx`,
    });
    jsxLink.click();

    await new Promise(r => setTimeout(r, 200));
    Object.assign(document.createElement('a'), {
      href: bgDataUrl,
      download: `info_map_AE_bg_${Date.now()}.png`,
    }).click();

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

      {/* Icon */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <Toggle checked={flyRoute.showIcon} onChange={setFlyRouteShowIcon} label="Icon (지도 표시)" />
        <div style={{ display: 'flex', gap: '4px' }}>
          {([
            { key: 'plane'   as RouteIconType, icon: '🛩', label: 'Plane'   },
            { key: 'missile' as RouteIconType, icon: '🚀', label: 'Missile' },
          ]).map(({ key, icon, label }) => (
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
            onClick={() => fileInputRef.current?.click()}>
            <Upload size={14} />
            <span style={{ fontSize: '8px', fontFamily: "'DM Sans',sans-serif",
              textTransform: 'uppercase', letterSpacing: '0.04em' }}>Custom</span>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*"
            style={{ display: 'none' }} onChange={handleCustomFile} />
        </div>
        <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)' }}>
          {flyRoute.iconType === 'plane'   && '포물선 · 거리비례 고도'}
          {flyRoute.iconType === 'missile' && '고각 포물선 · 항상 높음'}
          {flyRoute.iconType === 'custom'  && '비행기 경로 따름'}
        </p>
      </div>

      <div style={{ height: 1, background: 'var(--glass-border)' }} />

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
