/**
 * MACRO Map Studio — Control Panel
 * Right-side panel matching sibling app (3D Miniature Map Studio) design exactly.
 * Header: grid icon + "MAP STUDIO" title + hamburger icon (toggles panel visibility)
 * Panel width: 220px, no border-radius, warm off-white bg
 */

import { CameraPanel } from './panels/CameraPanel';
import { ColorPanel } from './panels/ColorPanel';
import { MapToastPanel } from './panels/MapToastPanel';
import { HiResPanel } from './panels/HiResPanel';
import { BorderMarkerPanel } from './panels/BorderMarkerPanel';
import { PickPushPanel } from './panels/PickPushPanel';
import { RouteLinePanel } from './panels/RouteLinePanel';
import { TerrainPanel } from './panels/TerrainPanel';
// FlyToAEPanel — 기능 보존, 패널에서만 제거
// import { FlyToAEPanel } from './panels/FlyToAEPanel';
import { ExtraLookPanel } from './panels/ExtraLookPanel';
import { useMapStore } from '@/store/useMapStore';

// Grid icon matching sibling app header icon
function GridIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <rect x="1" y="1" width="6" height="6" fill="currentColor" opacity="0.85" />
      <rect x="9" y="1" width="6" height="6" fill="currentColor" opacity="0.85" />
      <rect x="1" y="9" width="6" height="6" fill="currentColor" opacity="0.85" />
      <rect x="9" y="9" width="6" height="6" fill="currentColor" opacity="0.35" />
    </svg>
  );
}

// Hamburger menu icon matching sibling app
function MenuIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <line x1="2" y1="4" x2="14" y2="4" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.5" />
      <line x1="2" y1="12" x2="14" y2="12" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function PanelSectionDivider() {
  return (
    <div style={{
      height: '6px',
      background: 'var(--glass-border)',
      opacity: 0.5,
    }} />
  );
}

const PANEL_WIDTH = '270px'; // 고정 너비

export function ControlPanel() {
  const { panelVisible, setPanelVisible } = useMapStore();

  return (
    <>
      {/* Collapsed state: only show hamburger tab on right edge */}
      {!panelVisible && (
        <button
          onClick={() => setPanelVisible(true)}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: 36,
            height: '100vh',
            background: 'var(--glass-bg)',
            border: 'none',
            borderLeft: '1px solid var(--glass-border)',
            zIndex: 10,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: 14,
            cursor: 'pointer',
            color: 'var(--section-label-color)',
          }}
          title="패널 열기"
        >
          <MenuIcon />
        </button>
      )}

      {/* Full panel */}
      <div
        className="glass-panel panel-scroll"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: PANEL_WIDTH,
          minWidth: PANEL_WIDTH,
          maxWidth: PANEL_WIDTH,
          flexShrink: 0,
          height: '100vh',
          overflowY: 'auto',
          borderRadius: 0,
          borderTop: 'none',
          borderRight: 'none',
          borderBottom: 'none',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          transform: panelVisible ? 'translateX(0)' : `translateX(${PANEL_WIDTH})`,
          transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Header — matches sibling: [grid icon] MAP STUDIO [≡] */}
        <div style={{
          padding: '13px 14px 12px',
          borderBottom: '1px solid var(--glass-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: 'var(--glass-bg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--foreground)', display: 'flex', alignItems: 'center' }}>
              <GridIcon />
            </span>
            <span style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '13px',
              fontWeight: 600,
              letterSpacing: '0.10em',
              textTransform: 'uppercase',
              color: 'var(--foreground)',
              lineHeight: 1,
            }}>
              MAP STUDIO
            </span>
          </div>
          {/* Hamburger: 클릭 시 패널 숨김 */}
          <button
            onClick={() => setPanelVisible(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--section-label-color)',
              display: 'flex',
              alignItems: 'center',
              padding: '2px 4px',
            }}
            title="패널 숨기기 (지도 풀화면)"
          >
            <MenuIcon />
          </button>
        </div>

        {/* Sections */}
        <div style={{ flex: 1 }}>
          <CameraPanel />
          <ColorPanel />
          <BorderMarkerPanel />

          <PanelSectionDivider />

          <MapToastPanel />

          <PanelSectionDivider />

          <TerrainPanel />
          <PickPushPanel />
          <RouteLinePanel />
          <HiResPanel />
          <ExtraLookPanel />
        </div>
      </div>
    </>
  );
}
