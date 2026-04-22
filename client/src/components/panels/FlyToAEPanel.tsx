/**
 * MACRO Map Studio — Fly To AE Panel
 * Set From/To points, configure route animation, export JSX + map image for After Effects
 * Matches sibling app design system
 */

import { useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore, type RouteIconType } from '@/store/useMapStore';
import { SectionPanel, Toggle } from '@/components/ui/SectionPanel';
import { MapPin, Play, FileDown, Upload } from 'lucide-react';

const labelStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: '12px',
  color: 'var(--section-label-color)',
  fontWeight: 400,
  lineHeight: 1.2,
  whiteSpace: 'nowrap' as const,
};

const ICON_OPTIONS: { key: RouteIconType; emoji: string; label: string }[] = [
  { key: 'plane',   emoji: '✈', label: 'Plane' },
  { key: 'ship',    emoji: '🚢', label: 'Ship' },
  { key: 'missile', emoji: '🚀', label: 'Missile' },
  { key: 'custom',  emoji: '📁', label: 'Custom' },
];

export function FlyToAEPanel() {
  const {
    flyRoute,
    setFlyRouteFrom, setFlyRouteTo,
    setFlyRouteLineStyle, setFlyRouteShowLine, setFlyRouteShowIcon, setFlyRouteIconType,
    flyFromPickMode, setFlyFromPickMode,
    flyToPickMode, setFlyToPickMode,
    mapInstance,
  } = useMapStore();

  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const [isAnimating, setIsAnimating] = useState(false);

  const geocode = async (query: string) => {
    const res = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${mapboxgl.accessToken}&types=place,locality,region,country&limit=1`
    );
    const data = await res.json();
    if (data.features?.length > 0) {
      const [lng, lat] = data.features[0].center;
      return { lng, lat, name: data.features[0].place_name };
    }
    return null;
  };

  const handleSetFrom = async () => {
    if (!fromSearch.trim()) {
      setFlyFromPickMode(!flyFromPickMode);
      return;
    }
    const pt = await geocode(fromSearch);
    if (pt) { setFlyRouteFrom(pt); setFromSearch(''); }
  };

  const handleSetTo = async () => {
    if (!toSearch.trim()) {
      setFlyToPickMode(!flyToPickMode);
      return;
    }
    const pt = await geocode(toSearch);
    if (pt) { setFlyRouteTo(pt); setToSearch(''); }
  };

  const handleFly = () => {
    if (!mapInstance || !flyRoute.from || !flyRoute.to) return;
    setIsAnimating(true);
    const { from, to } = flyRoute;
    const midLng = (from.lng + to.lng) / 2;
    const midLat = (from.lat + to.lat) / 2;
    const dist = Math.sqrt(Math.pow(to.lng - from.lng, 2) + Math.pow(to.lat - from.lat, 2));
    const midZoom = Math.max(1, 5 - dist / 20);
    mapInstance.flyTo({ center: [from.lng, from.lat], zoom: 5, duration: 800 });
    setTimeout(() => {
      mapInstance.flyTo({ center: [midLng, midLat], zoom: midZoom, duration: 1500 });
      setTimeout(() => {
        mapInstance.flyTo({ center: [to.lng, to.lat], zoom: 5, duration: 1200 });
        setTimeout(() => setIsAnimating(false), 1200);
      }, 1600);
    }, 900);
  };

  const handleExportToAE = () => {
    if (!flyRoute.from || !flyRoute.to) return;
    const { from, to, lineStyle, iconType } = flyRoute;
    const now = new Date().toISOString();
    // Great-circle midpoint
    const midLng = (from.lng + to.lng) / 2;
    const midLat = (from.lat + to.lat) / 2;
    const dist = Math.sqrt(Math.pow(to.lng - from.lng, 2) + Math.pow(to.lat - from.lat, 2));
    const totalDuration = Math.max(4, Math.min(12, dist / 8)); // seconds
    const jsx = `// ============================================================
// MACRO Map Studio — After Effects Script
// Generated : ${now}
// From      : ${from.name}
//             lng=${from.lng.toFixed(6)}, lat=${from.lat.toFixed(6)}
// To        : ${to.name}
//             lng=${to.lng.toFixed(6)}, lat=${to.lat.toFixed(6)}
// Route     : ${lineStyle} line · icon=${iconType}
// Duration  : ${totalDuration.toFixed(1)}s
// ============================================================

(function macroMapFlyTo() {
  var comp = app.project.activeItem;
  if (!comp || !(comp instanceof CompItem)) {
    alert("Please open a Composition first.");
    return;
  }

  // ── Coordinate helpers ──────────────────────────────────────
  // Mercator projection: maps lng/lat to comp pixel coordinates
  function lngLatToComp(lng, lat, compW, compH) {
    var x = ((lng + 180) / 360) * compW;
    var y = ((90 - lat) / 180) * compH;
    return [x, y];
  }

  var compW = comp.width;
  var compH = comp.height;
  var fps   = comp.frameRate;
  var dur   = ${totalDuration.toFixed(2)}; // seconds

  // ── Key positions ───────────────────────────────────────────
  var fromPx = lngLatToComp(${from.lng}, ${from.lat}, compW, compH);
  var toPx   = lngLatToComp(${to.lng},   ${to.lat},   compW, compH);
  var midPx  = lngLatToComp(${midLng.toFixed(6)}, ${midLat.toFixed(6)}, compW, compH);

  // ── Camera ──────────────────────────────────────────────────
  var camLayer = comp.layers.addCamera("MACRO Fly Camera", [compW / 2, compH / 2]);
  camLayer.inPoint  = 0;
  camLayer.outPoint = dur;
  var camPos = camLayer.property("Transform").property("Position");
  camPos.setInterpolationTypeAtKey = camPos.setInterpolationTypeAtKey || function(){};

  var zoomFrom = compH * 0.6;
  var zoomMid  = compH * 1.8;
  var zoomTo   = compH * 0.6;

  camPos.setValueAtTime(0,          [fromPx[0], fromPx[1], -zoomFrom]);
  camPos.setValueAtTime(dur * 0.5,  [midPx[0],  midPx[1],  -zoomMid]);
  camPos.setValueAtTime(dur,        [toPx[0],   toPx[1],   -zoomTo]);

  // ── Route line (shape layer) ─────────────────────────────────
  var shapeLayer = comp.layers.addShape();
  shapeLayer.name = "Route Line";
  shapeLayer.inPoint  = 0;
  shapeLayer.outPoint = dur;
  var contents = shapeLayer.property("Contents");
  var grp = contents.addProperty("ADBE Vector Group");
  grp.name = "Route";
  var pathGroup = grp.property("Contents");
  var pathProp = pathGroup.addProperty("ADBE Vector Shape - Group");
  var path = new Shape();
  var steps = 60;
  var verts = [];
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    var lng = ${from.lng} + (${to.lng} - ${from.lng}) * t;
    var lat = ${from.lat} + (${to.lat} - ${from.lat}) * t;
    var arc = Math.sin(Math.PI * t) * ${(dist * 0.08).toFixed(2)};
    var px = lngLatToComp(lng, lat + arc, compW, compH);
    verts.push([px[0], px[1]]);
  }
  path.vertices = verts;
  path.closed = false;
  pathProp.property("Path").setValue(path);
  var stroke = pathGroup.addProperty("ADBE Vector Graphic - Stroke");
  stroke.property("Color").setValue([0.878, 0.361, 0.165, 1]); // #e05c2a
  stroke.property("Stroke Width").setValue(${lineStyle === 'dashed' ? 3 : 2});
  ${lineStyle === 'dashed' ? 'stroke.property("Dashes").addProperty("ADBE Vector Stroke Dash 1").setValue(20);' : '// solid line'}

  // ── Icon text layer ──────────────────────────────────────────
  var iconChar = "${iconType === 'plane' ? '✈' : iconType === 'ship' ? '⛵' : iconType === 'missile' ? '🚀' : '●'}";
  var iconLayer = comp.layers.addText(iconChar);
  iconLayer.name = "Route Icon";
  iconLayer.inPoint  = 0;
  iconLayer.outPoint = dur;
  var iconPos = iconLayer.property("Transform").property("Position");
  iconPos.setValueAtTime(0,     [fromPx[0], fromPx[1]]);
  iconPos.setValueAtTime(dur/2, [midPx[0],  midPx[1]]);
  iconPos.setValueAtTime(dur,   [toPx[0],   toPx[1]]);
  var textDoc = iconLayer.property("Source Text").value;
  textDoc.fontSize = 36;
  iconLayer.property("Source Text").setValue(textDoc);

  alert(
    "MACRO Map Studio — Fly To AE\n" +
    "Camera + Route + Icon layers created!\n\n" +
    "From : ${from.name.replace(/"/g, "'")}\n" +
    "To   : ${to.name.replace(/"/g, "'")}\n" +
    "Duration: " + dur + "s"
  );
})();`;
    const blob = new Blob([jsx], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `macro_map_AE_${Date.now()}.jsx`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);

    if (mapInstance) {
      const bounds = new mapboxgl.LngLatBounds(
        [Math.min(from.lng, to.lng) - 5, Math.min(from.lat, to.lat) - 5],
        [Math.max(from.lng, to.lng) + 5, Math.max(from.lat, to.lat) + 5]
      );
      mapInstance.fitBounds(bounds, { padding: 60, duration: 1000 });
      setTimeout(() => {
        mapInstance.once('render', () => {
          const canvas = mapInstance.getCanvas();
          const imgLink = document.createElement('a');
          imgLink.download = `macro_map_AE_bg_${Date.now()}.png`;
          imgLink.href = canvas.toDataURL('image/png');
          imgLink.click();
        });
        mapInstance.triggerRepaint();
      }, 1200);
    }
  };

  return (
    <SectionPanel sectionKey="flyToAE" title="Fly To AE">
      {/* FROM */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ ...labelStyle, fontWeight: 500 }}>From</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            type="text"
            className="text-input"
            value={fromSearch}
            onChange={(e) => setFromSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetFrom()}
            placeholder={flyRoute.from?.name ?? 'City name or pick...'}
            style={{ flex: 1, borderColor: flyFromPickMode ? 'var(--accent)' : undefined }}
          />
          <button
            className={`action-btn primary ${flyFromPickMode ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}
            onClick={handleSetFrom}
          >
            <MapPin size={11} />
            {flyFromPickMode ? '...' : 'Set'}
          </button>
        </div>
        {flyRoute.from && (
          <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)' }}>
            ✓ {flyRoute.from.name.split(',')[0]}
          </p>
        )}
      </div>

      {/* TO */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ ...labelStyle, fontWeight: 500 }}>To</span>
        <div style={{ display: 'flex', gap: '4px' }}>
          <input
            type="text"
            className="text-input"
            value={toSearch}
            onChange={(e) => setToSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetTo()}
            placeholder={flyRoute.to?.name ?? 'City name or pick...'}
            style={{ flex: 1, borderColor: flyToPickMode ? 'var(--accent)' : undefined }}
          />
          <button
            className={`action-btn primary ${flyToPickMode ? 'active' : ''}`}
            style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}
            onClick={handleSetTo}
          >
            <MapPin size={11} />
            {flyToPickMode ? '...' : 'Set'}
          </button>
        </div>
        {flyRoute.to && (
          <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--accent)' }}>
            ✓ {flyRoute.to.name.split(',')[0]}
          </p>
        )}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--glass-border)' }} />

      {/* Route Line toggle + style */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Toggle
          checked={flyRoute.showLine}
          onChange={setFlyRouteShowLine}
          label="Route Line"
        />
        {flyRoute.showLine && (
          <div style={{ display: 'flex', gap: '3px', marginLeft: 'auto' }}>
            {(['solid', 'dashed'] as const).map((style) => (
              <button
                key={style}
                className={`action-btn secondary ${flyRoute.lineStyle === style ? 'active' : ''}`}
                style={{ fontSize: '10px', padding: '2px 7px' }}
                onClick={() => setFlyRouteLineStyle(style)}
              >
                {style === 'solid' ? '——' : '- - -'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Icon toggle + selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Toggle
          checked={flyRoute.showIcon}
          onChange={setFlyRouteShowIcon}
          label="Icon"
        />
        {flyRoute.showIcon && (
          <div style={{ display: 'flex', gap: '3px', marginLeft: 'auto' }}>
            {ICON_OPTIONS.map(({ key, emoji, label }) => (
              <button
                key={key}
                className={`action-btn secondary ${flyRoute.iconType === key ? 'active' : ''}`}
                style={{ fontSize: '12px', padding: '2px 5px' }}
                onClick={() => setFlyRouteIconType(key)}
                title={label}
              >
                {key === 'custom' ? <Upload size={11} /> : emoji}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* FLY + To AE buttons */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          className="action-btn primary"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}
          onClick={handleFly}
          disabled={!flyRoute.from || !flyRoute.to || isAnimating}
        >
          <Play size={11} />
          {isAnimating ? 'Flying...' : 'Fly'}
        </button>
        <button
          className="action-btn primary"
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontWeight: 600 }}
          onClick={handleExportToAE}
          disabled={!flyRoute.from || !flyRoute.to}
          title="Export JSX + map image for After Effects"
        >
          <FileDown size={11} />
          To AE
        </button>
      </div>

      {(!flyRoute.from || !flyRoute.to) && (
        <p style={{ ...labelStyle, fontSize: '11px', color: 'var(--muted-foreground)' }}>
          Set both From and To points to continue
        </p>
      )}
    </SectionPanel>
  );
}
