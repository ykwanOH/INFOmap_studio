/**
 * MACRO Map Studio — Export Panel
 * PNG (full viewport or selection) + SVG (outline only) in FHD or 4K
 * Matches sibling app: full-width EXPORT button, 12px labels
 */

import { useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { SectionPanel } from '@/components/ui/SectionPanel';
import { Download, Square, CheckSquare } from 'lucide-react';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
};

export function ExportPanel() {
  const {
    mapInstance,
    exportResolution, setExportResolution,
    exportSelectionMode, setExportSelectionMode,
    pickedFeatures,
    extraLook,
  } = useMapStore();

  const [isExporting, setIsExporting] = useState(false);

  const resolutions = [
    { key: 'fhd' as const, label: 'FHD', w: 1920, h: 1080 },
    { key: '4k'  as const, label: '4K',  w: 3840, h: 2160 },
  ];

  const applyLookFilter = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    if (!extraLook) return;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    if (extraLook === 'monotone') {
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114;
        data[i] = data[i+1] = data[i+2] = Math.min(255, gray * 1.2);
      }
    } else if (extraLook === 'vintage') {
      for (let i = 0; i < data.length; i += 4) {
        data[i]   = Math.min(255, data[i] * 1.1 + 20);
        data[i+1] = Math.min(255, data[i+1] * 0.95 + 10);
        data[i+2] = Math.min(255, data[i+2] * 0.8);
      }
    } else if (extraLook === 'digital') {
      for (let i = 0; i < data.length; i += 4) {
        data[i]   = Math.min(255, data[i] * 0.95);
        data[i+1] = Math.min(255, data[i+1] * 1.05);
        data[i+2] = Math.min(255, data[i+2] * 1.3);
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
          const sourceCanvas = mapInstance.getCanvas();
          const res = resolutions.find((r) => r.key === exportResolution)!;
          const outputCanvas = document.createElement('canvas');
          outputCanvas.width = res.w;
          outputCanvas.height = res.h;
          const ctx = outputCanvas.getContext('2d')!;
          ctx.drawImage(sourceCanvas, 0, 0, res.w, res.h);
          if (extraLook) applyLookFilter(ctx, outputCanvas);
          if (extraLook === 'vintage') {
            for (let y = 0; y < res.h; y += 4) {
              ctx.fillStyle = 'rgba(0,0,0,0.06)';
              ctx.fillRect(0, y, res.w, 2);
            }
          }
          const link = document.createElement('a');
          link.download = `macro_map_${exportResolution}${extraLook ? `_${extraLook}` : ''}_${Date.now()}.png`;
          link.href = outputCanvas.toDataURL('image/png');
          link.click();
        } catch (e) {
          console.error('Export error', e);
        } finally {
          setIsExporting(false);
        }
      });
      mapInstance.triggerRepaint();
    } catch (e) {
      console.error('Export error', e);
      setIsExporting(false);
    }
  };

  // Convert GeoJSON geometry coordinates to SVG path string
  const geoToSVGPath = (geometry: GeoJSON.Geometry | undefined, w: number, h: number): string => {
    if (!geometry) return '';
    const project = (lng: number, lat: number): [number, number] => [
      ((lng + 180) / 360) * w,
      ((90 - lat) / 180) * h,
    ];
    const ringToPath = (coords: number[][]): string =>
      coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${project(c[0], c[1]).join(',')}`).join(' ') + ' Z';
    if (geometry.type === 'Polygon') {
      return geometry.coordinates.map(ringToPath).join(' ');
    } else if (geometry.type === 'MultiPolygon') {
      return geometry.coordinates.flatMap((poly) => poly.map(ringToPath)).join(' ');
    }
    return '';
  };

  const handleExportSVG = () => {
    if (pickedFeatures.length === 0) return;
    const w = exportResolution === '4k' ? 3840 : 1920;
    const h = exportResolution === '4k' ? 2160 : 1080;
    const svgParts: string[] = pickedFeatures.map((f) => {
      const d = geoToSVGPath(f.geometry, w, h);
      if (d) {
        return `<path d="${d}" fill="${f.fillColor}" fill-opacity="0.7" stroke="${f.borderColor}" stroke-width="${f.borderWidth}" fill-rule="evenodd" />`;
      }
      return '';
    }).filter(Boolean);
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <!-- MACRO Map Studio Export · ${new Date().toISOString()} -->
  <!-- ${pickedFeatures.length} feature(s) -->
  ${svgParts.join('\n  ')}
</svg>`;
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `macro_map_${exportResolution}_${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SectionPanel sectionKey="export" title="Export">
      {/* Resolution selector */}
      <div style={{ display: 'flex', gap: '0px' }}>
        {resolutions.map((r) => (
          <button
            key={r.key}
            className={`view-btn ${exportResolution === r.key ? 'active' : ''}`}
            style={{ borderRight: r.key === 'fhd' ? 'none' : undefined }}
            onClick={() => setExportResolution(r.key)}
          >
            {r.label}
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '9px', opacity: 0.7, marginLeft: '3px' }}>
              {r.w}×{r.h}
            </span>
          </button>
        ))}
      </div>

      {/* Selection mode toggle */}
      <button
        className={`action-btn ${exportSelectionMode ? 'active' : ''}`}
        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}
        onClick={() => setExportSelectionMode(!exportSelectionMode)}
      >
        {exportSelectionMode ? <CheckSquare size={11} /> : <Square size={11} />}
        Selection Only
        {exportSelectionMode && pickedFeatures.length > 0 && (
          <span style={{ marginLeft: '4px', opacity: 0.7 }}>({pickedFeatures.length})</span>
        )}
      </button>

      {/* Extra look indicator */}
      {extraLook && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)' }}>
          Look: {extraLook} · applied on export
        </p>
      )}

      {/* Export buttons */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          className="action-btn"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          onClick={handleExportPNG}
          disabled={isExporting}
        >
          <Download size={11} />
          {isExporting ? 'Exporting...' : 'PNG'}
        </button>
        <button
          className="action-btn"
          style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
            opacity: (!exportSelectionMode || pickedFeatures.length === 0) ? 0.4 : 1,
          }}
          onClick={handleExportSVG}
          disabled={!exportSelectionMode || pickedFeatures.length === 0}
          title={!exportSelectionMode ? 'Enable Selection Only first' : 'Export SVG outlines'}
        >
          <Download size={11} />
          SVG
        </button>
      </div>

      <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
        {exportSelectionMode
          ? pickedFeatures.length > 0
            ? `${pickedFeatures.length} feature${pickedFeatures.length !== 1 ? 's' : ''} · outline + fill`
            : 'Pick features first'
          : 'Full viewport · transparent PNG'}
      </p>
    </SectionPanel>
  );
}
