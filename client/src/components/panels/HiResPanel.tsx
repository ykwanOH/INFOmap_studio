/**
 * MACRO Map Studio — Hi-Res Capture Panel
 *
 * 뷰 줌은 그대로 유지하되, 타일 분할 방식으로
 * 더 높은 줌 레벨의 디테일을 고해상도 이미지로 캡처.
 *
 * 캡처 줌 = 현재 뷰 줌 + delta (0 | 1 | 2)
 * 분할 수 = 2^delta × 2^delta (4 | 16 장)
 * 출력 px = 1920×delta_multiplier × 1080×delta_multiplier
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
} as const;

const monoStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '11px',
  color: 'var(--section-label-color)',
} as const;

// 출력 해상도 레이블
const RESOLUTION_LABEL: Record<0 | 1 | 2, string> = {
  0: 'FHD  1920 × 1080',
  1: '4K   3840 × 2160',
  2: '8K   7680 × 4320',
};

const TILE_COUNT: Record<0 | 1 | 2, number> = {
  0: 1,
  1: 4,
  2: 16,
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
  const captureZoom = zoom + delta;
  const cols = Math.pow(2, delta); // 1 | 2 | 4
  const outW = 1920 * cols;
  const outH = 1080 * cols;

  // 슬라이더 값 → 스냅 (0 | 1 | 2)
  const handleSlider = (raw: number) => {
    const snapped = Math.round(raw) as 0 | 1 | 2;
    setHiResZoomDelta(snapped);
  };

  const handleCapture = useCallback(async () => {
    if (!mapInstance || hiResCapturing) return;
    setHiResCapturing(true);
    setProgress('준비 중...');

    try {
      const center = mapInstance.getCenter();
      const bearing = mapInstance.getBearing();
      const pitch = mapInstance.getPitch();

      // 출력 캔버스
      const outCanvas = document.createElement('canvas');
      outCanvas.width = outW;
      outCanvas.height = outH;
      const ctx = outCanvas.getContext('2d')!;

      // delta=0: 단일 캡처
      if (delta === 0) {
        setProgress('캡처 중...');
        await new Promise<void>((resolve) => {
          mapInstance.once('render', () => {
            ctx.drawImage(mapInstance.getCanvas(), 0, 0, outW, outH);
            resolve();
          });
          mapInstance.triggerRepaint();
        });
      } else {
        // 타일 분할 캡처
        // ── 핵심: 픽셀 좌표 기준으로 타일 센터 계산 (Mercator 왜곡 보정) ──
        // 위도를 균등 분할하면 Mercator 비선형 때문에 픽셀 경계가 어긋남.
        // 대신 뷰포트 픽셀을 cols등분 → 각 타일 중앙 픽셀 → unproject()로 좌표 변환.
        const vpW = mapInstance.getCanvas().width;
        const vpH = mapInstance.getCanvas().height;
        const tileW = outW / cols;
        const tileH = outH / cols;

        // 타일 중앙 픽셀의 뷰포트 내 위치 (픽셀 단위)
        // 출력 픽셀과 뷰포트 픽셀의 비율로 스케일
        const scaleX = vpW / outW;
        const scaleY = vpH / outH;

        // 임시 오프스크린 맵 컨테이너 (타일 1장 크기)
        const tempContainer = document.createElement('div');
        tempContainer.style.cssText = `
          position:fixed; top:-9999px; left:-9999px;
          width:${tileW}px; height:${tileH}px;
          visibility:hidden; pointer-events:none;
        `;
        document.body.appendChild(tempContainer);

        const mapboxgl = (await import('mapbox-gl')).default;
        const tempMap = new mapboxgl.Map({
          container: tempContainer,
          style: mapInstance.getStyle(),
          center: center,
          zoom: captureZoom,
          bearing,
          pitch,
          interactive: false,
          attributionControl: false,
          preserveDrawingBuffer: true,
        });

        await new Promise<void>((res) => tempMap.on('load', res));

        // 렌더 완전 안정화 대기 헬퍼
        const waitStable = (map: typeof tempMap) =>
          new Promise<void>((resolve) => {
            const onIdle = () => {
              map.off('idle', onIdle);
              // idle 후 1프레임 더 기다려 GL 버퍼 flush 보장
              requestAnimationFrame(() => resolve());
            };
            map.on('idle', onIdle);
          });

        let tileIdx = 0;
        const total = cols * cols;

        for (let row = 0; row < cols; row++) {
          for (let col = 0; col < cols; col++) {
            tileIdx++;
            setProgress(`타일 캡처 ${tileIdx} / ${total}`);

            // 이 타일의 중앙이 원본 뷰포트에서 몇 픽셀인지 계산
            const centerPixelX = (col * tileW + tileW / 2) * scaleX;
            const centerPixelY = (row * tileH + tileH / 2) * scaleY;

            // 픽셀 → 지리 좌표 (Mercator 자동 보정)
            const tileCenterLngLat = mapInstance.unproject([centerPixelX, centerPixelY]);

            tempMap.jumpTo({
              center: [tileCenterLngLat.lng, tileCenterLngLat.lat],
              zoom: captureZoom,
            });

            await waitStable(tempMap);

            const srcCanvas = tempMap.getCanvas();
            ctx.drawImage(
              srcCanvas,
              col * tileW,
              row * tileH,
              tileW,
              tileH,
            );
          }
        }

        tempMap.remove();
        document.body.removeChild(tempContainer);
      }

      setProgress('저장 중...');
      const link = document.createElement('a');
      link.download = `macro_hires_z${captureZoom.toFixed(1)}_${outW}x${outH}_${Date.now()}.png`;
      link.href = outCanvas.toDataURL('image/png');
      link.click();
      setProgress(null);
    } catch (e) {
      console.error('HiRes capture error', e);
      setProgress(null);
    } finally {
      setHiResCapturing(false);
    }
  }, [mapInstance, delta, captureZoom, outW, outH, hiResCapturing, setHiResCapturing]);

  return (
    <SectionPanel sectionKey="hiResCap" title="Hi-Res Capture">
      {/* 줌 정보 행 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>View zoom</span>
        <span style={{ ...monoStyle, color: 'var(--foreground)' }}>{zoom.toFixed(1)}</span>
      </div>

      {/* 캡처 줌 델타 슬라이더 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={labelStyle}>Detail zoom</span>
          <span style={{ ...monoStyle, color: 'var(--accent)' }}>
            +{delta} → z{captureZoom.toFixed(1)}
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
          {/* 스텝 라벨 */}
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
                +{v}
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

      {/* 타일 수 안내 (delta > 0 일 때만) */}
      {delta > 0 && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
          {cols}×{cols} 타일 분할 · {TILE_COUNT[delta]}장 이어붙임
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
