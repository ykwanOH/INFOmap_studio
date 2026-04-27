/**
 * INFOmap Studio — Pick & Export Panel
 *
 * - Pick 버튼으로 나라 선택
 * - Floating / Extrude 모드 토글 (공유 높이 슬라이더)
 * - 선택 나라별 Fill Color / Border Color / Border Width 편집
 * - Export: PNG (전체 or 선택만 투명배경) / SVG (선택만)
 */

import { useState } from 'react';
import { useMapStore, type PickDisplayMode, type PickUnitMode } from '@/store/useMapStore';
import { SectionPanel, SliderControl, ColorPicker, Toggle } from '@/components/ui/SectionPanel';
import { MousePointer2, RotateCcw, Trash2, X, Download } from 'lucide-react';

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
  fontSize: '10px',
} as const;

export function PickPushPanel() {
  const {
    borders,
    pickMode, setPickMode,
    pickDisplayMode, setPickDisplayMode,
    pickUnitMode, setPickUnitMode,
    extrudeLightAzimuth, setExtrudeLightAzimuth,
    extrudeAOIntensity, setExtrudeAOIntensity,
    extrudeAORadius, setExtrudeAORadius,
    pickedFeatures,
    currentGroupId,
    updatePickedFeature,
    updateCurrentGroupHeight,
    updateCurrentGroupProps,
    clearPickedFeatures,
    resetAllPicks,
    mapInstance,
    extraLook,
  } = useMapStore();

  const [selectionOnly, setSelectionOnly] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResolution, setExportResolution] = useState<'fhd' | '4k'>('fhd');

  const pickUnit = borders.district.enabled ? '구 / 시군'
    : borders.state.enabled ? '주 / 도' : '국가';

  const currentGroupFeatures = pickedFeatures.filter(f => (f as any).groupId === currentGroupId);
  const lastPicked = pickedFeatures[pickedFeatures.length - 1] ?? null;
  const currentGroupHeight = currentGroupFeatures[0]?.floatHeight ?? 0;

  const updateCurrentGroup = (updates: Partial<import('@/store/useMapStore').PickedFeature>) => {
    updateCurrentGroupProps(updates);
  };

  const getFeatureName = (f: typeof lastPicked) => {
    if (!f) return '';
    const meta = (f as any).meta;
    if (meta?.sggnm) return `${meta.sidonm} ${meta.sggnm}`;
    if (meta?.sidonm) return meta.sidonm;
    return f.sourceLayer || `feature-${f.id}`;
  };

  const removeFeature = (id: string | number) => {
    useMapStore.setState({
      pickedFeatures: useMapStore.getState().pickedFeatures.filter((f) => f.id !== id),
    });
  };

  // ── Export helpers ──────────────────────────────────────────────────────
  const resW = exportResolution === '4k' ? 3840 : 1920;
  const resH = exportResolution === '4k' ? 2160 : 1080;

  const applyLookFilter = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    if (!extraLook) return;
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    if (extraLook === 'monotone') {
      for (let i = 0; i < d.length; i += 4) {
        const g = d[i] * 0.299 + d[i+1] * 0.587 + d[i+2] * 0.114;
        d[i] = d[i+1] = d[i+2] = Math.min(255, g * 1.2);
      }
    } else if (extraLook === 'vintage') {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, d[i] * 1.1 + 20);
        d[i+1] = Math.min(255, d[i+1] * 0.95 + 10);
        d[i+2] = Math.min(255, d[i+2] * 0.8);
      }
    } else if (extraLook === 'digital') {
      for (let i = 0; i < d.length; i += 4) {
        d[i] = Math.min(255, d[i] * 0.95);
        d[i+1] = Math.min(255, d[i+1] * 1.05);
        d[i+2] = Math.min(255, d[i+2] * 1.3);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  };

  const handleExportPNG = async () => {
    if (!mapInstance) return;
    setIsExporting(true);
    try {
      mapInstance.once('render', () => {
        try {
          const src = mapInstance.getCanvas();

          // ── 비율 왜곡 수정 ──────────────────────────────────────────────
          // src는 devicePixelRatio가 반영된 실제 픽셀 크기
          // CSS 뷰포트의 실제 16:9 비율을 기준으로 src를 center-crop해서
          // resW×resH(FHD/4K)에 정확히 맞춤
          const dpr = window.devicePixelRatio || 1;
          // CSS 뷰포트 크기 (배율 독립적인 논리 픽셀)
          const cssW = src.width / dpr;
          const cssH = src.height / dpr;
          // 목표 비율 (16:9)
          const targetRatio = resW / resH;
          const srcRatio = cssW / cssH;

          // src에서 center-crop할 영역 계산 (물리 픽셀 단위)
          let cropX = 0, cropY = 0, cropW = src.width, cropH = src.height;
          if (Math.abs(srcRatio - targetRatio) > 0.001) {
            if (srcRatio > targetRatio) {
              // src가 더 넓음 → 좌우 crop
              cropW = Math.round(src.height * targetRatio);
              cropX = Math.round((src.width - cropW) / 2);
            } else {
              // src가 더 높음 → 상하 crop
              cropH = Math.round(src.width / targetRatio);
              cropY = Math.round((src.height - cropH) / 2);
            }
          }

          // map.project()는 CSS픽셀 기준 → 물리픽셀 변환 스케일
          const scaleX = cropW / cssW;
          const scaleY = cropH / cssH;

          // ── city marker 위치 계산 헬퍼 ──────────────────────────────────
          const drawMarkers = (ctx: CanvasRenderingContext2D, sw: number, sh: number) => {
            const storeMarkers = useMapStore.getState().markers;
            if (!storeMarkers.length) return;
            storeMarkers.forEach((m) => {
              const pt = mapInstance.project([m.lng, m.lat]);
              // CSS픽셀 → crop 기준 물리픽셀 → 출력 픽셀
              const px = ((pt.x * dpr - cropX) / cropW) * sw;
              const py = ((pt.y * dpr - cropY) / cropH) * sh;
              if (px < 0 || px > sw || py < 0 || py > sh) return;
              // 도트 그리기
              const r = Math.max(6, sw / 320);
              ctx.beginPath();
              ctx.arc(px, py, r, 0, Math.PI * 2);
              ctx.fillStyle = m.color;
              ctx.fill();
              ctx.strokeStyle = 'rgba(255,255,255,0.85)';
              ctx.lineWidth = Math.max(1.5, r * 0.35);
              ctx.stroke();
            });
          };

          const out = document.createElement('canvas');
          out.width = resW; out.height = resH;
          const ctx = out.getContext('2d')!;

          if (selectionOnly && pickedFeatures.length > 0) {
            // 투명 배경 — 선택 나라만 표시
            ctx.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, resW, resH);
            if (extraLook) applyLookFilter(ctx, resW, resH);

            const maskCanvas2 = document.createElement('canvas');
            maskCanvas2.width = resW; maskCanvas2.height = resH;
            const m2 = maskCanvas2.getContext('2d')!;
            pickedFeatures.forEach((f) => {
              const geo = (f as any).geometry as GeoJSON.Geometry | undefined;
              if (!geo) return;
              const rings: number[][][] = geo.type === 'Polygon'
                ? geo.coordinates
                : geo.type === 'MultiPolygon'
                  ? geo.coordinates.flat()
                  : [];
              rings.forEach((ring) => {
                m2.beginPath();
                ring.forEach((coord, i) => {
                  const pt = mapInstance.project([coord[0], coord[1]]);
                  const px = ((pt.x * dpr - cropX) / cropW) * resW;
                  const py = ((pt.y * dpr - cropY) / cropH) * resH;
                  i === 0 ? m2.moveTo(px, py) : m2.lineTo(px, py);
                });
                m2.closePath();
                m2.fillStyle = 'rgba(255,255,255,1)';
                m2.fill();
              });
            });
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = resW; finalCanvas.height = resH;
            const fCtx = finalCanvas.getContext('2d')!;
            fCtx.drawImage(out, 0, 0);
            fCtx.globalCompositeOperation = 'destination-in';
            fCtx.drawImage(maskCanvas2, 0, 0);
            fCtx.globalCompositeOperation = 'source-over';
            drawMarkers(fCtx, resW, resH);
            const link = document.createElement('a');
            link.download = `infomap_pick_${exportResolution}_${Date.now()}.png`;
            link.href = finalCanvas.toDataURL('image/png');
            link.click();
          } else {
            // 전체 viewport — center-crop으로 비율 보정
            ctx.drawImage(src, cropX, cropY, cropW, cropH, 0, 0, resW, resH);
            if (extraLook) applyLookFilter(ctx, resW, resH);
            if (extraLook === 'vintage') {
              for (let y = 0; y < resH; y += 4) {
                ctx.fillStyle = 'rgba(0,0,0,0.06)';
                ctx.fillRect(0, y, resW, 2);
              }
            }
            drawMarkers(ctx, resW, resH);
            const link = document.createElement('a');
            link.download = `infomap_map_${exportResolution}_${Date.now()}.png`;
            link.href = out.toDataURL('image/png');
            link.click();
          }
        } catch (e) { console.error('Export PNG error', e); }
        finally { setIsExporting(false); }
      });
      mapInstance.triggerRepaint();
    } catch (e) {
      console.error('Export PNG error', e);
      setIsExporting(false);
    }
  };

  const handleExportSVG = () => {
    if (pickedFeatures.length === 0 || !mapInstance) return;

    // PNG export와 동일한 좌표 변환 사용 (dpr + center-crop)
    const src = mapInstance.getCanvas();
    const dpr = window.devicePixelRatio || 1;
    const cssW = src.width / dpr;
    const cssH = src.height / dpr;
    const targetRatio = resW / resH;
    const srcRatio = cssW / cssH;

    let cropX = 0, cropY = 0, cropW = src.width, cropH = src.height;
    if (Math.abs(srcRatio - targetRatio) > 0.001) {
      if (srcRatio > targetRatio) {
        cropW = Math.round(src.height * targetRatio);
        cropX = Math.round((src.width - cropW) / 2);
      } else {
        cropH = Math.round(src.width / targetRatio);
        cropY = Math.round((src.height - cropH) / 2);
      }
    }

    // project()는 CSS픽셀 반환 → dpr 곱해서 물리픽셀 → crop 기준 → 출력픽셀
    const svgParts = pickedFeatures.map((f) => {
      const geo = (f as any).geometry as GeoJSON.Geometry | undefined;
      if (!geo) return '';
      const rings: number[][][] = geo.type === 'Polygon'
        ? geo.coordinates
        : geo.type === 'MultiPolygon'
          ? geo.coordinates.flat()
          : [];
      const d = rings.map((ring) => {
        return ring.map((coord, i) => {
          const pt = mapInstance.project([coord[0], coord[1]]);
          const px = (((pt.x * dpr - cropX) / cropW) * resW).toFixed(2);
          const py = (((pt.y * dpr - cropY) / cropH) * resH).toFixed(2);
          return `${i === 0 ? 'M' : 'L'}${px},${py}`;
        }).join(' ') + ' Z';
      }).join(' ');
      return `<path d="${d}" fill="${f.fillColor}" fill-opacity="0.7" stroke="${f.borderColor}" stroke-width="${f.borderWidth}" fill-rule="evenodd" />`;
    }).filter(Boolean);

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${resW} ${resH}" width="${resW}" height="${resH}">
  <!-- INFOmap Studio · Pick & Export · ${new Date().toISOString()} -->
  ${svgParts.join('\n  ')}
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `infomap_pick_${exportResolution}_${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionPanel sectionKey="pickPush" title="Region Pick">

      {/* Pick 단위 선택 */}
      <div style={{ display: 'flex', gap: '4px' }}>
        {(['country', 'state'] as PickUnitMode[]).map((u) => (
          <button
            key={u}
            className={`action-btn secondary ${pickUnitMode === u ? 'active' : ''}`}
            style={{ flex: 1, padding: '4px 0', fontSize: '11px' }}
            onClick={() => setPickUnitMode(u)}
          >
            {u === 'country' ? '🌍 국가' : '📍 주 · 구'}
          </button>
        ))}
      </div>

      {/* Pick + Clear + Reset */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          className={`action-btn primary ${pickMode ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          onClick={() => setPickMode(!pickMode)}
        >
          <MousePointer2 size={11} />
          {pickMode ? 'Picking...' : 'Pick'}
        </button>
        <button className="action-btn danger"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          onClick={clearPickedFeatures} disabled={pickedFeatures.length === 0} title="Clear">
          <Trash2 size={11} /> Clear
        </button>
        <button className="action-btn"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 8px' }}
          onClick={resetAllPicks} title="Reset all">
          <RotateCcw size={11} />
        </button>
      </div>

      {pickMode && (
        <p style={{ ...labelStyle, color: 'var(--accent)', fontSize: '11px' }}>지도에서 {pickUnit} 클릭</p>
      )}

      {/* Floating / Extrude 모드 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={labelStyle}>Display</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['floating', 'extrude'] as PickDisplayMode[]).map((m) => (
            <button
              key={m}
              className={`action-btn secondary ${pickDisplayMode === m ? 'active' : ''}`}
              style={{ padding: '3px 10px', fontSize: '11px' }}
              onClick={() => setPickDisplayMode(m)}
            >
              {m === 'floating' ? 'Float' : 'Extrude'}
            </button>
          ))}
        </div>
      </div>

      {/* 빛 방향 + AO — extrude/float 모드에서 표시 */}
      <SliderControl
        label="Light Dir"
        value={extrudeLightAzimuth}
        min={0} max={360} step={5}
        onChange={setExtrudeLightAzimuth}
        displayValue={`${extrudeLightAzimuth}°`}
      />
      <SliderControl
        label="AO Intensity"
        value={extrudeAOIntensity}
        min={0} max={1} step={0.05}
        onChange={setExtrudeAOIntensity}
        displayValue={extrudeAOIntensity.toFixed(2)}
      />
      <SliderControl
        label="AO Radius"
        value={extrudeAORadius}
        min={10} max={200} step={10}
        onChange={setExtrudeAORadius}
        displayValue={`${extrudeAORadius}m`}
      />

      {/* 높이 슬라이더 — 현재 세트 전체에 동시 적용 */}
      {currentGroupFeatures.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <SliderControl
            label={pickDisplayMode === 'floating' ? 'Float Height' : 'Extrude Height'}
            value={currentGroupHeight}
            min={0}
            max={200000}
            step={2000}
            onChange={(v) => updateCurrentGroupHeight(v)}
            displayValue={
              currentGroupHeight > 0
                ? `${(currentGroupHeight / 1000).toFixed(0)}km`
                : 'Off'
            }
          />

        </div>
      )}

      {/* 선택된 feature 목록 */}
      {pickedFeatures.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '90px', overflowY: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '6px' }}>
          <p style={{ ...labelStyle, fontSize: '11px' }}>{pickedFeatures.length}개 선택됨</p>
          {pickedFeatures.map((f) => (
            <div key={String(f.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.fillColor, flexShrink: 0, border: '1px solid var(--glass-border)' }} />
              <span style={{ ...labelStyle, fontSize: '10px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getFeatureName(f)}</span>
              <button onClick={() => removeFeature(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--muted-foreground)' }}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 마지막 선택 편집 */}
      {lastPicked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '8px', borderTop: '1px solid var(--glass-border)' }}>
          <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>현재 세트 편집 ({currentGroupFeatures.length}개)</p>
          <ColorPicker label="Fill Color" color={lastPicked.fillColor}
            onChange={(c) => updateCurrentGroup({ fillColor: c })} />
          <ColorPicker label="Border Color" color={lastPicked.borderColor}
            onChange={(c) => updateCurrentGroup({ borderColor: c })} />
          <SliderControl label="Border Width" value={lastPicked.borderWidth} min={0} max={5} step={0.1}
            onChange={(v) => updateCurrentGroup({ borderWidth: v })}
            displayValue={`${lastPicked.borderWidth.toFixed(1)}px`} />
        </div>
      )}

      {!lastPicked && !pickMode && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>PICK 활성화 후 지도 클릭</p>
      )}

      {/* ── Export ── */}
      <div style={{ height: 1, background: 'var(--glass-border)', marginTop: 4 }} />
      <span style={{ ...labelStyle, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontSize: '11px' }}>Export</span>

      {/* 해상도 */}
      <div style={{ display: 'flex', gap: '0px' }}>
        {(['fhd', '4k'] as const).map((r) => (
          <button key={r}
            className={`action-btn secondary ${exportResolution === r ? 'active' : ''}`}
            style={{ flex: 1 }}
            onClick={() => setExportResolution(r)}>
            {r.toUpperCase()}
            <span style={{ ...monoStyle, opacity: 0.8, marginLeft: '3px', color: 'inherit' }}>
              {r === 'fhd' ? '1920×1080' : '3840×2160'}
            </span>
          </button>
        ))}
      </div>

      {/* 선택만 체크박스 — 일반 체크박스 스타일 */}
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
        <input
          type="checkbox"
          checked={selectionOnly}
          onChange={(e) => setSelectionOnly(e.target.checked)}
          disabled={pickedFeatures.length === 0}
          style={{ width: 12, height: 12, accentColor: '#59787f', cursor: 'pointer' }}
        />
        <span style={{ ...labelStyle, fontSize: '11px', opacity: pickedFeatures.length === 0 ? 0.4 : 1 }}>
          Selection Only
          {selectionOnly && pickedFeatures.length > 0 && (
            <span style={{ marginLeft: '4px', opacity: 0.7 }}>({pickedFeatures.length})</span>
          )}
        </span>
      </label>

      {selectionOnly && (
        <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
          PNG: 투명배경, 위치 유지{pickDisplayMode !== 'floating' ? '' : ' · float 반영'}<br />
          SVG: 위치 유지 · float/extrude 무시
        </p>
      )}

      {/* Export 버튼 */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button className="action-btn primary"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            opacity: selectionOnly ? 0.4 : 1,
          }}
          onClick={handleExportPNG} disabled={isExporting || selectionOnly}>
          <Download size={11} />
          {isExporting ? 'Exporting...' : 'PNG'}
        </button>
        <button className="action-btn primary"
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            opacity: (!selectionOnly || pickedFeatures.length === 0) ? 0.4 : 1,
          }}
          onClick={handleExportSVG}
          disabled={!selectionOnly || pickedFeatures.length === 0}
          title={!selectionOnly ? 'Selection Only 체크 필요' : 'SVG 내보내기'}>
          <Download size={11} /> SVG
        </button>
      </div>

      <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
        {selectionOnly
          ? pickedFeatures.length > 0
            ? `${pickedFeatures.length}개 · 선택만`
            : 'Pick 먼저'
          : '전체 화면'}
      </p>

    </SectionPanel>
  );
}