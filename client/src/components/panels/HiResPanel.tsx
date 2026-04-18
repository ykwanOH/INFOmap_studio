/**
 * MACRO Map Studio — Hi-Res Capture Panel (v6)
 *
 * ── unproject 완전 폐기, MercatorCoordinate 수학으로 교체 ──
 *
 * unproject()는 "현재 렌더된 뷰포트 픽셀 → 지리좌표" 변환이라
 * jumpTo로 center가 바뀌면 기준이 달라져 반복/어긋남이 발생.
 *
 * 대신 Mapbox의 MercatorCoordinate를 직접 계산:
 *   1. 현재 center의 Mercator XY 구하기
 *   2. zoom 기반 meters-per-pixel 계산
 *   3. 각 타일 중앙의 픽셀 오프셋 → Mercator 오프셋 → LngLat 변환
 * → center/zoom 이동과 완전히 독립적, 항상 정확
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

const TILE_COLS: Record<0 | 1 | 2, number> = { 0: 1, 1: 2, 2: 4 };

function waitStable(map: mapboxgl.Map): Promise<void> {
  return new Promise((resolve) => {
    const onIdle = () => {
      map.off('idle', onIdle);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    map.on('idle', onIdle);
    map.triggerRepaint();
  });
}

/**
 * MercatorCoordinate 수학으로 타일 중앙 LngLat 계산.
 * unproject() 미사용 — center 이동과 완전히 독립적.
 *
 * @param centerLngLat  캡처 시작 시점의 원본 center
 * @param zoom          캡처 줌
 * @param vpW           뷰포트 CSS픽셀 너비
 * @param vpH           뷰포트 CSS픽셀 높이
 * @param col           타일 열 인덱스 (0-based)
 * @param row           타일 행 인덱스 (0-based)
 * @param cols          총 열/행 수 (2 or 4)
 */
function calcTileCenter(
  centerLngLat: mapboxgl.LngLat,
  zoom: number,
  vpW: number,
  vpH: number,
  col: number,
  row: number,
  cols: number,
): mapboxgl.LngLat {
  // 원본 center의 Mercator 좌표 (0~1 범위)
  const mc = mapboxgl.MercatorCoordinate.fromLngLat(centerLngLat);

  // zoom 레벨에서 CSS픽셀 1개당 Mercator 단위
  // Mercator 전체 = 1.0, 타일 256px 기준: meterPerPx = 1 / (256 * 2^zoom)
  const worldSize = 512 * Math.pow(2, zoom); // CSS픽셀 기준 전체 월드 크기
  const mercPerPx = 1.0 / worldSize;

  // 타일 1장의 CSS픽셀 크기
  const tileW = vpW / cols;
  const tileH = vpH / cols;

  // 이 타일 중앙의 원본 center로부터의 CSS픽셀 오프셋
  // (원본 center = 뷰포트 정중앙)
  const dxPx = (col - (cols - 1) / 2) * tileW;  // 좌우 오프셋
  const dyPx = (row - (cols - 1) / 2) * tileH;  // 상하 오프셋

  // 픽셀 오프셋 → Mercator 오프셋
  const newMcX = mc.x + dxPx * mercPerPx;
  const newMcY = mc.y + dyPx * mercPerPx;

  // Mercator → LngLat
  const newMc = new mapboxgl.MercatorCoordinate(newMcX, newMcY, mc.z);
  return newMc.toLngLat();
}

/** drawImage용 센터크롭 파라미터 계산 (비율 왜곡 방지) */
function getCropParams(
  srcW: number, srcH: number,
  dstW: number, dstH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const srcAR = srcW / srcH;
  const dstAR = dstW / dstH;
  let sx = 0, sy = 0, sw = srcW, sh = srcH;
  if (srcAR > dstAR) {
    sw = Math.round(srcH * dstAR);
    sx = Math.round((srcW - sw) / 2);
  } else if (srcAR < dstAR) {
    sh = Math.round(srcW / dstAR);
    sy = Math.round((srcH - sh) / 2);
  }
  return { sx, sy, sw, sh };
}

