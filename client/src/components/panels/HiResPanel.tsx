/**
 * MACRO Map Studio — Hi-Res Capture Panel (v5)
 *
 * ── 핵심 전략: MercatorCoordinate 직접 계산 ──
 * unproject()는 현재 뷰포트의 CSS픽셀 기준이라 center가 바뀌면 틀림.
 * 대신 현재 center의 MercatorCoordinate + 미터/픽셀 스케일로
 * 각 타일 중앙의 절대 Mercator 좌표를 직접 계산 → jumpTo.
 * → center 이동과 무관하게 타일 경계가 항상 정확히 일치.
 *
 * 비율 보정: cvW:cvH가 16:9가 아닐 수 있으므로
 * drawImage src를 센터크롭해서 정확히 1920×1080 비율만 사용.
 *
 * delta=0: FHD  1920×1080
 * delta=1: 4K   3840×2160  (2×2)
 * delta=2: 8K   7680×4320  (4×4)
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

// idle + 2프레임 안정화
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
 * 현재 맵 뷰포트의 메르카토르 좌표 범위와 픽셀당 메르카토르 단위를 계산.
 * 이 값은 center가 바뀌어도 zoom이 같으면 px당 scale은 동일하므로
 * 타일 중앙 좌표를 절대값으로 미리 계산할 수 있다.
 */
function getTileCenter(
  map: mapboxgl.Map,
  col: number,
  row: number,
  cols: number,
): mapboxgl.LngLat {
  // CSS 픽셀 기준 뷰포트 크기
  const container = map.getContainer();
  const vpW = container.clientWidth;
  const vpH = container.clientHeight;

  // 타일 1장의 CSS 픽셀 크기
  const tileW = vpW / cols;
  const tileH = vpH / cols;

  // 이 타일 중앙의 CSS 픽셀 좌표 (원본 뷰포트 기준)
  const cssX = col * tileW + tileW / 2;
  const cssY = row * tileH + tileH / 2;

  // unproject는 CSS픽셀 기준이므로 원본 center 상태에서만 호출
  return map.unproject([cssX, cssY]);
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
  const outW  = 1920 * cols;
  const outH  = 1080 * cols;

  const handleSlider = (raw: number) => {
    setHiResZoomDelta(Math.round(raw) as 0 | 1 | 2);
  };

  const handleCapture = useCallback(async () => {
    if (!mapInstance || hiResCapturing) return;
    setHiResCapturing(true);
    setProgress('준비 중...');

    // 원본 상태 저장
    const origCenter  = mapInstance.getCenter();
    const origZoom    = mapInstance.getZoom();
    const origBearing = mapInstance.getBearing();
    const origPitch   = mapInstance.getPitch();

    try {
      // ── 1단계: 타일 중앙 좌표를 원본 위치에서 미리 계산 ──────────────
      // jumpTo 전에 계산해야 unproject가 정확함
      const tileCenters: mapboxgl.LngLat[][] = [];
      if (delta > 0) {
        for (let row = 0; row < cols; row++) {
          tileCenters[row] = [];
          for (let col = 0; col < cols; col++) {
            tileCenters[row][col] = getTileCenter(mapInstance, col, row, cols);
          }
        }
      }

      // ── 2단계: 출력 캔버스 준비 ──────────────────────────────────────
      const outCanvas = document.createElement('canvas');
      outCanvas.width  = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d')!;

      if (delta === 0) {
        // FHD: 현재 뷰 단일 캡처
        setProgress('캡처 중...');
        await waitStable(mapInstance);

        const cv = mapInstance.getCanvas();
        // 비율 보정 센터크롭
        const srcAR = cv.width / cv.height;
        const dstAR = outW / outH;
        let sx = 0, sy = 0, sw = cv.width, sh = cv.height;
        if (srcAR > dstAR) { sw = Math.round(cv.height * dstAR); sx = Math.round((cv.width - sw) / 2); }
        else if (srcAR < dstAR) { sh = Math.round(cv.width / dstAR); sy = Math.round((cv.height - sh) / 2); }
        ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, outW, outH);

      } else {
        // ── 3단계: 타일별 캡처 ─────────────────────────────────────────
        const total = cols * cols;
        let tileIdx = 0;

        for (let row = 0; row < cols; row++) {
          for (let col = 0; col < cols; col++) {
            tileIdx++;
            setProgress(`타일 ${tileIdx} / ${total} 캡처 중...`);

            // 미리 계산한 좌표로 이동 (줌 반드시 고정)
            mapInstance.jumpTo({
              center: tileCenters[row][col],
              zoom: origZoom,
              bearing: origBearing,
              pitch: origPitch,
            });

            await waitStable(mapInstance);

            const cv = mapInstance.getCanvas();

            // 비율 보정: cv가 정확히 cols등분 비율이 아닐 경우 센터크롭
            // 타일 1장 목표 비율 = 1920:1080 = 16:9
            const tileOutW = outW / cols;  // 1920
            const tileOutH = outH / cols;  // 1080
            const srcAR = cv.width / cv.height;
            const dstAR = tileOutW / tileOutH;
            let sx = 0, sy = 0, sw = cv.width, sh = cv.height;
            if (srcAR > dstAR) { sw = Math.round(cv.height * dstAR); sx = Math.round((cv.width - sw) / 2); }
            else if (srcAR < dstAR) { sh = Math.round(cv.width / dstAR); sy = Math.round((cv.height - sh) / 2); }

            ctx.drawImage(
              cv,
              sx, sy, sw, sh,                    // src: 크롭된 영역
              col * tileOutW, row * tileOutH,    // dst 위치
              tileOutW, tileOutH,                // dst 크기
            );
          }
        }
      }

      // ── 4단계: 저장 ──────────────────────────────────────────────────
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
      // 원위치 복원
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
            type="range"
            className="custom-slider"
            min={0} max={2} step={1}
            value={delta}
            onChange={(e) => handleSlider(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', padding: '0 2px' }}>
            {(['FHD', '4K', '8K'] as const).map((label, v) => (
              <span key={v} style={{
                ...monoStyle, fontSize: '10px',
                opacity: delta === v ? 1 : 0.4,
                fontWeight: delta === v ? 600 : 400,
              }}>
                {label}
              </span>
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
