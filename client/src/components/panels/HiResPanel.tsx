/**
 * MACRO Map Studio — Hi-Res Capture Panel (v3)
 *
 * ── Mercator 기반 타일링 방식 ──
 * projection이 mercator(평면)로 바뀌면서 픽셀↔좌표 변환이 선형.
 * → 타일 분할 캡처가 정확히 맞아떨어짐 (이음새 없음)
 *
 * delta=0: FHD  1920×1080  (단일 캡처)
 * delta=1: 4K   3840×2160  (2×2 = 4타일)
 * delta=2: 8K   7680×4320  (4×4 = 16타일)
 *
 * 각 타일은 메인 맵과 동일한 스타일·줌으로 오프스크린 렌더링.
 * unproject()로 타일 중앙 좌표를 계산 → Mercator에서 픽셀 경계 정확 일치.
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

const TILE_COLS: Record<0 | 1 | 2, number> = {
  0: 1,
  1: 2,
  2: 4,
};

// 렌더 완전 안정화 대기: idle + 2프레임
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
  const cols = TILE_COLS[delta];
  const outW = 1920 * cols;
  const outH = 1080 * cols;
  const tileW = 1920;
  const tileH = 1080;

  const handleSlider = (raw: number) => {
    const snapped = Math.round(raw) as 0 | 1 | 2;
    setHiResZoomDelta(snapped);
  };

  const handleCapture = useCallback(async () => {
    if (!mapInstance || hiResCapturing) return;
    setHiResCapturing(true);
    setProgress('준비 중...');

    try {
      const center  = mapInstance.getCenter();
      const bearing = mapInstance.getBearing();
      const pitch   = mapInstance.getPitch();
      const style   = mapInstance.getStyle();

      // 출력 캔버스
      const outCanvas = document.createElement('canvas');
      outCanvas.width  = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d')!;

      if (delta === 0) {
        // ── 단일 캡처 (FHD) ───────────────────────────────────────────────
        setProgress('캡처 중...');
        await waitStable(mapInstance);
        ctx.drawImage(mapInstance.getCanvas(), 0, 0, tileW, tileH);

      } else {
        // ── 타일 분할 캡처 (Mercator 기준 픽셀 선형 계산) ────────────────
        const vpW = mapInstance.getCanvas().width;
        const vpH = mapInstance.getCanvas().height;

        // 뷰포트 픽셀 → 출력 픽셀 스케일
        const scaleX = vpW / outW;
        const scaleY = vpH / outH;

        // 오프스크린 컨테이너 (타일 1장 = 1920×1080)
        const tempContainer = document.createElement('div');
        tempContainer.style.cssText = `
          position:fixed; top:-9999px; left:-9999px;
          width:${tileW}px; height:${tileH}px;
          visibility:hidden; pointer-events:none;
        `;
        document.body.appendChild(tempContainer);

        const tempMap = new mapboxgl.Map({
          container: tempContainer,
          style,
          center,
          zoom,
          bearing,
          pitch,
          interactive: false,
          attributionControl: false,
          preserveDrawingBuffer: true,
          projection: 'mercator' as any,
        });

        await new Promise<void>((res) => tempMap.on('load', res));
        await waitStable(tempMap);

        const total = cols * cols;
        let tileIdx = 0;

        for (let row = 0; row < cols; row++) {
          for (let col = 0; col < cols; col++) {
            tileIdx++;
            setProgress(`타일 ${tileIdx} / ${total} 캡처 중...`);

            // 타일 중앙의 출력 픽셀 위치 → 뷰포트 픽셀로 환산
            const centerPxX = (col * tileW + tileW / 2) * scaleX;
            const centerPxY = (row * tileH + tileH / 2) * scaleY;

            // Mercator: unproject 선형 → 타일 경계 정확히 일치
            const tileLngLat = mapInstance.unproject([centerPxX, centerPxY]);

            tempMap.jumpTo({
              center: [tileLngLat.lng, tileLngLat.lat],
              zoom,
            });

            await waitStable(tempMap);

            const srcCv = tempMap.getCanvas();
            ctx.drawImage(
              srcCv,
              0, 0, srcCv.width, srcCv.height,
              col * tileW, row * tileH, tileW, tileH,
            );
          }
        }

        tempMap.remove();
        document.body.removeChild(tempContainer);
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
      setHiResCapturing(false);
    }
  }, [mapInstance, delta, cols, zoom, outW, outH, tileW, tileH, hiResCapturing, setHiResCapturing]);

  return (
    <SectionPanel sectionKey="hiResCap" title="Hi-Res Capture">
      {/* 줌 정보 행 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>View zoom</span>
        <span style={{ ...monoStyle, color: 'var(--foreground)' }}>{zoom.toFixed(1)}</span>
      </div>

      {/* 해상도 슬라이더 */}
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
            min={0}
            max={2}
            step={1}
            value={delta}
            onChange={(e) => handleSlider(Number(e.target.value))}
            style={{ width: '100%' }}
          />
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: '2px',
            padding: '0 2px',
          }}>
            {(['FHD', '4K', '8K'] as const).map((label, v) => (
              <span key={v} style={{
                ...monoStyle,
                fontSize: '10px',
                opacity: delta === v ? 1 : 0.4,
                fontWeight: delta === v ? 600 : 400,
              }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* 출력 해상도 표시 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 8px',
        background: 'var(--glass-border)',
        opacity: 0.9,
      }}>
        <span style={{ ...labelStyle, fontSize: '11px' }}>Output</span>
        <span style={{ ...monoStyle, fontSize: '11px', color: 'var(--foreground)' }}>
          {RESOLUTION_LABEL[delta]}
        </span>
      </div>

      {/* 타일 안내 */}
      {delta > 0 && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
          Mercator 타일링 · {cols * cols}장 이어붙임
        </p>
      )}

      {/* 캡처 버튼 */}
      <button
        className="action-btn"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          fontWeight: 600,
          opacity: hiResCapturing ? 0.6 : 1,
        }}
        onClick={handleCapture}
        disabled={hiResCapturing}
      >
        <Download size={11} />
        {hiResCapturing ? progress ?? 'Capturing...' : 'Capture PNG'}
      </button>

      {/* 진행 상태 */}
      {hiResCapturing && progress && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)', textAlign: 'center' }}>
          {progress}
        </p>
      )}
    </SectionPanel>
  );
}
