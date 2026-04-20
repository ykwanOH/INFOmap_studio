/**
 * MACRO Map Studio — Pick & Push Panel (v2)
 *
 * - Border 토글 상태에 따라 pick 단위 자동 연동
 *   country only  → 국가 단위
 *   state on      → 주/도 단위
 *   district on   → 구/시군 단위
 * - 복수 선택 시 마지막 선택 feature 기준으로 색상/보더 편집
 * - 선택 목록 표시 (이름 + 개별 삭제)
 * - Export 시 turf union은 ExportPanel에서 처리
 */

import { useMapStore } from '@/store/useMapStore';
import { SectionPanel, SliderControl, ColorPicker, Toggle } from '@/components/ui/SectionPanel';
import { MousePointer2, RotateCcw, Trash2, X } from 'lucide-react';

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

export function PickPushPanel() {
  const {
    borders,
    pickMode, setPickMode,
    pickedFeatures,
    updatePickedFeature,
    clearPickedFeatures,
    resetAllPicks,
    terrainExaggeration, setTerrainExaggeration,
    hillshadeEnabled, setHillshadeEnabled,
    elevationPreset, setElevationPreset,
  } = useMapStore();

  // 현재 pick 단위 레이블
  const pickUnit = borders.district.enabled
    ? '구 / 시군'
    : borders.state.enabled
      ? '주 / 도'
      : '국가';

  const lastPicked = pickedFeatures[pickedFeatures.length - 1] ?? null;

  // feature 이름 추출 (meta 있으면 한국 행정구역명, 없으면 sourceLayer)
  const getFeatureName = (f: typeof lastPicked) => {
    if (!f) return '';
    const meta = (f as any).meta;
    if (meta?.sggnm) return `${meta.sidonm} ${meta.sggnm}`;
    if (meta?.sidonm) return meta.sidonm;
    return f.sourceLayer || `feature-${f.id}`;
  };

  // 개별 feature 삭제
  const removeFeature = (id: string | number) => {
    const store = useMapStore.getState();
    useMapStore.setState({
      pickedFeatures: store.pickedFeatures.filter((f) => f.id !== id),
    });
  };

  return (
    <SectionPanel sectionKey="pickPush" title="Pick & Push">

      {/* Pick 단위 표시 */}
      <div style={{
        padding: '4px 8px',
        background: 'var(--glass-border)',
        opacity: 0.9,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)' }}>
          단위
        </span>
        <span style={{ ...labelStyle, fontSize: '10px', color: 'var(--accent)', fontWeight: 600 }}>
          {pickUnit}
        </span>
      </div>

      {/* PICK toggle + Clear + Reset */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          className={`action-btn ${pickMode ? 'active' : ''}`}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          onClick={() => setPickMode(!pickMode)}
        >
          <MousePointer2 size={11} />
          {pickMode ? 'Picking...' : 'Pick'}
        </button>
        <button
          className="action-btn danger"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
          onClick={clearPickedFeatures}
          disabled={pickedFeatures.length === 0}
          title="Clear selection"
        >
          <Trash2 size={11} />
          Clear
        </button>
        <button
          className="action-btn"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 8px' }}
          onClick={resetAllPicks}
          title="Reset all"
        >
          <RotateCcw size={11} />
        </button>
      </div>

      {pickMode && (
        <p style={{ ...labelStyle, color: 'var(--accent)', fontSize: '11px' }}>
          지도에서 {pickUnit} 클릭
        </p>
      )}

      {/* 선택된 feature 목록 */}
      {pickedFeatures.length > 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '4px',
          maxHeight: '100px', overflowY: 'auto',
          borderTop: '1px solid var(--glass-border)', paddingTop: '8px',
        }}>
          <p style={{ ...labelStyle, fontSize: '11px' }}>
            {pickedFeatures.length}개 선택됨
          </p>
          {pickedFeatures.map((f) => (
            <div
              key={String(f.id)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '6px', padding: '2px 0',
              }}
            >
              {/* 색상 스와치 */}
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: f.fillColor, flexShrink: 0,
                border: '1px solid var(--glass-border)',
              }} />
              <span style={{ ...labelStyle, fontSize: '10px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {getFeatureName(f)}
              </span>
              <button
                onClick={() => removeFeature(f.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px', color: 'var(--muted-foreground)', flexShrink: 0 }}
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 마지막 선택 feature 편집 컨트롤 */}
      {lastPicked && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '10px',
          paddingTop: '8px', borderTop: '1px solid var(--glass-border)',
        }}>
          <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
            마지막 선택 편집
          </p>

          <ColorPicker
            label="Fill Color"
            color={lastPicked.fillColor}
            onChange={(c) => updatePickedFeature(lastPicked.id, { fillColor: c })}
          />

          <ColorPicker
            label="Border Color"
            color={lastPicked.borderColor}
            onChange={(c) => updatePickedFeature(lastPicked.id, { borderColor: c })}
          />

          <SliderControl
            label="Border Width"
            value={lastPicked.borderWidth}
            min={0}
            max={5}
            step={0.1}
            onChange={(v) => updatePickedFeature(lastPicked.id, { borderWidth: v })}
            displayValue={`${lastPicked.borderWidth.toFixed(1)}px`}
          />

          <SliderControl
            label="Extrude"
            value={lastPicked.extrudeHeight}
            min={0}
            max={500000}
            step={5000}
            onChange={(v) => updatePickedFeature(lastPicked.id, { extrudeHeight: v })}
            displayValue={lastPicked.extrudeHeight > 0 ? `${(lastPicked.extrudeHeight / 1000).toFixed(0)}km` : 'Off'}
          />
        </div>
      )}

      {!lastPicked && !pickMode && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
          PICK 활성화 후 지도 클릭
        </p>
      )}

      {/* ── Terrain ── */}
      <div style={{ height: 1, background: 'var(--glass-border)', marginTop: 4 }} />
      <span style={{ ...labelStyle, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontSize: '11px' }}>
        Terrain
      </span>

      <SliderControl
        label="Exaggeration"
        value={terrainExaggeration}
        min={1}
        max={5}
        step={0.1}
        onChange={setTerrainExaggeration}
        displayValue={`${terrainExaggeration.toFixed(1)}×`}
      />

      <Toggle
        checked={hillshadeEnabled}
        onChange={setHillshadeEnabled}
        label="Hillshade"
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ ...labelStyle, fontSize: '11px' }}>Elevation Colors</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {ELEVATION_PRESETS.map((preset) => (
            <button
              key={preset.key}
              onClick={() => setElevationPreset(preset.key)}
              title={preset.label}
              style={{
                flex: 1, height: 18,
                border: `2px solid ${elevationPreset === preset.key ? 'var(--primary)' : 'var(--glass-border)'}`,
                background: `linear-gradient(to right, ${preset.colors.join(', ')})`,
                cursor: 'pointer', transition: 'border-color 0.12s', borderRadius: 0,
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {ELEVATION_PRESETS.map((p) => (
            <span key={p.key} style={{ ...labelStyle, flex: 1, textAlign: 'center' as const, fontSize: '10px' }}>
              {p.label}
            </span>
          ))}
        </div>
      </div>
    </SectionPanel>
  );
}
