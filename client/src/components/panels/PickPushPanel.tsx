/**
 * MACRO Map Studio — Pick & Export Panel
 *
 * - Pick 버튼으로 나라 선택
 * - Floating / Extrude 모드 토글 (공유 높이 슬라이더)
 * - 선택 나라별 Fill Color / Border Color / Border Width 편집
 * - Export: PNG (전체 or 선택만 투명배경) / SVG (선택만)
 */

import { useState } from 'react';
import { useMapStore, type PickDisplayMode } from '@/store/useMapStore';
import { SectionPanel, SliderControl, ColorPicker, Toggle } from '@/components/ui/SectionPanel';
import { MousePointer2, RotateCcw, Trash2, X, Download, Square, CheckSquare } from 'lucide-react';

const ELEVATION_PRESETS = [
  { key: 'natural' as const, label: 'Natural', colors: ['#4a8a4a', '#a8c870', '#e8d890', '#d0a870', '#b08060'] },
  { key: 'vivid'   as const, label: 'Vivid',   colors: ['#2060c0', '#40a060', '#e0c040', '#e06020', '#c02020'] },
  { key: 'arctic'  as const, label: 'Arctic',  colors: ['#c0d8f0', '#a0c0e0', '#e0e8f0', '#f0f4f8', '#ffffff'] },
];

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
    pickedFeatures,
    updatePickedFeature,
    clearPickedFeatures,
    resetAllPicks,
    mapInstance,
    extraLook,
    terrainExaggeration, setTerrainExaggeration,
    hillshadeEnabled, setHillshadeEnabled,
    elevationPreset, setElevationPreset,
  } = useMapStore();

  const [selectionOnly, setSelectionOnly] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResolution, setExportResolution] = useState<'fhd' | '4k'>('fhd');

  const pickUnit = borders.district.enabled ? '구 / 시군'
    : borders.state.enabled ? '주 / 도' : '국가';

  const lastPicked = pickedFeatures[pickedFeatures.length - 1] ?? null;

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
          const out = document.createElement('canvas');
          out.width = resW; out.height = resH;
          const ctx = out.getContext('2d')!;

          if (selectionOnly && pickedFeatures.length > 0) {
            // 투명 배경 — 선택 나라 위치 유지, 배경은 투명
            ctx.drawImage(src, 0, 0, resW, resH);
            if (extraLook) applyLookFilter(ctx, resW, resH);
            // 선택 나라 외 영역을 마스킹 (투명 처리)
            // Mapbox canvas 전체 크기 대비 비율로 picked geometry bounding box 계산
            // 간단 구현: 전체 canvas 그린 후 picked geometry 범위 외 픽셀 투명화
            // → 복잡한 마스킹 대신: 전체 그리고 별도 마스크 canvas로 punch-through
            const maskCanvas = document.createElement('canvas');
            maskCanvas.width = resW; maskCanvas.height = resH;
            const mCtx = maskCanvas.getContext('2d')!;
            mCtx.fillStyle = 'rgba(0,0,0,1)';
            mCtx.fillRect(0, 0, resW, resH);
            mCtx.globalCompositeOperation = 'destination-out';
            // picked features의 지리좌표를 현재 map viewport 기준 픽셀로 변환
            pickedFeatures.forEach((f) => {
              const geo = (f as any).geometry as GeoJSON.Geometry | undefined;
              if (!geo) return;
              const rings: number[][][] = geo.type === 'Polygon'
                ? geo.coordinates
                : geo.type === 'MultiPolygon'
                  ? geo.coordinates.flat()
                  : [];
              rings.forEach((ring) => {
                mCtx.beginPath();
                ring.forEach((coord, i) => {
                  const pt = mapInstance.project([coord[0], coord[1]]);
                  const px = (pt.x / src.width) * resW;
                  const py = (pt.y / src.height) * resH;
                  i === 0 ? mCtx.moveTo(px, py) : mCtx.lineTo(px, py);
                });
                mCtx.closePath();
                mCtx.fill();
              });
            });
            // 마스크 적용: 마스크 흰 영역만 남기기
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = resW; finalCanvas.height = resH;
            const fCtx = finalCanvas.getContext('2d')!;
            fCtx.drawImage(out, 0, 0);
            fCtx.globalCompositeOperation = 'destination-in';
            // 마스크 반전: picked 영역만 남김
            const mCtx2 = maskCanvas.getContext('2d')!;
            mCtx2.globalCompositeOperation = 'source-over';
            // 간단 방법: destination-in으로 picked 영역만 보이게
            const maskCanvas2 = document.createElement('canvas');
            maskCanvas2.width = resW; maskCanvas2.height = resH;
            const m2 = maskCanvas2.getContext('2d')!;
            m2.fillStyle = 'rgba(0,0,0,0)';
            m2.fillRect(0, 0, resW, resH);
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
                  const px = (pt.x / src.width) * resW;
                  const py = (pt.y / src.height) * resH;
                  i === 0 ? m2.moveTo(px, py) : m2.lineTo(px, py);
                });
                m2.closePath();
                m2.fillStyle = 'rgba(255,255,255,1)';
                m2.fill();
              });
            });
            fCtx.drawImage(maskCanvas2, 0, 0);
            const link = document.createElement('a');
            link.download = `macro_pick_${exportResolution}_${Date.now()}.png`;
            link.href = finalCanvas.toDataURL('image/png');
            link.click();
          } else {
            // 전체 viewport
            ctx.drawImage(src, 0, 0, resW, resH);
            if (extraLook) applyLookFilter(ctx, resW, resH);
            if (extraLook === 'vintage') {
              for (let y = 0; y < resH; y += 4) {
                ctx.fillStyle = 'rgba(0,0,0,0.06)';
                ctx.fillRect(0, y, resW, 2);
              }
            }
            const link = document.createElement('a');
            link.download = `macro_map_${exportResolution}_${Date.now()}.png`;
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
    const src = mapInstance.getCanvas();
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
          const px = (pt.x / src.width) * resW;
          const py = (pt.y / src.height) * resH;
          return `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
        }).join(' ') + ' Z';
      }).join(' ');
      return `<path d="${d}" fill="${f.fillColor}" fill-opacity="0.7" stroke="${f.borderColor}" stroke-width="${f.borderWidth}" fill-rule="evenodd" />`;
    }).filter(Boolean);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${resW} ${resH}" width="${resW}" height="${resH}">
  <!-- MACRO Map Studio · Pick & Export · ${new Date().toISOString()} -->
  ${svgParts.join('\n  ')}
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `macro_pick_${exportResolution}_${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionPanel sectionKey="pickPush" title="Pick & Export">

      {/* Pick 단위 */}
      <div style={{ padding: '3px 8px', background: 'var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)' }}>단위</span>
        <span style={{ ...labelStyle, fontSize: '10px', color: 'var(--accent)', fontWeight: 600 }}>{pickUnit}</span>
      </div>

      {/* Pick + Clear + Reset */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          className={`action-btn ${pickMode ? 'active' : ''}`}
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
            <button key={m} onClick={() => setPickDisplayMode(m)} style={{
              padding: '3px 10px', fontSize: '11px',
              fontFamily: "'DM Sans', sans-serif",
              border: `1.5px solid ${pickDisplayMode === m ? 'var(--accent)' : 'var(--glass-border)'}`,
              background: pickDisplayMode === m ? 'var(--accent)' : 'transparent',
              color: pickDisplayMode === m ? 'white' : 'var(--section-label-color)',
              cursor: 'pointer', textTransform: 'capitalize',
            }}>
              {m === 'floating' ? 'Float' : 'Extrude'}
            </button>
          ))}
        </div>
      </div>

      {/* 높이 슬라이더 (float/extrude 공유) */}
      {lastPicked && (
        <SliderControl
          label={pickDisplayMode === 'floating' ? 'Float Height' : 'Extrude Height'}
          value={lastPicked.floatHeight ?? 0}
          min={0}
          max={500000}
          step={10000}
          onChange={(v) => {
            pickedFeatures.forEach((f) => updatePickedFeature(f.id, { floatHeight: v }));
          }}
          displayValue={
            (lastPicked.floatHeight ?? 0) > 0
              ? `${((lastPicked.floatHeight ?? 0) / 1000).toFixed(0)}km`
              : 'Off'
          }
        />
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
          <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>마지막 선택 편집</p>
          <ColorPicker label="Fill Color" color={lastPicked.fillColor}
            onChange={(c) => updatePickedFeature(lastPicked.id, { fillColor: c })} />
          <ColorPicker label="Border Color" color={lastPicked.borderColor}
            onChange={(c) => updatePickedFeature(lastPicked.id, { borderColor: c })} />
          <SliderControl label="Border Width" value={lastPicked.borderWidth} min={0} max={5} step={0.1}
            onChange={(v) => updatePickedFeature(lastPicked.id, { borderWidth: v })}
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
            className={`view-btn ${exportResolution === r ? 'active' : ''}`}
            style={{ borderRight: r === 'fhd' ? 'none' : undefined }}
            onClick={() => setExportResolution(r)}>
            {r.toUpperCase()}
            <span style={{ ...monoStyle, opacity: 0.7, marginLeft: '3px' }}>
              {r === 'fhd' ? '1920×1080' : '3840×2160'}
            </span>
          </button>
        ))}
      </div>

      {/* 선택만 체크박스 */}
      <button
        className={`action-btn ${selectionOnly ? 'active' : ''}`}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
        onClick={() => setSelectionOnly(!selectionOnly)}
        disabled={pickedFeatures.length === 0}
      >
        {selectionOnly ? <CheckSquare size={11} /> : <Square size={11} />}
        Selection Only
        {selectionOnly && pickedFeatures.length > 0 && (
          <span style={{ marginLeft: '4px', opacity: 0.7 }}>({pickedFeatures.length})</span>
        )}
      </button>

      {selectionOnly && (
        <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
          PNG: 투명배경, 위치 유지{pickDisplayMode !== 'floating' ? '' : ' · float 반영'}<br />
          SVG: 위치 유지 · float/extrude 무시
        </p>
      )}

      {/* Export 버튼 */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button className="action-btn"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          onClick={handleExportPNG} disabled={isExporting}>
          <Download size={11} />
          {isExporting ? 'Exporting...' : 'PNG'}
        </button>
        <button className="action-btn"
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

      {/* ── Terrain ── */}
      <div style={{ height: 1, background: 'var(--glass-border)', marginTop: 4 }} />
      <span style={{ ...labelStyle, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontSize: '11px' }}>Terrain</span>

      <SliderControl label="Exaggeration" value={terrainExaggeration} min={1} max={5} step={0.1}
        onChange={setTerrainExaggeration} displayValue={`${terrainExaggeration.toFixed(1)}×`} />
      <Toggle checked={hillshadeEnabled} onChange={setHillshadeEnabled} label="Hillshade" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ ...labelStyle, fontSize: '11px' }}>Elevation Colors</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {ELEVATION_PRESETS.map((preset) => (
            <button key={preset.key} onClick={() => setElevationPreset(preset.key)} title={preset.label} style={{
              flex: 1, height: 18,
              border: `2px solid ${elevationPreset === preset.key ? 'var(--primary)' : 'var(--glass-border)'}`,
              background: `linear-gradient(to right, ${preset.colors.join(', ')})`,
              cursor: 'pointer', transition: 'border-color 0.12s', borderRadius: 0,
            }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {ELEVATION_PRESETS.map((p) => (
            <span key={p.key} style={{ ...labelStyle, flex: 1, textAlign: 'center' as const, fontSize: '10px' }}>{p.label}</span>
          ))}
        </div>
      </div>

    </SectionPanel>
  );
}
