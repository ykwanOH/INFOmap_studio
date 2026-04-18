/**
 * MACRO Map Studio — Hi-Res Capture Panel (v13 · GL pixelRatio)
 *
 * ── Static API 완전 폐기 ──
 * 이유: 커스텀 컬러(landmass/hydro/border 등)를 반영 불가
 *
 * ── GL pixelRatio 방식 복귀 ──
 * mapInstance.setPixelRatio(ratio * mult) 로 캔버스를 mult배 확대 렌더
 * → 단일 캡처, jumpTo 없음, 커스텀 스타일 100% 반영
 * → 출력은 현재 뷰 비율 그대로 (16:9 강제 안 함)
 *
 * delta=0: ×1  → 현재 해상도
 * delta=1: ×2  → 4K급 (현재 창이 FHD면 4K 출력)
 * delta=2: ×4  → 8K급
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

const MULT: Record<0 | 1 | 2, number> = { 0: 1, 1: 2, 2: 4 };
const MULT_LABEL: Record<0 | 1 | 2, string> = {
  0: '현재 해상도  ×1',
  1: '고해상도     ×2',
  2: '초고해상도   ×4',
};

function waitIdle(map: mapboxgl.Map): Promise<void> {
  return new Promise((resolve) => {
    // render 이벤트가 N프레임 동안 안 오면 완료
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        map.off('render', reset);
        resolve();
      }, 120); // 120ms 동안 추가 render 없으면 안정
    };
    map.on('render', reset);
    map.triggerRepaint();
    reset(); // 초기 타이머 시작
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
  const mult  = MULT[delta];

  const handleCapture = useCallback(async () => {
    if (!mapInstance || hiResCapturing) return;
    setHiResCapturing(true);
    setProgress('렌더링 중...');

    // 현재 pixelRatio 저장
    const origRatio: number =
      (mapInstance as any)._pixelRatio ??
      window.devicePixelRatio ?? 1;

    try {
      if (mult === 1) {
        // ×1: 그냥 현재 캔버스 저장
        await waitIdle(mapInstance);
      } else {
        // ×N: pixelRatio 올려서 고해상도 렌더
        if (typeof (mapInstance as any).setPixelRatio === 'function') {
          (mapInstance as any).setPixelRatio(origRatio * mult);
        } else {
          (mapInstance as any)._pixelRatio = origRatio * mult;
          (mapInstance as any).resize();
        }
        await waitIdle(mapInstance);
      }

      setProgress('저장 중...');

      // 캔버스 전체를 그대로 저장 (비율 강제 안 함)
      const cv = mapInstance.getCanvas();
      const outCanvas = document.createElement('canvas');
      outCanvas.width  = cv.width;
      outCanvas.height = cv.height;
      outCanvas.getContext('2d')!.drawImage(cv, 0, 0);

      const w = cv.width;
      const h = cv.height;

      outCanvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), {
          href: url,
          download: `macro_hires_${w}x${h}_${Date.now()}.png`,
        });
        document.body.appendChild(a); a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setProgress(null);
      }, 'image/png');

    } catch (e: any) {
      console.error('HiRes capture error', e);
      setProgress(`오류: ${e.message}`);
      setTimeout(() => setProgress(null), 3000);
    } finally {
      // pixelRatio 원복
      if (mult > 1) {
        try {
          if (typeof (mapInstance as any).setPixelRatio === 'function') {
            (mapInstance as any).setPixelRatio(origRatio);
          } else {
            (mapInstance as any)._pixelRatio = origRatio;
            (mapInstance as any).resize();
          }
          mapInstance.triggerRepaint();
        } catch (_) {}
      }
      setHiResCapturing(false);
    }
  }, [mapInstance, delta, mult, hiResCapturing, setHiResCapturing]);

  // 예상 출력 크기 계산 (현재 캔버스 기준)
  const canvasW = mapInstance?.getCanvas().width  ?? 0;
  const canvasH = mapInstance?.getCanvas().height ?? 0;
  const outW = canvasW * mult;
  const outH = canvasH * mult;

  return (
    <SectionPanel sectionKey="hiResCap" title="Hi-Res Capture">

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>View zoom</span>
        <span style={{ ...monoStyle, color: 'var(--foreground)' }}>{zoom.toFixed(1)}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={labelStyle}>Scale</span>
          <span style={{ ...monoStyle, color: 'var(--accent)' }}>×{mult}</span>
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type="range" className="custom-slider"
            min={0} max={2} step={1} value={delta}
            onChange={(e) => setHiResZoomDelta(Math.round(Number(e.target.value)) as 0 | 1 | 2)}
            style={{ width: '100%' }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', padding: '0 2px' }}>
            {(['×1', '×2', '×4'] as const).map((label, v) => (
              <span key={v} style={{
                ...monoStyle, fontSize: '10px',
                opacity: delta === v ? 1 : 0.4,
                fontWeight: delta === v ? 600 : 400,
              }}>{label}</span>
            ))}
          </div>
        </div>
      </div>

      {/* 설명 */}
      <div style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
        {MULT_LABEL[delta]}
      </div>

      {/* 예상 출력 크기 */}
      {outW > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '6px 8px', background: 'var(--glass-border)', opacity: 0.9,
        }}>
          <span style={{ ...labelStyle, fontSize: '11px' }}>Output</span>
          <span style={{ ...monoStyle, fontSize: '11px', color: 'var(--foreground)' }}>
            {outW} × {outH}
          </span>
        </div>
      )}

      <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
        커스텀 스타일 반영 · 지도 이동 없음
      </p>

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

      {hiResCapturing && progress && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)', textAlign: 'center' }}>
          {progress}
        </p>
      )}

    </SectionPanel>
  );
}
