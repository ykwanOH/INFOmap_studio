/**
 * MACRO Map Studio — Extra Look Panel v2
 * 3종 룩: BW PRINT / VINTAGE / DIGITAL
 * - 각 버튼 누르면 해당 행에 컨트롤 펼쳐짐
 * - 다시 누르면 해제
 */

import { useMapStore, type ExtraLookType } from '@/store/useMapStore';
import { SectionPanel, SliderControl, ColorPicker } from '@/components/ui/SectionPanel';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
} as const;

const monoStyle = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '10px',
  color: 'var(--section-label-color)',
} as const;

// Vintage palette preview colors
const VINTAGE_PRESETS = {
  kodachrome: { label: 'Kodachrome', colors: ['#FAEDCD','#CCD5AE','#D4A373','#E9EDC9','#1A1A1A'] },
  desert:     { label: 'Desert',     colors: ['#FEFAE0','#606C38','#DDA15E','#BC6C25','#283618'] },
  bauhaus:    { label: 'Bauhaus',    colors: ['#F1FAEE','#A8DADC','#1D3557','#457B9D','#E63946'] },
} as const;

// Digital palette preview colors
const DIGITAL_PRESETS = {
  cyberglitch: { label: 'Cyber Glitch', colors: ['#1F2833','#0B0C10','#C5C6C7','#66FCF1','#45A29E'] },
  neonnights:  { label: 'Neon Nights',  colors: ['#0A001F','#060012','#6A00F4','#B100E8','#2D00F7'] },
} as const;

function LookButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        padding: '6px 10px',
        textAlign: 'left',
        fontSize: '11px',
        fontFamily: "'DM Sans', sans-serif",
        fontWeight: 600,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        border: `1.5px solid ${active ? '#3d5459' : '#8aa8ad'}`,
        background: active ? '#3d5459' : 'transparent',
        color: active ? '#ffffff' : '#8aa8ad',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: active ? 'inset 0 2px 5px rgba(0,0,0,0.28)' : 'none',
        transition: 'all 0.12s',
      }}
    >
      <span>{label}</span>
      <span style={{ fontSize: '9px', opacity: 0.7 }}>{active ? '▼ ON' : '▶'}</span>
    </button>
  );
}

function PaletteRow({ colors }: { colors: readonly string[] }) {
  return (
    <div style={{ display: 'flex', gap: '2px' }}>
      {colors.map((c, i) => (
        <div key={i} style={{ flex: 1, height: 12, background: c, border: '1px solid rgba(0,0,0,0.08)' }} />
      ))}
    </div>
  );
}

