/**
 * MACRO Map Studio — MarkerLayer v4
 * - 마커 클릭 → 선택 (하이라이트)
 * - Del / Backspace → 선택 마커 삭제
 * - 지도 빈 곳 클릭 → 선택 해제
 *
 * v4 fix: Mapbox Marker 위치 transform 충돌 버그 수정
 * wrapper(Mapbox용) + dot(시각용) 분리 — dot만 transform
 */

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore } from '@/store/useMapStore';

interface MarkerRefs {
  marker: mapboxgl.Marker;
  dot: HTMLElement;
}

export function MarkerLayer() {
  const { mapInstance, markers } = useMapStore();
  const markerRefs = useRef<Map<string, MarkerRefs>>(new Map());
  const selectedIdRef = useRef<string | null>(null);

  const applyDotStyle = (dot: HTMLElement, color: string, selected: boolean) => {
    dot.style.border = `2.5px solid ${selected ? '#ffffff' : 'rgba(255,255,255,0.65)'}`;
    dot.style.boxShadow = selected
      ? `0 0 0 2.5px ${color}, 0 2px 10px rgba(0,0,0,0.5)`
      : '0 1px 4px rgba(0,0,0,0.32)';
    dot.style.transform = selected ? 'scale(1.35)' : 'scale(1)';
    dot.style.zIndex = selected ? '10' : '1';
  };

  useEffect(() => {
    if (!mapInstance) return;

    const currentIds = new Set(markers.map((m) => m.id));
    markerRefs.current.forEach((refs, id) => {
      if (!currentIds.has(id)) {
        refs.marker.remove();
        markerRefs.current.delete(id);
        if (selectedIdRef.current === id) selectedIdRef.current = null;
      }
    });

    markers.forEach((m) => {
      if (markerRefs.current.has(m.id)) return;

      // Outer wrapper: Mapbox 포지셔닝 전용 (이 요소에 transform 사용 금지)
      const wrapper = document.createElement('div');
      wrapper.style.cssText = `width:18px;height:18px;display:flex;align-items:center;justify-content:center;cursor:pointer;`;

      // Inner dot: 시각 전용, transform 여기서만 사용
      const dot = document.createElement('div');
      dot.style.cssText = `
        width:12px;height:12px;border-radius:50%;
        background:${m.color};
        border:2.5px solid rgba(255,255,255,0.65);
        box-shadow:0 1px 4px rgba(0,0,0,0.32);
        transition:transform 0.12s,box-shadow 0.12s,border-color 0.12s;
        flex-shrink:0;position:relative;
      `;
      wrapper.appendChild(dot);

      wrapper.addEventListener('click', (e) => {
        e.stopPropagation();
        const prev = selectedIdRef.current;
        if (prev && prev !== m.id) {
          const pr = markerRefs.current.get(prev);
          const pm = markers.find(mk => mk.id === prev);
          if (pr && pm) applyDotStyle(pr.dot, pm.color, false);
        }
        if (prev === m.id) {
          selectedIdRef.current = null;
          applyDotStyle(dot, m.color, false);
        } else {
          selectedIdRef.current = m.id;
          applyDotStyle(dot, m.color, true);
        }
      });

      const popup = new mapboxgl.Popup({ offset: 14, closeButton: false })
        .setHTML(`<span style="font-family:'DM Sans',sans-serif;font-size:11px;color:#2a2520;">${m.name.split(',')[0]}</span>`);

      const marker = new mapboxgl.Marker({ element: wrapper, anchor: 'center' })
        .setLngLat([m.lng, m.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      markerRefs.current.set(m.id, { marker, dot });
    });
  }, [mapInstance, markers]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const id = selectedIdRef.current;
      if (!id) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const refs = markerRefs.current.get(id);
        if (refs) { refs.marker.remove(); markerRefs.current.delete(id); }
        useMapStore.setState((s) => ({ markers: s.markers.filter((m) => m.id !== id) }));
        selectedIdRef.current = null;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  useEffect(() => {
    if (!mapInstance) return;
    const deselect = () => {
      const id = selectedIdRef.current;
      if (!id) return;
      const refs = markerRefs.current.get(id);
      const m = useMapStore.getState().markers.find((mk) => mk.id === id);
      if (refs && m) applyDotStyle(refs.dot, m.color, false);
      selectedIdRef.current = null;
    };
    mapInstance.on('click', deselect);
    return () => { mapInstance.off('click', deselect); };
  }, [mapInstance]);

  useEffect(() => {
    return () => {
      markerRefs.current.forEach((refs) => refs.marker.remove());
      markerRefs.current.clear();
    };
  }, []);

  return null;
}
