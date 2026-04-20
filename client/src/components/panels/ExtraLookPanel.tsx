/**
 * MACRO Map Studio — Extra Look Panel
 * CSS filter 기반 색감 보정 (monotone / vintage / digital)
 */

import { useMapStore, type ExtraLookType } from '@/store/useMapStore';
import { SectionPanel } from '@/components/ui/SectionPanel';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
} as const;

const LOOKS: { key: ExtraLookType; label: string; desc: string }[] = [
  { key: 'monotone', label: 'Mono',    desc: '흑백' },
  { key: 'vintage',  label: 'Vintage', desc: '빈티지' },
  { key: 'digital',  label: 'Digital', desc: '디지털 블루' },
];

export function ExtraLookPanel() {
  const { extraLook, setExtraLook } = useMapStore();

  return (
    <SectionPanel sectionKey="extraLook" title="Extra Look">
      <div style={{ display: 'flex', gap: '4px' }}>
        {LOOKS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setExtraLook(extraLook === key ? null : key)}
            style={{
              flex: 1,
              padding: '5px 0',
              fontSize: '11px',
              fontFamily: "'DM Sans', sans-serif",
              border: `1.5px solid ${extraLook === key ? 'var(--accent)' : 'var(--glass-border)'}`,
              background: extraLook === key ? 'var(--accent)' : 'transparent',
              color: extraLook === key ? 'white' : 'var(--section-label-color)',
              cursor: 'pointer',
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {extraLook && (
        <p style={{ ...labelStyle, fontSize: '10px', color: 'var(--muted-foreground)' }}>
          {LOOKS.find(l => l.key === extraLook)?.desc} 필터 적용 중
        </p>
      )}
    </SectionPanel>
  );
}
