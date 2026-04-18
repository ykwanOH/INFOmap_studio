/**
 * MACRO Map Studio — Hi-Res Capture Panel (v12)
 *
 * ── 원칙 ──
 * 범위: 현재 뷰포트의 지리 좌표 bbox (화면 픽셀/배율 무관)
 * 디테일: mapZoom + delta (더 선명한 줌으로 찍음)
 *
 * 참조 사이트(ncg-map-capture)와 동일한 로직:
 *   bbox 경위도 → Mercator XY → 타일 분할 → Static API 요청
 *   단, bbox를 드래그 대신 "현재 뷰 4귀퉁이 unproject"로 자동 설정
 *
 * delta=0: zoom +0 → 현재 해상도 그대로 (FHD)
 * delta=1: zoom +1 → 2배 선명
 * delta=2: zoom +2 → 4배 선명
 *
 * 출력 크기: bbox 비율 × 디테일 줌에 맞는 픽셀 수
 * (정확히 16:9가 아닐 수 있으나 현재 뷰를 가장 정확히 반영)
 */

import { useCallback, useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { SectionPanel } from '@/components/ui/SectionPanel';
import { Download } from 'lucide-react';
import mapboxgl from 'mapbox-gl';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
} as const;

const monoStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '11px',
  color: 'var(--section-label-color)',
} as const;

// delta별 줌 증가량
const ZOOM_DELTA: Record<0 | 1 | 2, number> = { 0: 0, 1: 1, 2: 2 };
const DELTA_LABEL: Record<0 | 1 | 2, string> = {
  0: '현재 줌  ×1',
  1: '+1 zoom  ×2',
  2: '+2 zoom  ×4',
};

// Static API 파라미터 (참조 사이트와 동일)
const TILE_SIZE    = 640;                        // 타일 논리 크기 (px)
const OVERLAP_PX   = 160;                        // 오버랩 (논리px)
const REQ_SIZE     = TILE_SIZE + OVERLAP_PX * 2; // 960 — API 요청 크기
const ACTUAL_PX    = TILE_SIZE * 2;              // 1280 — @2x 물리px
const CROP_PX      = OVERLAP_PX * 2;             // 320 — 크롭 물리px
const TILE_UNITS   = TILE_SIZE / 512;            // Mercator 단위/타일
const CONCURRENCY  = 4;
const MAX_TILES    = 200;

const STYLE_IDS: Record<string, string> = {
  vector:    'mapbox/streets-v12',
  satellite: 'mapbox/satellite-streets-v12',
};

// ── Mercator 좌표 변환 ──────────────────────────────────────────────────────

function lngLatToXY(lng: number, lat: number, zoom: number) {
  const scale = Math.pow(2, zoom);
  const x = (lng + 180) / 360 * scale;
  const lr = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * scale;
  return { x, y };
}

function xyToLngLat(x: number, y: number, zoom: number) {
  const scale = Math.pow(2, zoom);
  const lng = x / scale * 360 - 180;
  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI;
  return { lng, lat };
}

// ── Static API 타일 fetch ───────────────────────────────────────────────────

function fetchTile(
  lng: number, lat: number, zoom: number,
  styleId: string, token: string,
  retries = 3,
): Promise<HTMLImageElement> {
  const url =
    `https://api.mapbox.com/styles/v1/${styleId}/static/` +
    `${lng.toFixed(6)},${lat.toFixed(6)},${zoom.toFixed(2)}/` +
    `${REQ_SIZE}x${REQ_SIZE}@2x` +
    `?access_token=${token}&attribution=false&logo=false`;

  return new Promise((resolve, reject) => {
    let tries = 0;
    const load = () => {
      tries++;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => {
        if (tries < retries) setTimeout(load, 600 * tries);
        else reject(new Error(`타일 로드 실패 (${lng.toFixed(3)}, ${lat.toFixed(3)})`));
      };
      img.src = tries > 1 ? `${url}&_r=${Date.now()}` : url;
    };
    load();
  });
}

