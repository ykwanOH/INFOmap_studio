/**
 * MACRO Map Studio — MarkerLayer v2
 * - 마커 클릭 → 선택 (하이라이트)
 * - 선택 상태에서 Del / Backspace → 해당 마커 삭제
 */

import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore } from '@/store/useMapStore';

export function MarkerLayer() {
  const { mapInstance, markers } = useMapStore();
  const markerRefs = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ── 마커 추가/제거 ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance) return;

    const currentIds = new Set(markers.map((m) => m.id));
    markerRefs.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markerRefs.current.delete(id);
      }
    });

    markers.forEach((m) => {
      if (markerRefs.current.has(m.id)) return;

      const isSelected = selectedId === m.id;
      const el = document.createElement('div');
      el.dataset.markerId = m.id;
      el.style.cssText = `
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: ${m.color};
        border: 2.5px solid ${isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)'};
        box-shadow: ${isSelected ? `0 0 0 2px ${m.color}, 0 2px 6px rgba(0,0,0,0.4)` : '0 1px 4px rgba(0,0,0,0.3)'};
        cursor: pointer;
        transition: box-shadow 0.15s, border-color 0.15s;
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedId((prev) => prev === m.id ? null : m.id);
      });

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: false })
        .setHTML(`<span style="font-family:'DM Sans',sans-serif;font-size:11px;color:#2a2520;">${m.name.split(',')[0]}</span>`);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([m.lng, m.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      markerRefs.current.set(m.id, marker);
    });
  }, [mapInstance, markers, selectedId]);

  // ── 선택 상태 시각 업데이트 ────────────────────────────────────────────
  useEffect(() => {
    markers.forEach((m) => {
      const marker = markerRefs.current.get(m.id);
      if (!marker) return;
      const el = marker.getElement();
      const isSelected = selectedId === m.id;
      el.style.border = `2.5px solid ${isSelected ? '#ffffff' : 'rgba(255,255,255,0.7)'}`;
      el.style.boxShadow = isSelected
        ? `0 0 0 2.5px ${m.color}, 0 2px 8px rgba(0,0,0,0.4)`
        : '0 1px 4px rgba(0,0,0,0.3)';
      el.style.transform = isSelected ? 'scale(1.25)' : 'scale(1)';
    });
  }, [selectedId, markers]);

  // ── Del / Backspace 키 처리 ────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!selectedId) return;
      // input/textarea 포커스 중에는 무시
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        // 마커 DOM 제거
        const marker = markerRefs.current.get(selectedId);
        if (marker) { marker.remove(); markerRefs.current.delete(selectedId); }
        // store에서 제거
        useMapStore.setState((state) => ({
          markers: state.markers.filter((m) => m.id !== selectedId),
        }));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedId]);

  // ── 지도 빈 곳 클릭 → 선택 해제 ──────────────────────────────────────
  useEffect(() => {
    if (!mapInstance) return;
    const deselect = () => setSelectedId(null);
    mapInstance.on('click', deselect);
    return () => { mapInstance.off('click', deselect); };
  }, [mapInstance]);

  // ── Unmount 정리 ──────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      markerRefs.current.forEach((m) => m.remove());
      markerRefs.current.clear();
    };
  }, []);

  return null;
}
