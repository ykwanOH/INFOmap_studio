/**
 * MACRO Map Studio — Hi-Res Capture Panel (v2)
 *
 * ── 이전 방식의 문제 ──
 * 타일 분할: 오프스크린 tempMap을 여러 장 찍어 붙이는 방식
 * → 각 타일 캡처마다 GL 컨텍스트가 달라 이음새 어긋남(타일링 아티팩트) 발생
 *
 * ── 새 방식 ──
 * 메인 맵의 devicePixelRatio를 직접 높여 캔버스를 확대 렌더링 후,
 * 단일 이미지로 캡처하고 원래 ratio로 복원.
 * → 타일 이음새 없음, 동일 뷰 그대로 고해상도 출력
 *
 * delta=0: ratio×1 → FHD  (1920×1080)
 * delta=1: ratio×2 → 4K   (3840×2160)
 * delta=2: ratio×4 → 8K   (7680×4320)
 */

import { useCallback, useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { SectionPanel } from '@/components/ui/SectionPanel';
import { Download } from 'lucide-react';

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

// delta별 pixelRatio 배율
const PIXEL_RATIO_MULT: Record<0 | 1 | 2, number> = {
  0: 1,
  1: 2,
  2: 4,
};

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
  const mult = PIXEL_RATIO_MULT[delta];
  const outW = 1920 * mult;
  const outH = 1080 * mult;

  const handleSlider = (raw: number) => {
    const snapped = Math.round(raw) as 0 | 1 | 2;
    setHiResZoomDelta(snapped);
  };

  const handleCapture = useCallback(async () => {
    if (!mapInstance || hiResCapturing) return;
    setHiResCapturing(true);
    setProgress('준비 중...');

    // 원래 pixelRatio 저장
    const originalRatio: number =
      (mapInstance as any)._pixelRatio ??
      window.devicePixelRatio ??
      1;

    try {
      setProgress('고해상도 렌더링 중...');

      // ── pixelRatio 오버라이드: 캔버스 자체를 mult배로 확대 렌더 ──
      // setPixelRatio는 Mapbox GL v2.4+에서 공식 지원
      if (typeof (mapInstance as any).setPixelRatio === 'function') {
        (mapInstance as any).setPixelRatio(originalRatio * mult);
      } else {
        // fallback: 내부 프로퍼티 직접 조작
        (mapInstance as any)._pixelRatio = originalRatio * mult;
        (mapInstance as any).resize();
      }

      // 렌더 완전 안정화 대기: idle + 2프레임
      await new Promise<void>((resolve) => {
        const onIdle = () => {
          mapInstance.off('idle', onIdle);
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        };
        mapInstance.on('idle', onIdle);
        mapInstance.triggerRepaint();
      });

      setProgress('캔버스 읽는 중...');

      // 확대된 캔버스에서 단일 이미지 추출
      const srcCanvas = mapInstance.getCanvas();
      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d')!;
      ctx.drawImage(srcCanvas, 0, 0, outW, outH);

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
      // ── 반드시 원래 ratio로 복원 ──
      try {
        if (typeof (mapInstance as any).setPixelRatio === 'function') {
          (mapInstance as any).setPixelRatio(originalRatio);
        } else {
          (mapInstance as any)._pixelRatio = originalRatio;
          (mapInstance as any).resize();
        }
        mapInstance.triggerRepaint();
      } catch (_) {}
      setHiResCapturing(false);
    }
  }, [mapInstance, delta, mult, outW, outH, hiResCapturing, setHiResCapturing]);

  return (
    <SectionPanel sectionKey="hiResCap" title="Hi-Res Capture">
      {/* 줌 정보 행 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>View zoom</span>
        <span style={{ ...monoStyle, color: 'var(--foreground)' }}>{zoom.toFixed(1)}</span>
      </div>

      {/* 해상도 배율 슬라이더 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={labelStyle}>Scale</span>
          <span style={{ ...monoStyle, color: 'var(--accent)' }}>
            ×{mult} pixel ratio
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
            {([0, 1, 2] as const).map((v) => (
              <span key={v} style={{
                ...monoStyle,
                fontSize: '10px',
                opacity: delta === v ? 1 : 0.4,
                fontWeight: delta === v ? 600 : 400,
              }}>
                ×{PIXEL_RATIO_MULT[v]}
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

      {/* 방식 안내 */}
      <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
        단일 렌더 방식 · 타일 이음새 없음
      </p>

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
