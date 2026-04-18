/**
 * MACRO Map Studio — Hi-Res Capture Panel (v4)
 *
 * ── 전략: 메인 맵 직접 이동 방식 ──
 * tempMap(오프스크린)은 GL 컨텍스트 크기가 보장되지 않아 타일 반복/왜곡 발생.
 * → 메인 맵 자체를 타일 중앙으로 jumpTo → 캡처 → 다음 타일 반복 → 원위치 복원.
 * 동일한 GL 컨텍스트·동일한 캔버스 크기이므로 타일 경계가 정확히 일치.
 *
 * delta=0: FHD  1920×1080  (단일, 이동 없음)
 * delta=1: 4K   3840×2160  (2×2 = 4타일)
 * delta=2: 8K   7680×4320  (4×4 = 16타일)
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

    // 현재 상태 저장 (복원용)
    const origCenter  = mapInstance.getCenter();
    const origZoom    = mapInstance.getZoom();
    const origBearing = mapInstance.getBearing();
    const origPitch   = mapInstance.getPitch();

    // 메인 캔버스 실제 픽셀 크기 (devicePixelRatio 반영된 실제 GL 해상도)
    const cvW = mapInstance.getCanvas().width;
    const cvH = mapInstance.getCanvas().height;

    try {
      // 출력 캔버스
      const outCanvas = document.createElement('canvas');
      outCanvas.width  = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d')!;

      if (delta === 0) {
        // ── FHD: 현재 뷰 그대로 단일 캡처 ─────────────────────────────
        setProgress('캡처 중...');
        await waitStable(mapInstance);
        ctx.drawImage(mapInstance.getCanvas(), 0, 0, outW, outH);

      } else {
        // ── 4K/8K: 메인 맵을 타일별로 이동하며 캡처 ─────────────────────
        // 뷰포트 1장이 출력 전체의 1/cols 크기
        // → 타일 i의 중앙이 원본 뷰포트의 몇 픽셀인지 계산 (GL 실제 픽셀 기준)
        const tileGlW = cvW / cols;  // 타일 1장의 GL 픽셀 폭
        const tileGlH = cvH / cols;  // 타일 1장의 GL 픽셀 높

        const total = cols * cols;
        let tileIdx = 0;

        for (let row = 0; row < cols; row++) {
          for (let col = 0; col < cols; col++) {
            tileIdx++;
            setProgress(`타일 ${tileIdx} / ${total} 캡처 중...`);

            // 이 타일 중앙이 원본 뷰포트에서 몇 GL픽셀인지
            const centerGlX = col * tileGlW + tileGlW / 2;
            const centerGlY = row * tileGlH + tileGlH / 2;

            // GL픽셀 → 지리좌표 (Mercator 선형 변환)
            const tileLngLat = mapInstance.unproject([
              centerGlX / window.devicePixelRatio,
              centerGlY / window.devicePixelRatio,
            ]);

            // 메인 맵을 타일 중앙으로 이동 (줌 유지)
            mapInstance.jumpTo({
              center: [tileLngLat.lng, tileLngLat.lat],
              zoom: origZoom,
            });

            await waitStable(mapInstance);

            // 캔버스 전체를 출력 캔버스의 해당 타일 위치에 그리기
            ctx.drawImage(
              mapInstance.getCanvas(),
              0, 0, cvW, cvH,               // src: 캔버스 전체
              col * (outW / cols),           // dst x
              row * (outH / cols),           // dst y
              outW / cols,                   // dst w
              outH / cols,                   // dst h
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
      // ── 원래 위치·줌·각도로 복원 ──
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
      {delta > 0 && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
          캡처 중 지도가 잠시 이동합니다
        </p>
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
