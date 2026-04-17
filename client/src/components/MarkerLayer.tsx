/**
 * MACRO Map Studio — MarkerLayer
 * Renders city markers on the map using Mapbox GL markers
 */

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore } from '@/store/useMapStore';

export function MarkerLayer() {
  const { mapInstance, markers } = useMapStore();
  const markerRefs = useRef<Map<string, mapboxgl.Marker>>(new Map());

  useEffect(() => {
    if (!mapInstance) return;

    // Remove markers that no longer exist
    const currentIds = new Set(markers.map((m) => m.id));
    markerRefs.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markerRefs.current.delete(id);
      }
    });

    // Add new markers
    markers.forEach((m) => {
      if (!markerRefs.current.has(m.id)) {
        const el = document.createElement('div');
        el.style.cssText = `
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: ${m.color};
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
          cursor: pointer;
        `;

        const popup = new mapboxgl.Popup({ offset: 10, closeButton: false })
          .setHTML(`<span style="font-family:'DM Sans',sans-serif;font-size:11px;color:#2a2520;">${m.name.split(',')[0]}</span>`);

        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat([m.lng, m.lat])
          .setPopup(popup)
          .addTo(mapInstance);

        markerRefs.current.set(m.id, marker);
      }
    });
  }, [mapInstance, markers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markerRefs.current.forEach((marker) => marker.remove());
      markerRefs.current.clear();
    };
  }, []);

  return null;
}
