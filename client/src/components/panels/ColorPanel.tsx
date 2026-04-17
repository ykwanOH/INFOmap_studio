/**
 * MACRO Map Studio — Color Panel (v3)
 * 6 color items: 대지 / 수계 / 녹지 / 고속·간선도로 / 국지·로컬 도로 / 경계선
 * Default values:
 *   대지 #E9E4E0 / 수계 #BAC1D3 / 녹지 #B3BDA3
 *   고속/간선도로 #ECECEC / 국지/로컬 도로 #ECE6E4 / 경계선 #780014
 */

import { useMapStore, type ColorConfig } from '@/store/useMapStore';
import { SectionPanel, ColorPicker } from '@/components/ui/SectionPanel';
import { RotateCcw } from 'lucide-react';

const COLOR_LABELS: { key: keyof ColorConfig; label: string }[] = [
  { key: 'landmass',   label: '대지' },
  { key: 'hydro',      label: '수계' },
  { key: 'green',      label: '녹지' },
  { key: 'expressway', label: '고속·간선도로' },
  { key: 'localroad',  label: '국지·로컬 도로' },
  { key: 'boundary',   label: '경계선' },
];

export function ColorPanel() {
  const { colors, setColor, colorPresets, savePreset, loadPreset, resetColors } = useMapStore();

  return (
    <SectionPanel sectionKey="color" title="Color">
      {/* Color rows */}
      {COLOR_LABELS.map(({ key, label }) => (
        <ColorPicker
          key={key}
          label={label}
          color={colors[key]}
          onChange={(c) => setColor(key, c)}
        />
      ))}

      {/* Preset + Reset */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        paddingTop: '8px',
        borderTop: '1px solid var(--glass-border)',
      }}>
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px',
          color: 'var(--section-label-color)',
          marginRight: 'auto',
        }}>
          Presets
        </span>
        {([0, 1] as const).map((i) => (
          <div key={i} style={{ display: 'flex', gap: '3px' }}>
            <button
              className="action-btn"
              style={{ fontSize: '10px', padding: '3px 8px' }}
              onClick={() => loadPreset(i)}
              title={colorPresets[i] ? `Preset ${i + 1} 불러오기` : '저장된 프리셋 없음'}
              disabled={!colorPresets[i]}
            >
              {colorPresets[i] ? (
                <span style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                  {Object.values(colorPresets[i]!).map((c, ci) => (
                    <span
                      key={ci}
                      style={{
                        width: 7, height: 7,
                        borderRadius: '50%',
                        background: c,
                        border: '1px solid var(--glass-border)',
                        display: 'inline-block',
                      }}
                    />
                  ))}
                </span>
              ) : `P${i + 1}`}
            </button>
            <button
              className="action-btn"
              style={{ fontSize: '10px', padding: '3px 8px' }}
              onClick={() => savePreset(i)}
              title={`현재 컬러를 Preset ${i + 1}에 저장`}
            >
              ↓{i + 1}
            </button>
          </div>
        ))}
        <button
          className="action-btn"
          style={{ display: 'flex', alignItems: 'center', padding: '3px 7px' }}
          onClick={resetColors}
          title="기본 컬러로 초기화"
        >
          <RotateCcw size={10} />
        </button>
      </div>
    </SectionPanel>
  );
}
