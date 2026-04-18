/**
 * MACRO Map Studio — Hi-Res Capture Panel (v10 · Static API)
 *
 * ── GL 캔버스 캡처 방식 완전 폐기 ──
 * jumpTo / waitStable / GL 렌더 타이밍 문제 → 모두 제거
 *
 * ── 새 방식: Mapbox Static Images API ──
 * 1. 현재 뷰 중앙 기준으로 16:9 bbox 계산
 * 2. bbox를 cols×rows 타일로 분할
 * 3. 각 타일 중앙 좌표로 Static API 호출 (서버 렌더 PNG)
 * 4. TILE_OVERLAP_PX 오버랩으로 요청 → 중앙만 잘라 Canvas에 합성
 *    → 이음새 완벽 처리
 *
 * delta=0: FHD  1920×1080  (2×2 타일)
 * delta=1: 4K   3840×2160  (4×4 타일)
 * delta=2: 8K   7680×4320  (8×8 타일)
 *
 * 각 타일 = 640×640 논리px (@2x → 1280×1280 실제px)
 * 오버랩 160px → 요청 960×960, 중앙 1280×1280px만 사용
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

const RESOLUTION_LABEL: Record<0 | 1 | 2, string> = {
  0: 'FHD  1920 × 1080',
  1: '4K   3840 × 2160',
  2: '8K   7680 × 4320',
};

// delta별 타일 열/행 수
const TILE_COLS: Record<0 | 1 | 2, number> = { 0: 2, 1: 4, 2: 8 };

// Static API 파라미터
const TILE_SIZE       = 640;          // 타일 논리 크기 (px)
const OVERLAP_PX      = 160;          // 각 변 오버랩 (논리px)
const REQ_SIZE        = TILE_SIZE + OVERLAP_PX * 2;  // 960 — 실제 요청 크기
const ACTUAL_PX       = TILE_SIZE * 2;               // 1280 — @2x 실제 출력 px
const CROP_PX         = OVERLAP_PX * 2;              // 320 — @2x 잘라낼 양쪽 px
const CONCURRENCY     = 4;

// 스타일 ID (mapbox://styles/ 뒤 부분)
const STYLE_IDS: Record<string, string> = {
  vector:    'mapbox/streets-v12',
  satellite: 'mapbox/satellite-streets-v12',
};

// ── 좌표 변환 (Mercator 타일 수학) ──────────────────────────────────────────

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
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale)));
  return { lng, lat: latRad * 180 / Math.PI };
}

// ── Static API 타일 1장 fetch ────────────────────────────────────────────────

function fetchTile(
  lng: number, lat: number, zoom: number,
  styleId: string, token: string,
  retries = 3,
): Promise<HTMLImageElement> {
  const url =
    `https://api.mapbox.com/styles/v1/${styleId}/static/` +
    `${lng.toFixed(6)},${lat.toFixed(6)},${zoom}/` +
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

  const delta = hiResZoomDelta as 0 | 1 | 2;
  const cols  = TILE_COLS[delta];   // 열 = 행 (정사각 그리드)
  // 출력 크기: cols타일 × ACTUAL_PX px/타일
  const outW  = cols * ACTUAL_PX;   // 2560 / 5120 / 10240
  const outH  = Math.round(outW * 9 / 16); // 16:9 고정

  const handleCapture = useCallback(async () => {
    if (!mapInstance || hiResCapturing) return;
    setHiResCapturing(true);
    setProgress('준비 중...');
    setProgPct(3);

    try {
      const token   = (mapboxgl as any).accessToken as string;
      const styleId = STYLE_IDS[mapStyle] ?? STYLE_IDS.vector;

      // ── 현재 뷰 중앙 + 줌 ─────────────────────────────────────────────
      const center   = mapInstance.getCenter();
      const captureZ = mapInstance.getZoom();

      // TILE_UNITS: 1타일이 커버하는 Mercator 단위 (zoom 기준)
      const TILE_UNITS = TILE_SIZE / 512;

      // 중앙 Mercator 좌표
      const mc = lngLatToXY(center.lng, center.lat, captureZ);

      // bbox: cols×rows 타일 그리드가 중앙에 오도록 설정 (16:9)
      const rows = Math.round(cols * 9 / 16);   // 9/16 비율 행 수
      const halfW = (cols / 2) * TILE_UNITS;
      const halfH = (rows / 2) * TILE_UNITS;

      const nwX = mc.x - halfW;
      const nwY = mc.y - halfH;

      // ── 타일 목록 생성 ────────────────────────────────────────────────
      const tiles: { lng: number; lat: number; row: number; col: number }[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const cx = nwX + (c + 0.5) * TILE_UNITS;
          const cy = nwY + (r + 0.5) * TILE_UNITS;
          const { lng, lat } = xyToLngLat(cx, cy, captureZ);
          tiles.push({ lng, lat, row: r, col: c });
        }
      }

      // ── Canvas 준비 ───────────────────────────────────────────────────
      // 그리드 전체 크기 (나중에 exact 크기로 크롭)
      const gridW = cols * ACTUAL_PX;
      const gridH = rows * ACTUAL_PX;
      const canvas = document.createElement('canvas');
      canvas.width  = gridW;
      canvas.height = gridH;
      const ctx = canvas.getContext('2d')!;

      const total = tiles.length;
      let fetched = 0;

      // ── 타일 병렬 fetch & 합성 ────────────────────────────────────────
      for (let i = 0; i < tiles.length; i += CONCURRENCY) {
        const batch = tiles.slice(i, i + CONCURRENCY);
        const imgs  = await Promise.all(
          batch.map(t => fetchTile(t.lng, t.lat, captureZ, styleId, token))
        );
        imgs.forEach((img, j) => {
          const t = batch[j];
          // 오버랩 영역 크롭 → 중앙 ACTUAL_PX × ACTUAL_PX만 합성
          ctx.drawImage(
            img,
            CROP_PX, CROP_PX, ACTUAL_PX, ACTUAL_PX,   // src: 오버랩 제거
            t.col * ACTUAL_PX, t.row * ACTUAL_PX,       // dst 위치
            ACTUAL_PX, ACTUAL_PX,                        // dst 크기
          );
        });
        fetched += batch.length;
        const pct = Math.round(fetched / total * 88) + 8;
        setProgPct(pct);
        setProgress(`타일 ${fetched} / ${total} 다운로드 중...`);
      }

      // ── 최종 16:9 크롭 ────────────────────────────────────────────────
      setProgress('이미지 생성 중...');
      setProgPct(97);
      const finalW = outW;
      const finalH = outH;
      const final  = document.createElement('canvas');
      final.width  = finalW;
      final.height = finalH;
      // 그리드 중앙에서 정확히 16:9 크기만 잘라냄
      const cropX = Math.round((gridW - finalW) / 2);
      const cropY = Math.round((gridH - finalH) / 2);
      final.getContext('2d')!.drawImage(canvas, cropX, cropY, finalW, finalH, 0, 0, finalW, finalH);

      // ── 저장 ──────────────────────────────────────────────────────────
      setProgress('저장 중...');
      final.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), {
          href: url,
          download: `macro_hires_${finalW}x${finalH}_${Date.now()}.png`,
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
  }, [mapInstance, delta, cols, mapStyle, outW, outH, hiResCapturing, setHiResCapturing]);

  return (
    <SectionPanel sectionKey="hiResCap" title="Hi-Res Capture">

      {/* 줌 정보 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>View zoom</span>
        <span style={{ ...monoStyle, color: 'var(--foreground)' }}>{zoom.toFixed(1)}</span>
      </div>

      {/* 해상도 슬라이더 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={labelStyle}>Resolution</span>
          <span style={{ ...monoStyle, color: 'var(--accent)' }}>
            {cols}×{Math.round(cols * 9 / 16)} tiles
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
            {(['FHD', '4K', '8K'] as const).map((label, v) => (
              <span key={v} style={{
                ...monoStyle, fontSize: '10px',
                opacity: delta === v ? 1 : 0.4,
                fontWeight: delta === v ? 600 : 400,
              }}>{label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 출력 해상도 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 8px', background: 'var(--glass-border)', opacity: 0.9,
      }}>
        <span style={{ ...labelStyle, fontSize: '11px' }}>Output</span>
        <span style={{ ...monoStyle, fontSize: '11px', color: 'var(--foreground)' }}>
          {RESOLUTION_LABEL[delta]}
        </span>
      </div>

      {/* 안내 */}
      <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
        현재 뷰 중앙 기준 · 지도 이동 없음
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
              background: 'var(--accent)',
              borderRadius: '99px',
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
