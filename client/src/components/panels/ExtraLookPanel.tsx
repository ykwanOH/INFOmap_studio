/**
 * MACRO Map Studio — Extra Look Panel
 * 3 mutually exclusive post-processing looks: Monotone Press / Vintage / Digital
 * Preview popup on click, applied on Export
 * Matches sibling app design system
 */

import { useMapStore, type ExtraLookType } from '@/store/useMapStore';
import { SectionPanel } from '@/components/ui/SectionPanel';
import { X } from 'lucide-react';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
};

const LOOKS: { key: ExtraLookType; label: string; desc: string; preview: string }[] = [
  {
    key: 'monotone',
    label: 'Monotone Press',
    desc: 'B&W print-ready render',
    preview: 'grayscale(1) contrast(1.2) brightness(1.05)',
  },
  {
    key: 'vintage',
    label: 'Vintage',
    desc: 'Interlaced video · warm grain',
    preview: 'sepia(0.5) contrast(1.1) brightness(0.95) saturate(0.8)',
  },
  {
    key: 'digital',
    label: 'Digital',
    desc: 'High contrast · cool tones',
    preview: 'saturate(1.4) contrast(1.3) hue-rotate(10deg) brightness(1.1)',
  },
];

const ScanlineOverlay = () => (
  <div style={{
    position: 'absolute',
    inset: 0,
    backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
    pointerEvents: 'none',
  }} />
);

export function ExtraLookPanel() {
  const { extraLook, setExtraLook, extraLookPreviewOpen, setExtraLookPreviewOpen } = useMapStore();

  const handleLookClick = (key: ExtraLookType) => {
    if (extraLook === key) {
      setExtraLook(null);
      setExtraLookPreviewOpen(false);
    } else {
      setExtraLook(key);
      setExtraLookPreviewOpen(true);
    }
  };

  const activeLook = LOOKS.find((l) => l.key === extraLook);

  return (
    <SectionPanel sectionKey="extraLook" title="Extra Look">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {LOOKS.map(({ key, label, desc }) => (
          <button
            key={key}
            className={`action-btn ${extraLook === key ? 'active' : ''}`}
            style={{ display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px' }}
            onClick={() => handleLookClick(key)}
          >
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {label}
            </div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '10px', opacity: 0.7, marginTop: '2px', textTransform: 'none', letterSpacing: '0.02em' }}>
              {desc}
            </div>
          </button>
        ))}
      </div>

      {extraLook && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)' }}>
          Active: {activeLook?.label} · Live on Map
        </p>
      )}

      {/* Preview modal */}
      {extraLookPreviewOpen && activeLook && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={() => setExtraLookPreviewOpen(false)}
        >
          <div
            style={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              borderRadius: 0,
              padding: '16px',
              maxWidth: '480px',
              width: '90%',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ ...labelStyle, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase' as const, fontSize: '11px' }}>
                {activeLook.label} Preview
              </span>
              <button
                className="action-btn"
                style={{ padding: '2px 6px' }}
                onClick={() => setExtraLookPreviewOpen(false)}
              >
                <X size={12} />
              </button>
            </div>

            <div
              style={{
                width: '100%',
                aspectRatio: '16/9',
                overflow: 'hidden',
                position: 'relative',
                background: '#e8e0d4',
                filter: activeLook.preview,
              }}
            >
              <svg viewBox="0 0 320 180" style={{ width: '100%', height: '100%' }}>
                <rect width="320" height="180" fill="#e8e4dc" />
                <rect x="0" y="100" width="320" height="80" fill="#c8d8e8" opacity="0.7" />
                <ellipse cx="160" cy="90" rx="120" ry="50" fill="#d8d0c4" />
                <ellipse cx="80" cy="80" rx="40" ry="25" fill="#c8c0b4" />
                <ellipse cx="240" cy="100" rx="50" ry="20" fill="#d0c8bc" />
                <line x1="0" y1="100" x2="320" y2="100" stroke="#b8c8d4" strokeWidth="1" />
                <text x="160" y="95" textAnchor="middle" fontSize="10" fill="#6e6862" fontFamily="DM Sans, sans-serif">Map Preview</text>
              </svg>
              {activeLook.key === 'vintage' && <ScanlineOverlay />}
              {activeLook.key === 'digital' && (
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  backgroundImage: 'linear-gradient(rgba(0,100,200,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,100,200,0.05) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                  pointerEvents: 'none',
                }} />
              )}
            </div>

            <p style={{ ...labelStyle, textAlign: 'center', marginTop: '8px', fontSize: '11px', color: 'var(--muted-foreground)' }}>
              Applied live on map · also baked into export
            </p>
          </div>
        </div>
      )}
    </SectionPanel>
  );
}
