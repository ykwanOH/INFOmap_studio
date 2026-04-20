/**
 * MACRO Map Studio — Border & Marker Panel (v2)
 *
 * Border 3레벨:
 *   country  — 국경 (기본 on, 1.5px)
 *   state    — 주/도 경계: 미국 주, 한국 17개 광역 (기본 off, 0.8px)
 *   district — 구/시 경계: 서울 25구 + 각 도 시군 (기본 off, 0.6px)
 */

import { useMapStore, type BorderLevel } from '@/store/useMapStore';
import { SectionPanel, Toggle, SliderControl, ColorPicker } from '@/components/ui/SectionPanel';


const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
} as const;

const BORDER_LEVELS: { key: BorderLevel; label: string; sublabel: string }[] = [
  { key: 'country',  label: 'Country',          sublabel: '국경' },
  { key: 'state',    label: 'State / Province',  sublabel: '한국 17개 광역' },
  { key: 'district', label: 'District / Si-Gun', sublabel: '서울 구 · 각 도 시군' },
];

export function BorderMarkerPanel() {
  const {
    borders, setBorderEnabled, setBorderColor, setBorderWidth,
  } = useMapStore();


  return (
    <SectionPanel sectionKey="borderMarker" title="Border">

      {/* Border toggles */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {BORDER_LEVELS.map(({ key, label, sublabel }) => {
          const cfg = borders[key];
          return (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px', flex: 1 }}>
                  <Toggle
                    checked={cfg.enabled}
                    onChange={(v) => setBorderEnabled(key, v)}
                    label={label}
                  />
                  <span style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)', paddingLeft: '2px' }}>
                    {sublabel}
                  </span>
                </div>
                <ColorPicker color={cfg.color} onChange={(c) => setBorderColor(key, c)} />
              </div>
              {cfg.enabled && (
                <SliderControl
                  label="Width"
                  value={cfg.width}
                  min={0.3}
                  max={4}
                  step={0.1}
                  onChange={(v) => setBorderWidth(key, v)}
                  displayValue={`${cfg.width.toFixed(1)}px`}
                />
              )}
              {key === 'district' && cfg.enabled && (
                <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)' }}>
                  줌 6+ 에서 선명하게 표시됩니다
                </p>
              )}
            </div>
          );
        })}
      </div>

    </SectionPanel>
  );
}
