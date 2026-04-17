/**
 * MACRO Map Studio — Home Page
 * Full-screen map with floating control panel and search bar
 */

import MapView from '@/components/MapView';
import { ControlPanel } from '@/components/ControlPanel';
import { MarkerLayer } from '@/components/MarkerLayer';
import { SearchBar } from '@/components/SearchBar';

export default function Home() {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Full-screen map */}
      <MapView />

      {/* Marker overlay */}
      <MarkerLayer />

      {/* Top-left: Search box + Dive button */}
      <SearchBar />

      {/* Right control panel */}
      <ControlPanel />
    </div>
  );
}
