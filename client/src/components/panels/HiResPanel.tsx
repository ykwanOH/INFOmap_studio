/**
 * MACRO Map Studio — Hi-Res Capture Panel (v8)
 *
 * ── 뷰포트 4귀퉁이 unproject + 선형보간 ──
 *
 * 핵심 아이디어:
 *   1. 원본 위치에서 뷰포트 4귀퉁이 좌표를 unproject (4번만, 정확함)
 *   2. 그 좌표들을 선형보간해서 각 타일 중앙 좌표 계산
 *   3. jumpTo 후 unproject를 전혀 안 씀 → center 이동에 완전 독립
 *
 * Mercator는 평면 투영이라 선형보간이 정확하게 작동함.
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

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

/**
 * 뷰포트 4귀퉁이를 unproject한 뒤 선형보간으로 타일 중앙 좌표 계산.
 * 반드시 원본 위치에서 1회만 호출. jumpTo 전에 모든 좌표를 미리 뽑아둠.
 */
function calcAllTileCenters(
  map: mapboxgl.Map,
  vpW: number,
  vpH: number,
  cols: number,
): mapboxgl.LngLat[][] {
  // 4귀퉁이 unproject (원본 center/zoom 기준, 정확)
  const tl = map.unproject([0,    0   ]);  // top-left
  const tr = map.unproject([vpW,  0   ]);  // top-right
  const bl = map.unproject([0,    vpH ]);  // bottom-left
  const br = map.unproject([vpW,  vpH ]);  // bottom-right

  return Array.from({ length: cols }, (_, row) =>
    Array.from({ length: cols }, (_, col) => {
      // 타일 중앙의 정규화된 위치 (0~1)
      const tx = (col * (vpW / cols) + (vpW / cols) / 2) / vpW;
      const ty = (row * (vpH / cols) + (vpH / cols) / 2) / vpH;

      // 선형보간: 상단 엣지, 하단 엣지, 최종
      const topLng = lerp(tl.lng, tr.lng, tx);
      const topLat = lerp(tl.lat, tr.lat, tx);
      const botLng = lerp(bl.lng, br.lng, tx);
      const botLat = lerp(bl.lat, br.lat, tx);

      return new mapboxgl.LngLat(
        lerp(topLng, botLng, ty),
        lerp(topLat, botLat, ty),
      );
    })
  );
}

function getCropParams(srcW: number, srcH: number, dstW: number, dstH: number) {
  const srcAR = srcW / srcH;
  const dstAR = dstW / dstH;
  let sx = 0, sy = 0, sw = srcW, sh = srcH;
  if (srcAR > dstAR) { sw = Math.round(srcH * dstAR); sx = Math.round((srcW - sw) / 2); }
  else if (srcAR < dstAR) { sh = Math.round(srcW / dstAR); sy = Math.round((srcH - sh) / 2); }
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
  const outW  = 1920 * cols;
  const outH  = 1080 * cols;

  const handleCapture = useCallback(async () => {
    if (!mapInstance || hiResCapturing) return;
    setHiResCapturing(true);
    setProgress('준비 중...');

    const origCenter  = mapInstance.getCenter();
    const origZoom    = mapInstance.getZoom();
    const origBearing = mapInstance.getBearing();
    const origPitch   = mapInstance.getPitch();

    const container = mapInstance.getContainer();
    const vpW = container.clientWidth;
    const vpH = container.clientHeight;

    try {
      const outCanvas = document.createElement('canvas');
      outCanvas.width  = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d')!;

      if (delta === 0) {
        setProgress('캡처 중...');
        await waitStable(mapInstance);
        const cv = mapInstance.getCanvas();
        const { sx, sy, sw, sh } = getCropParams(cv.width, cv.height, outW, outH);
        ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, outW, outH);

      } else {
        // ── 핵심: 원본 위치에서 전체 타일 좌표 한 번에 계산 ─────────
        const tileCenters = calcAllTileCenters(mapInstance, vpW, vpH, cols);

        const tileOutW = outW / cols;  // 1920
        const tileOutH = outH / cols;  // 1080
        const total = cols * cols;
        let idx = 0;

        for (let row = 0; row < cols; row++) {
          for (let col = 0; col < cols; col++) {
            idx++;
            setProgress(`타일 ${idx} / ${total} 캡처 중...`);

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
              cv, sx, sy, sw, sh,
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
