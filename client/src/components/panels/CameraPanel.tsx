/**
 * MACRO Map Studio — Camera Panel
 * - 3D CAM / 2D CAM 버튼 (2D CAM = 직부감 pitch:0, bearing:0 고정)
 * - 벡터뷰 / 위성뷰 썸네일 (실제 이미지 파일)
 * - 지역명 토글 (기본 off) / 도로명 토글 (기본 off)
 */

import { useMapStore } from '@/store/useMapStore';
import { SectionPanel, Toggle } from '@/components/ui/SectionPanel';

export function CameraPanel() {
  const {
    zoom, viewMode, setViewMode,
    mapStyle, setMapStyle,
    mapInstance,
    showLabels, setShowLabels,
    showRoads, setShowRoads,
  } = useMapStore();

  const handle3DCAM = () => {
    setViewMode('3d');
    if (mapInstance) {
      mapInstance.easeTo({ pitch: 50, duration: 700 });
    }
  };

  const handle2DCAM = () => {
    setViewMode('2d');
    if (mapInstance) {
      // 2D CAM: 직부감 (pitch 0, bearing 0 고정)
      mapInstance.easeTo({ pitch: 0, bearing: 0, duration: 700 });
    }
  };

  return (
    <SectionPanel sectionKey="camera" title="Camera">
      {/* ZOOM row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: '12px',
          color: 'var(--section-label-color)',
          fontWeight: 400,
        }}>
          ZOOM
        </span>
        <span className="value-readout">{zoom.toFixed(2)}</span>
      </div>

      {/* 3D CAM / 2D CAM buttons */}
      <div style={{ display: 'flex', gap: '0px' }}>
        <button
          className={`view-btn ${viewMode === '3d' ? 'active' : ''}`}
          style={{ borderRight: 'none' }}
          onClick={handle3DCAM}
        >
          3D CAM
        </button>
        <button
          className={`view-btn ${viewMode === '2d' ? 'active' : ''}`}
          onClick={handle2DCAM}
        >
          2D CAM
        </button>
      </div>

      {/* 벡터뷰 / 위성뷰 thumbnail buttons */}
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          className={`map-thumb-btn ${mapStyle === 'vector' ? 'active' : ''}`}
          onClick={() => setMapStyle('vector')}
          title="벡터뷰"
          style={{ flex: 1 }}
        >
          <div style={{ aspectRatio: '3/2', overflow: 'hidden', background: '#ede9e1' }}>
            <img
              src="/thumb-vector.png"
              alt="벡터뷰"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => {
                // fallback SVG if image fails
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <div style={{
            textAlign: 'center',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '10px',
            color: 'var(--section-label-color)',
            padding: '3px 0 2px',
            letterSpacing: '0.03em',
            background: 'var(--glass-bg)',
          }}>
            벡터뷰
          </div>
        </button>
        <button
          className={`map-thumb-btn ${mapStyle === 'satellite' ? 'active' : ''}`}
          onClick={() => setMapStyle('satellite')}
          title="위성뷰"
          style={{ flex: 1 }}
        >
          <div style={{ aspectRatio: '3/2', overflow: 'hidden', background: '#1e2a1c' }}>
            <img
              src="/thumb-satellite.png"
              alt="위성뷰"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <div style={{
            textAlign: 'center',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '10px',
            color: 'var(--section-label-color)',
            padding: '3px 0 2px',
            letterSpacing: '0.03em',
            background: 'var(--glass-bg)',
          }}>
            위성뷰
          </div>
        </button>
      </div>

      {/* 지역명 / 도로표시 토글 — 한 줄 유지 */}
      <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, gap: '4px' }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: 'var(--section-label-color)', whiteSpace: 'nowrap' }}>
            지역명
          </span>
          <Toggle checked={showLabels} onChange={setShowLabels} />
        </div>
        <div style={{ width: 1, height: 14, background: 'var(--glass-border)', flexShrink: 0 }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, gap: '4px' }}>
          <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: 'var(--section-label-color)', whiteSpace: 'nowrap' }}>
            도로
          </span>
          <Toggle checked={showRoads} onChange={setShowRoads} />
        </div>
      </div>
    </SectionPanel>
  );
}
