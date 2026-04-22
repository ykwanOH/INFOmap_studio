/**
 * MACRO Map Studio — MarkerLayer v3
 * - 마커 클릭 → 선택 (하이라이트) — 재생성 없이 스타일만 변경
 * - Del / Backspace → 선택 마커 삭제
 * - 지도 빈 곳 클릭 → 선택 해제
 */

import { useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { useMapStore } from '@/store/useMapStore';

export function MarkerLayer() {
  const { mapInstance, markers } = useMapStore();
  const markerRefs = useRef<Map<string, mapboxgl.Marker>>(new Map());
  // ref로 관리 — state로 하면 마커 재생성 루프 발생
  const selectedIdRef = useRef<string | null>(null);

  const applyStyle = (id: string, color: string, selected: boolean) => {
    const marker = markerRefs.current.get(id);
    if (!marker) return;
    const el = marker.getElement();
    el.style.border = `2.5px solid ${selected ? '#ffffff' : 'rgba(255,255,255,0.6)'}`;
    el.style.boxShadow = selected
      ? `0 0 0 2.5px ${color}, 0 2px 8px rgba(0,0,0,0.45)`
      : '0 1px 4px rgba(0,0,0,0.3)';
    el.style.transform = selected ? 'scale(1.3)' : 'scale(1)';
    el.style.zIndex = selected ? '10' : '1';
  };

  // ── 마커 추가 / 제거 ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapInstance) return;

    // 삭제된 마커 제거
    const currentIds = new Set(markers.map((m) => m.id));
    markerRefs.current.forEach((marker, id) => {
      if (!currentIds.has(id)) {
        marker.remove();
        markerRefs.current.delete(id);
        if (selectedIdRef.current === id) selectedIdRef.current = null;
      }
    });

    // 새 마커 추가
    markers.forEach((m) => {
      if (markerRefs.current.has(m.id)) return;

      const el = document.createElement('div');
      el.style.cssText = `
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: ${m.color};
        border: 2.5px solid rgba(255,255,255,0.6);
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        cursor: pointer;
        transition: transform 0.12s, box-shadow 0.12s;
        position: relative;
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const prev = selectedIdRef.current;

        // 이전 선택 해제
        if (prev && prev !== m.id) {
          const prevMarker = markers.find(mk => mk.id === prev);
          if (prevMarker) applyStyle(prev, prevMarker.color, false);
        }

        // 토글
        if (prev === m.id) {
          selectedIdRef.current = null;
          applyStyle(m.id, m.color, false);
        } else {
          selectedIdRef.current = m.id;
          applyStyle(m.id, m.color, true);
        }
      });

      const popup = new mapboxgl.Popup({ offset: 12, closeButton: false })
        .setHTML(`<span style="font-family:'DM Sans',sans-serif;font-size:11px;color:#2a2520;">${m.name.split(',')[0]}</span>`);

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([m.lng, m.lat])
        .setPopup(popup)
        .addTo(mapInstance);

      markerRefs.current.set(m.id, marker);
    });
  }, [mapInstance, markers]);

  // ── Del / Backspace 삭제 ───────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const id = selectedIdRef.current;
      if (!id) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const marker = markerRefs.current.get(id);
        if (marker) { marker.remove(); markerRefs.current.delete(id); }
        useMapStore.setState((s) => ({ markers: s.markers.filter((m) => m.id !== id) }));
        selectedIdRef.current = null;
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // ── 지도 빈 곳 클릭 → 선택 해제 ──────────────────────────────────────
  useEffect(() => {
    if (!mapInstance) return;
    const deselect = () => {
      const id = selectedIdRef.current;
      if (!id) return;
      const m = useMapStore.getState().markers.find((mk) => mk.id === id);
      if (m) applyStyle(id, m.color, false);
      selectedIdRef.current = null;
    };
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
