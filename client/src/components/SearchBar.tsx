/**
 * MACRO Map Studio — SearchBar
 * Top-left floating search box matching sibling app (3D Miniature Map Studio) design exactly.
 * Position: top:16px, left:16px (same as sibling)
 * Width: 261px search box
 * Mapbox Geocoding v5, Korean + English
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useMapStore } from '@/store/useMapStore';

const MAPBOX_TOKEN = (import.meta.env.VITE_MAPBOX_TOKEN as string) ||
  '';

interface GeocodingFeature {
  id: string;
  place_name: string;
  place_name_ko?: string;
  text: string;
  center: [number, number];
  place_type: string[];
}

export function SearchBar() {
  const { mapInstance } = useMapStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingFeature[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    setIsLoading(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?access_token=${MAPBOX_TOKEN}` +
        `&language=ko,en` +
        `&types=country,region,district,place,locality,neighborhood,address,poi` +
        `&limit=6`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.features) {
        setResults(data.features);
        setIsOpen(data.features.length > 0);
        setActiveIdx(-1);
      }
    } catch (e) {
      console.error('Geocoding error', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(val), 280);
  };

  const handleSelect = (feature: GeocodingFeature) => {
    if (!mapInstance) return;
    const [lng, lat] = feature.center;
    const placeType = feature.place_type[0];
    const zoomMap: Record<string, number> = {
      country: 4,
      region: 6,
      district: 8,
      place: 10,
      locality: 12,
      neighborhood: 13,
      address: 15,
      poi: 15,
    };
    const zoom = zoomMap[placeType] ?? 10;
    mapInstance.flyTo({ center: [lng, lat], zoom, duration: 1400, essential: true });
    setQuery(feature.place_name_ko || feature.text || feature.place_name);
    setIsOpen(false);
    setResults([]);
    inputRef.current?.blur();
  };

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx >= 0) handleSelect(results[activeIdx]);
      else if (results.length > 0) handleSelect(results[0]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 100,
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
      }}
    >
      {/* Search input box — 261px, height 38px, matches sibling */}
      <div style={{ width: 261, flexShrink: 0, position: 'relative' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          background: 'rgba(250, 248, 244, 0.97)',
          border: '1px solid rgba(180, 170, 155, 0.5)',
          height: 38,
          padding: '0 10px',
          gap: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}>
          <Search size={14} style={{ color: '#9a9080', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setIsOpen(true)}
            placeholder="장소, 국가, 도시 검색 · Search places"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13,
              color: '#3a3530',
              fontWeight: 400,
            }}
          />
          {isLoading && (
            <div style={{
              width: 12, height: 12, border: '1.5px solid #c8b89a',
              borderTopColor: '#7a6a5a', borderRadius: '50%',
              animation: 'spin 0.7s linear infinite', flexShrink: 0,
            }} />
          )}
          {query && !isLoading && (
            <button
              onClick={handleClear}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
            >
              <X size={13} style={{ color: '#9a9080' }} />
            </button>
          )}
        </div>

        {/* Dropdown results */}
        {isOpen && results.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: 'rgba(250, 248, 244, 0.98)',
            border: '1px solid rgba(180, 170, 155, 0.5)',
            borderTop: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
            zIndex: 200,
            maxHeight: 280,
            overflowY: 'auto',
          }}>
            {results.map((feat, idx) => (
              <button
                key={feat.id}
                onMouseDown={() => handleSelect(feat)}
                onMouseEnter={() => setActiveIdx(idx)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 12px',
                  background: idx === activeIdx ? 'rgba(200, 190, 175, 0.3)' : 'transparent',
                  border: 'none',
                  borderBottom: idx < results.length - 1 ? '1px solid rgba(180,170,155,0.2)' : 'none',
                  cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
              >
                <div style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: '#3a3530',
                  fontWeight: 500,
                  lineHeight: 1.3,
                }}>
                  {feat.text}
                </div>
                <div style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  color: '#9a9080',
                  marginTop: 1,
                  lineHeight: 1.2,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {feat.place_name}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Dive to Miniature Map Studio button */}
      <button
        onClick={() => {
          window.open('https://minimap3d-qccwh8ig.manus.space/', '_blank', 'noopener,noreferrer');
        }}
        style={{
          height: 38,
          padding: '0 16px',
          background: '#4a5568',
          border: '1px solid #3a4255',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          whiteSpace: 'nowrap',
          transition: 'background 0.15s',
          flexShrink: 0,
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.background = '#3a4255';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.background = '#4a5568';
        }}
        title="Switch to 3D Miniature Map Studio"
      >
        {/* Mini cube icon */}
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ flexShrink: 0 }}>
          <path d="M6.5 1L12 4.5V9.5L6.5 13L1 9.5V4.5L6.5 1Z" stroke="rgba(255,255,255,0.85)" strokeWidth="1.3" fill="none"/>
          <path d="M6.5 1V7M6.5 7L12 4.5M6.5 7L1 4.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1"/>
        </svg>
        <span style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          color: 'rgba(255,255,255,0.92)',
          fontWeight: 700,
          letterSpacing: '0.03em',
        }}>
          Dive to Miniature
        </span>
      </button>

      {/* Spin animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
