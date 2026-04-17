/**
 * MACRO Map Studio — Color Panel (v4)
 * 5 color items: 대지 / 수계 / 녹지 / 고속·간선도로 / 국지·로컬 도로
 * 경계선 컬러는 Border & Marker 패널에서 레벨별로 개별 관리
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