export function HiResPanel() {
  const {
    mapInstance,
    zoom,
    mapStyle,
    hiResZoomDelta,
    setHiResZoomDelta,
    hiResCapturing,
    setHiResCapturing,
  } = useMapStore();

  const [progress, setProgress] = useState<string | null>(null);
  const [progPct,  setProgPct ] = useState(0);
  const [estInfo,  setEstInfo ] = useState<string | null>(null);

  const delta = hiResZoomDelta as 0 | 1 | 2;
  const captureZoom = zoom + ZOOM_DELTA[delta];

  const handleCapture = useCallback(async () => {
    if (!mapInstance || hiResCapturing) return;
    setHiResCapturing(true);
    setProgress('준비 중...');
    setProgPct(3);

    try {
      const token   = (mapboxgl as any).accessToken as string;
      const styleId = STYLE_IDS[mapStyle] ?? STYLE_IDS.vector;

      // ── 현재 뷰 bbox (지리 좌표로 변환) ────────────────────────────
      // unproject는 현재 뷰포트 CSS픽셀 → LngLat
      // 지리 좌표 기반이므로 화면 배율(125% 등) 무관
      const container = mapInstance.getContainer();
      const vpW = container.clientWidth;
      const vpH = container.clientHeight;

      const tl = mapInstance.unproject([0,   0  ]);
      const br = mapInstance.unproject([vpW, vpH]);

      const bbox = {
        west:  Math.min(tl.lng, br.lng),
        east:  Math.max(tl.lng, br.lng),
        north: Math.max(tl.lat, br.lat),
        south: Math.min(tl.lat, br.lat),
      };

      // ── captureZoom 기준 Mercator XY ────────────────────────────────
      const z = captureZoom;
      const nw = lngLatToXY(bbox.west,  bbox.north, z);
      const se = lngLatToXY(bbox.east,  bbox.south, z);

      // 타일 수 계산 (참조 사이트와 동일 공식)
      const cols  = Math.max(1, Math.ceil((se.x - nw.x) / TILE_UNITS));
      const rows  = Math.max(1, Math.ceil((se.y - nw.y) / TILE_UNITS));
      const total = cols * rows;

      // 출력 픽셀 크기 (bbox 정확한 비율)
      const exactW = Math.round((se.x - nw.x) / TILE_UNITS * ACTUAL_PX);
      const exactH = Math.round((se.y - nw.y) / TILE_UNITS * ACTUAL_PX);

      if (total > MAX_TILES) {
        setProgress(`타일 수 초과 (${total}개). 줌을 올리거나 delta를 낮추세요.`);
        setTimeout(() => setProgress(null), 3000);
        return;
      }

      setEstInfo(`${cols}×${rows} = ${total}타일 → ${exactW}×${exactH}px`);

      // ── 타일 목록 ────────────────────────────────────────────────────
      const tiles: { lng: number; lat: number; row: number; col: number }[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = nw.x + (c + 0.5) * TILE_UNITS;
          const cy = nw.y + (r + 0.5) * TILE_UNITS;
          const { lng, lat } = xyToLngLat(cx, cy, z);
          tiles.push({ lng, lat, row: r, col: c });
        }
      }

      // ── Canvas 준비 ────────────────────────────────────────────────
      const gridW = cols * ACTUAL_PX;
      const gridH = rows * ACTUAL_PX;
      const canvas = document.createElement('canvas');
      canvas.width  = gridW;
      canvas.height = gridH;
      const ctx = canvas.getContext('2d')!;

      let fetched = 0;

      // ── 병렬 fetch & 합성 ────────────────────────────────────────
      for (let i = 0; i < tiles.length; i += CONCURRENCY) {
        const batch = tiles.slice(i, i + CONCURRENCY);
        const imgs  = await Promise.all(
          batch.map(t => fetchTile(t.lng, t.lat, z, styleId, token))
        );
        imgs.forEach((img, j) => {
          const t = batch[j];
          // 오버랩 제거 → 중앙 1280×1280만 합성
          ctx.drawImage(
            img,
            CROP_PX, CROP_PX, ACTUAL_PX, ACTUAL_PX,
            t.col * ACTUAL_PX, t.row * ACTUAL_PX,
            ACTUAL_PX, ACTUAL_PX,
          );
        });
        fetched += batch.length;
        setProgPct(Math.round(fetched / total * 88) + 8);
        setProgress(`타일 ${fetched} / ${total} 다운로드 중...`);
      }

      // ── bbox 정확한 크기로 크롭 ────────────────────────────────────
      setProgress('이미지 생성 중...');
      setProgPct(97);
      const final = document.createElement('canvas');
      final.width  = exactW;
      final.height = exactH;
      final.getContext('2d')!.drawImage(canvas, 0, 0);

      setProgress('저장 중...');
      final.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), {
          href: url,
          download: `macro_hires_z${z.toFixed(1)}_${exactW}x${exactH}_${Date.now()}.png`,
        });
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setProgPct(100);
        setProgress(null);
      }, 'image/png');

    } catch (e: any) {
      console.error('HiRes capture error', e);
      setProgress(`오류: ${e.message}`);
      setTimeout(() => setProgress(null), 3000);
    } finally {
      setProgPct(0);
      setHiResCapturing(false);
    }
  }, [mapInstance, delta, captureZoom, mapStyle, hiResCapturing, setHiResCapturing]);

  return (
    <SectionPanel sectionKey="hiResCap" title="Hi-Res Capture">

      {/* 현재 줌 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>View zoom</span>
        <span style={{ ...monoStyle, color: 'var(--foreground)' }}>{zoom.toFixed(1)}</span>
      </div>

      {/* 디테일 슬라이더 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={labelStyle}>Detail</span>
          <span style={{ ...monoStyle, color: 'var(--accent)' }}>
            {DELTA_LABEL[delta]}
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type="range" className="custom-slider"
            min={0} max={2} step={1} value={delta}
            onChange={(e) => setHiResZoomDelta(Math.round(Number(e.target.value)) as 0 | 1 | 2)}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', padding: '0 2px' }}>
            {(['+0', '+1', '+2'] as const).map((label, v) => (
              <span key={v} style={{
                ...monoStyle, fontSize: '10px',
                opacity: delta === v ? 1 : 0.4,
                fontWeight: delta === v ? 600 : 400,
              }}>{label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 캡처 줌 표시 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 8px', background: 'var(--glass-border)', opacity: 0.9,
      }}>
        <span style={{ ...labelStyle, fontSize: '11px' }}>Capture zoom</span>
        <span style={{ ...monoStyle, fontSize: '11px', color: 'var(--accent)' }}>
          z {captureZoom.toFixed(1)}
        </span>
      </div>

      {/* 예상 타일 정보 */}
      {estInfo && !hiResCapturing && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
          {estInfo}
        </p>
      )}

      <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
        현재 뷰 범위 · 지도 이동 없음
      </p>

      {/* 진행바 */}
      {hiResCapturing && (
        <div>
          <div style={{
            background: 'var(--glass-border)', borderRadius: '99px',
            height: '4px', overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${progPct}%`,
              background: 'var(--accent)', borderRadius: '99px',
              transition: 'width 0.3s ease',
            }} />
          </div>
          {progress && (
            <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)', marginTop: '4px', textAlign: 'right' }}>
              {progress}
            </p>
          )}
        </div>
      )}

      {/* 캡처 버튼 */}
      <button
        className="action-btn"
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: '5px', fontWeight: 600,
          opacity: hiResCapturing ? 0.6 : 1,
        }}
        onClick={handleCapture}
        disabled={hiResCapturing}
      >
        <Download size={11} />
        {hiResCapturing ? (progress ?? 'Capturing...') : 'Capture PNG'}
      </button>

    </SectionPanel>
  );
}