export function HiResPanel() {
  const {
    mapInstance,
    zoom,
    hiResZoomDelta,
    setHiResZoomDelta,
    hiResCapturing,
    setHiResCapturing,
  } = useMapStore();

  const [progress, setProgress] = useState<string | null>(null);

  const delta = hiResZoomDelta as 0 | 1 | 2;
  const cols  = TILE_COLS[delta];
  const outW  = 1920 * cols;  // 목표 출력 폭
  const outH  = 1080 * cols;  // 목표 출력 높이

  const handleCapture = useCallback(async () => {
    if (!mapInstance || hiResCapturing) return;
    setHiResCapturing(true);
    setProgress('준비 중...');

    // 원본 상태 — 복원 및 좌표 계산 기준
    const origCenter  = mapInstance.getCenter();
    const origZoom    = mapInstance.getZoom();
    const origBearing = mapInstance.getBearing();
    const origPitch   = mapInstance.getPitch();

    // 뷰포트 CSS픽셀 크기
    const container = mapInstance.getContainer();
    const vpW = container.clientWidth;
    const vpH = container.clientHeight;

    try {
      const outCanvas = document.createElement('canvas');
      outCanvas.width  = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d')!;

      if (delta === 0) {
        // ── FHD: 단일 캡처 ──────────────────────────────────────────
        setProgress('캡처 중...');
        await waitStable(mapInstance);
        const cv = mapInstance.getCanvas();
        const { sx, sy, sw, sh } = getCropParams(cv.width, cv.height, outW, outH);
        ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, outW, outH);

      } else {
        // ── 4K/8K: MercatorCoordinate 기반 타일 분할 캡처 ──────────
        // 타일 중앙 좌표를 모두 사전 계산 (원본 center 기준, jumpTo 전)
        const tileCenters: mapboxgl.LngLat[][] = Array.from({ length: cols }, (_, row) =>
          Array.from({ length: cols }, (_, col) =>
            calcTileCenter(origCenter, origZoom, vpW, vpH, col, row, cols)
          )
        );

        const tileOutW = outW / cols;  // = 1920
        const tileOutH = outH / cols;  // = 1080
        const total = cols * cols;
        let tileIdx = 0;

        for (let row = 0; row < cols; row++) {
          for (let col = 0; col < cols; col++) {
            tileIdx++;
            setProgress(`타일 ${tileIdx} / ${total} 캡처 중...`);

            mapInstance.jumpTo({
              center: tileCenters[row][col],
              zoom: origZoom,
              bearing: origBearing,
              pitch: origPitch,
            });
            await waitStable(mapInstance);

            const cv = mapInstance.getCanvas();
            const { sx, sy, sw, sh } = getCropParams(cv.width, cv.height, tileOutW, tileOutH);
            ctx.drawImage(
              cv,
              sx, sy, sw, sh,
              col * tileOutW, row * tileOutH,
              tileOutW, tileOutH,
            );
          }
        }
      }

      setProgress('저장 중...');
      const link = document.createElement('a');
      link.download = `macro_hires_${outW}x${outH}_${Date.now()}.png`;
      link.href = outCanvas.toDataURL('image/png');
      link.click();
      setProgress(null);

    } catch (e) {
      console.error('HiRes capture error', e);
      setProgress('오류 발생');
      setTimeout(() => setProgress(null), 2000);
    } finally {
      mapInstance.jumpTo({
        center: [origCenter.lng, origCenter.lat],
        zoom: origZoom,
        bearing: origBearing,
        pitch: origPitch,
      });
      setHiResCapturing(false);
    }
  }, [mapInstance, delta, cols, zoom, outW, outH, hiResCapturing, setHiResCapturing]);

  return (
    <SectionPanel sectionKey="hiResCap" title="Hi-Res Capture">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>View zoom</span>
        <span style={{ ...monoStyle, color: 'var(--foreground)' }}>{zoom.toFixed(1)}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={labelStyle}>Resolution</span>
          <span style={{ ...monoStyle, color: 'var(--accent)' }}>
            {cols}×{cols}{delta > 0 ? ` (${cols * cols}tiles)` : ''}
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

      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '6px 8px', background: 'var(--glass-border)', opacity: 0.9,
      }}>
        <span style={{ ...labelStyle, fontSize: '11px' }}>Output</span>
        <span style={{ ...monoStyle, fontSize: '11px', color: 'var(--foreground)' }}>
          {RESOLUTION_LABEL[delta]}
        </span>
      </div>

      {delta > 0 && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
          캡처 중 지도가 잠시 이동합니다
        </p>
      )}

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
        {hiResCapturing ? progress ?? 'Capturing...' : 'Capture PNG'}
      </button>

      {hiResCapturing && progress && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)', textAlign: 'center' }}>
          {progress}
        </p>
      )}
    </SectionPanel>
  );
}
