/**
 * INFOmap Studio — Hi-Res Capture Panel (v13 · GL pixelRatio)
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

  // 출력 크기: 현재 캔버스 × mult
  const getOutputSize = () => {
    const src = mapInstance?.getCanvas();
    if (!src) return { w: 0, h: 0 };
    return { w: src.width * mult, h: src.height * mult };
  };
  const { w: outW, h: outH } = getOutputSize();

  const handleCapture = useCallback(async () => {
    if (!mapInstance || hiResCapturing) return;
    setHiResCapturing(true);
    setProgress('렌더링 중...');

    try {
      // mapInstance.getCanvas() → 현재 렌더된 캔버스를 그대로 가져와
      // 새 오프스크린 캔버스에 mult배 크기로 drawImage 업스케일
      await new Promise<void>((resolve) => {
        mapInstance.once('idle', () => resolve());
        mapInstance.triggerRepaint();
        setTimeout(resolve, 2000); // 안전망
      });

      setProgress('저장 중...');

      const src = mapInstance.getCanvas();
      const outW = src.width * mult;
      const outH = src.height * mult;

      const out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      const ctx = out.getContext('2d')!;
      // imageSmoothingQuality high → 업스케일 시 선명도 유지
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(src, 0, 0, outW, outH);

      out.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), {
          href: url,
          download: `infomap_hires_${outW}x${outH}_${Date.now()}.png`,
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
      setHiResCapturing(false);
    }
  }, [mapInstance, mult, hiResCapturing, setHiResCapturing]);

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
        className="action-btn primary"
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