export function ExtraLookPanel() {
  const {
    extraLook, setExtraLook,
    bwStripeColor, setBwStripeColor,
    bwStripeAngle, setBwStripeAngle,
    bwStripeWidth, setBwStripeWidth,
    bwStripeGap, setBwStripeGap,
    vintagePreset, setVintagePreset,
    digitalPreset, setDigitalPreset,
  } = useMapStore();

  const toggle = (key: Exclude<ExtraLookType, null>) => {
    setExtraLook(extraLook === key ? null : key);
  };

  const isSolid = bwStripeGap === 0 || bwStripeWidth >= bwStripeGap;

  return (
    <SectionPanel sectionKey="extraLook" title="Extra Look">

      {/* ── BW PRINT ──────────────────────────────────────────────── */}
      <LookButton
        label="BW Print"
        active={extraLook === 'bwprint'}
        onClick={() => toggle('bwprint')}
      />

      {extraLook === 'bwprint' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px',
          padding: '8px 10px', background: 'rgba(0,0,0,0.03)',
          borderLeft: '2px solid #8aa8ad', marginTop: '-2px' }}>
          <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)', margin: 0 }}>
            대지·녹지 → 미색 흰색 / 바다 → 사선 패턴
          </p>

          {/* Stripe Color */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={labelStyle}>줄무늬 색상</span>
            <input
              type="color"
              value={bwStripeColor}
              onChange={(e) => setBwStripeColor(e.target.value)}
              style={{ width: 32, height: 20, border: '1px solid var(--glass-border)', cursor: 'pointer', padding: 0 }}
            />
          </div>

          {/* Angle */}
          <SliderControl
            label="각도"
            value={bwStripeAngle}
            min={0} max={180} step={5}
            onChange={setBwStripeAngle}
            displayValue={`${bwStripeAngle}°`}
          />

          {/* Width */}
          <SliderControl
            label="굵기"
            value={bwStripeWidth}
            min={1} max={30} step={1}
            onChange={setBwStripeWidth}
            displayValue={`${bwStripeWidth}px`}
          />

          {/* Gap */}
          <SliderControl
            label="간격"
            value={bwStripeGap}
            min={0} max={30} step={1}
            onChange={setBwStripeGap}
            displayValue={`${bwStripeGap}px`}
          />

          <p style={{ ...monoStyle, fontSize: '10px', color: 'var(--muted-foreground)' }}>
            {isSolid ? '→ 솔리드 채움 (굵기 ≥ 간격)' : `→ 사선 패턴 (${bwStripeAngle}°)`}
          </p>
        </div>
      )}

      {/* ── VINTAGE ───────────────────────────────────────────────── */}
      <LookButton
        label="Vintage"
        active={extraLook === 'vintage'}
        onClick={() => toggle('vintage')}
      />

      {extraLook === 'vintage' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px',
          padding: '8px 10px', background: 'rgba(0,0,0,0.03)',
          borderLeft: '2px solid #8aa8ad', marginTop: '-2px' }}>
          <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)', margin: 0 }}>
            필름 컬러 프리셋 · 비네팅 · 인터레이스 · 노이즈
          </p>

          {/* Preset selector */}
          {(Object.entries(VINTAGE_PRESETS) as [keyof typeof VINTAGE_PRESETS, typeof VINTAGE_PRESETS[keyof typeof VINTAGE_PRESETS]][]).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => setVintagePreset(key)}
              style={{
                background: vintagePreset === key ? 'rgba(0,0,0,0.06)' : 'transparent',
                border: `1px solid ${vintagePreset === key ? '#8aa8ad' : 'var(--glass-border)'}`,
                padding: '5px 8px',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: '4px',
                transition: 'all 0.12s',
              }}
            >
              <span style={{ ...labelStyle, fontSize: '10px', fontWeight: vintagePreset === key ? 600 : 400,
                color: vintagePreset === key ? 'var(--foreground)' : 'var(--section-label-color)' }}>
                {preset.label}
              </span>
              <PaletteRow colors={preset.colors} />
            </button>
          ))}
        </div>
      )}

      {/* ── DIGITAL ───────────────────────────────────────────────── */}
      <LookButton
        label="Digital"
        active={extraLook === 'digital'}
        onClick={() => toggle('digital')}
      />

      {extraLook === 'digital' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px',
          padding: '8px 10px', background: 'rgba(0,0,0,0.03)',
          borderLeft: '2px solid #8aa8ad', marginTop: '-2px' }}>
          <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)', margin: 0 }}>
            다크 팔레트 · 도로 글로우 · 그리드 · HUD 오버레이
          </p>

          {/* Preset selector */}
          {(Object.entries(DIGITAL_PRESETS) as [keyof typeof DIGITAL_PRESETS, typeof DIGITAL_PRESETS[keyof typeof DIGITAL_PRESETS]][]).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => setDigitalPreset(key)}
              style={{
                background: digitalPreset === key ? 'rgba(0,0,0,0.08)' : 'transparent',
                border: `1px solid ${digitalPreset === key ? '#8aa8ad' : 'var(--glass-border)'}`,
                padding: '5px 8px',
                cursor: 'pointer',
                display: 'flex', flexDirection: 'column', gap: '4px',
                transition: 'all 0.12s',
              }}
            >
              <span style={{ ...labelStyle, fontSize: '10px', fontWeight: digitalPreset === key ? 600 : 400,
                color: digitalPreset === key ? 'var(--foreground)' : 'var(--section-label-color)' }}>
                {preset.label}
              </span>
              <PaletteRow colors={preset.colors} />
            </button>
          ))}
        </div>
      )}

    </SectionPanel>
  );
}
