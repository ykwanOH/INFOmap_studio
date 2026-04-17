/**
 * MACRO Map Studio — Global State Store (Zustand)
 * Manages all map, panel, and feature state
 */

import { create } from 'zustand';
import type { Map as MapboxMap } from 'mapbox-gl';

// ── Types ──────────────────────────────────────────────────────────────────

export type MapStyle = 'vector' | 'satellite';
export type ViewMode = '2d' | '3d';
export type MapToastScheme = 'twotone' | 'beigegray' | 'bluegray';
// country  : 국경 (Mapbox admin_0)
// state    : 주/도 경계 (Mapbox admin_1 + 한국 17개 광역)
// district : 구/시 경계 (한국 sgg 레벨, 서울 25구 + 각 도 시군)
export type BorderLevel = 'country' | 'state' | 'district';
export type RouteIconType = 'plane' | 'ship' | 'missile' | 'custom';
export type ExtraLookType = 'monotone' | 'vintage' | 'digital' | null;

export interface ColorConfig {
  landmass: string;    // 대지
  hydro: string;       // 수계
  green: string;       // 녹지
  expressway: string;  // 고속·주간선 도로 (motorway, trunk, primary)
  streetroad: string;  // 집산·일반도로 (secondary, tertiary, street, residential)
}

export interface BorderConfig {
  enabled: boolean;
  color: string;
  width: number;
}

export interface PickedFeature {
  id: string | number;
  sourceLayer: string;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  extrudeHeight: number;
  geometry?: GeoJSON.Geometry;
}

export interface RoutePoint {
  lng: number;
  lat: number;
  name: string;
}

export interface FlyRoute {
  from: RoutePoint | null;
  to: RoutePoint | null;
  lineStyle: 'solid' | 'dashed';
  showLine: boolean;
  showIcon: boolean;
  iconType: RouteIconType;
  customIconUrl: string | null;
}

export interface MapStoreState {
  // ── Map instance ──
  mapInstance: MapboxMap | null;
  setMapInstance: (map: MapboxMap | null) => void;

  // ── Panel visibility (hamburger toggle) ──
  panelVisible: boolean;
  setPanelVisible: (v: boolean) => void;

  // ── Camera ──
  zoom: number;
  setZoom: (z: number) => void;
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  mapStyle: MapStyle;
  setMapStyle: (s: MapStyle) => void;

  // ── Label / Road toggles ──
  showLabels: boolean;
  setShowLabels: (v: boolean) => void;
  showRoads: boolean;
  setShowRoads: (v: boolean) => void;

  // ── Color ──
  colors: ColorConfig;
  setColor: (key: keyof ColorConfig, value: string) => void;
  colorPresets: [ColorConfig | null, ColorConfig | null];
  savePreset: (index: 0 | 1) => void;
  loadPreset: (index: 0 | 1) => void;
  resetColors: () => void;

  // ── Map Toast ──
  mapToastActive: boolean;
  setMapToastActive: (v: boolean) => void;
  mapToastScheme: MapToastScheme;
  setMapToastScheme: (s: MapToastScheme) => void;

  // ── Border ──
  borders: Record<BorderLevel, BorderConfig>;
  setBorderEnabled: (level: BorderLevel, enabled: boolean) => void;
  setBorderColor: (level: BorderLevel, color: string) => void;
  setBorderWidth: (level: BorderLevel, width: number) => void;

  // ── Markers ──
  markers: Array<{ id: string; lng: number; lat: number; name: string; color: string }>;
  addMarker: (lng: number, lat: number, name: string, color: string) => void;
  clearMarkers: () => void;

  // ── Pick and Push ──
  pickMode: boolean;
  setPickMode: (v: boolean) => void;
  pickedFeatures: PickedFeature[];
  addPickedFeature: (f: PickedFeature) => void;
  updatePickedFeature: (id: string | number, updates: Partial<PickedFeature>) => void;
  clearPickedFeatures: () => void;
  resetAllPicks: () => void;

  // ── Route Line ──
  isDrawingRoute: boolean;
  setIsDrawingRoute: (v: boolean) => void;
  routeColor: string;
  setRouteColor: (c: string) => void;
  routePoints: Array<[number, number]>;
  addRoutePoint: (pt: [number, number]) => void;
  clearRoutePoints: () => void;
  terrainExaggeration: number;
  setTerrainExaggeration: (v: number) => void;
  hillshadeEnabled: boolean;
  setHillshadeEnabled: (v: boolean) => void;
  elevationPreset: 'natural' | 'vivid' | 'arctic';
  setElevationPreset: (v: 'natural' | 'vivid' | 'arctic') => void;

  // ── Export ──
  exportResolution: 'fhd' | '4k';
  setExportResolution: (v: 'fhd' | '4k') => void;
  exportSelectionMode: boolean;
  setExportSelectionMode: (v: boolean) => void;

  // ── Hi-Res Capture ──
  hiResZoomDelta: 0 | 1 | 2;
  setHiResZoomDelta: (v: 0 | 1 | 2) => void;
  hiResCapturing: boolean;
  setHiResCapturing: (v: boolean) => void;

  // ── Fly To AE ──
  flyRoute: FlyRoute;
  setFlyRouteFrom: (pt: RoutePoint | null) => void;
  setFlyRouteTo: (pt: RoutePoint | null) => void;
  setFlyRouteLineStyle: (s: 'solid' | 'dashed') => void;
  setFlyRouteShowLine: (v: boolean) => void;
  setFlyRouteShowIcon: (v: boolean) => void;
  setFlyRouteIconType: (t: RouteIconType) => void;
  setFlyRouteCustomIcon: (url: string | null) => void;
  flyFromPickMode: boolean;
  setFlyFromPickMode: (v: boolean) => void;
  flyToPickMode: boolean;
  setFlyToPickMode: (v: boolean) => void;

  // ── Extra Look ──
  extraLook: ExtraLookType;
  setExtraLook: (v: ExtraLookType) => void;
  extraLookPreviewOpen: boolean;
  setExtraLookPreviewOpen: (v: boolean) => void;

  // ── Panel section open/close ──
  sections: Record<string, boolean>;
  toggleSection: (key: string) => void;
  setSectionOpen: (key: string, open: boolean) => void;
}

// 새 기본 컬러값 (요청 #12)
const DEFAULT_COLORS: ColorConfig = {
  landmass:   '#E9E4E0',
  hydro:      '#BAC1D3',
  green:      '#B3BDA3',
  expressway: '#ECECEC',
  streetroad: '#E8E2E0',
};

const DEFAULT_BORDERS: Record<BorderLevel, BorderConfig> = {
  country:  { enabled: true,  color: '#403E35', width: 3.0 },
  state:    { enabled: false, color: '#F2EBE8', width: 1.0 },
  district: { enabled: false, color: '#F2EBE8', width: 1.0 },
};

const DEFAULT_FLY_ROUTE: FlyRoute = {
  from: null,
  to: null,
  lineStyle: 'solid',
  showLine: true,
  showIcon: true,
  iconType: 'plane',
  customIconUrl: null,
};

// Default sections open/close state
const DEFAULT_SECTIONS: Record<string, boolean> = {
  camera: true,
  color: false,
  mapToast: true,
  hiResCap: true,
  borderMarker: false,
  pickPush: true,
  routeLine: false,
  export: true,
  flyToAE: true,
  extraLook: false,
};

export const useMapStore = create<MapStoreState>((set, get) => ({
  // ── Map instance ──
  mapInstance: null,
  setMapInstance: (map) => set({ mapInstance: map }),

  // ── Panel visibility ──
  panelVisible: true,
  setPanelVisible: (v) => set({ panelVisible: v }),

  // ── Camera ──
  zoom: 4.5,
  setZoom: (z) => set({ zoom: z }),
  viewMode: '2d',
  setViewMode: (v) => set({ viewMode: v }),
  mapStyle: 'vector',
  setMapStyle: (s) => set({ mapStyle: s }),

  // ── Label / Road toggles ──
  showLabels: false,
  setShowLabels: (v) => set({ showLabels: v }),
  showRoads: true,
  setShowRoads: (v) => set({ showRoads: v }),

  // ── Color ──
  colors: { ...DEFAULT_COLORS },
  setColor: (key, value) =>
    set((state) => ({ colors: { ...state.colors, [key]: value } })),
  colorPresets: [null, null],
  savePreset: (index) => {
    const current = get().colors;
    set((state) => {
      const presets: [ColorConfig | null, ColorConfig | null] = [...state.colorPresets] as [ColorConfig | null, ColorConfig | null];
      presets[index] = { ...current };
      return { colorPresets: presets };
    });
  },
  loadPreset: (index) => {
    const preset = get().colorPresets[index];
    if (preset) set({ colors: { ...preset } });
  },
  resetColors: () => set({ colors: { ...DEFAULT_COLORS } }),

  // ── Map Toast ──
  mapToastActive: false,
  setMapToastActive: (v) => set({ mapToastActive: v }),
  mapToastScheme: 'twotone',
  setMapToastScheme: (s) => set({ mapToastScheme: s }),

  // ── Border ──
  borders: { ...DEFAULT_BORDERS },
  setBorderEnabled: (level, enabled) =>
    set((state) => ({
      borders: { ...state.borders, [level]: { ...state.borders[level], enabled } },
    })),
  setBorderColor: (level, color) =>
    set((state) => ({
      borders: { ...state.borders, [level]: { ...state.borders[level], color } },
    })),
  setBorderWidth: (level, width) =>
    set((state) => ({
      borders: { ...state.borders, [level]: { ...state.borders[level], width } },
    })),

  // ── Markers ──
  markers: [],
  addMarker: (lng, lat, name, color) =>
    set((state) => ({
      markers: [...state.markers, { id: `${Date.now()}`, lng, lat, name, color }],
    })),
  clearMarkers: () => set({ markers: [] }),

  // ── Pick and Push ──
  pickMode: false,
  setPickMode: (v) => set({ pickMode: v }),
  pickedFeatures: [],
  addPickedFeature: (f) =>
    set((state) => ({ pickedFeatures: [...state.pickedFeatures, f] })),
  updatePickedFeature: (id, updates) =>
    set((state) => ({
      pickedFeatures: state.pickedFeatures.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),
  clearPickedFeatures: () => set({ pickedFeatures: [] }),
  resetAllPicks: () => set({ pickedFeatures: [], pickMode: false }),

  // ── Route Line ──
  isDrawingRoute: false,
  setIsDrawingRoute: (v) => set({ isDrawingRoute: v }),
  routeColor: '#e05c2a',
  setRouteColor: (c) => set({ routeColor: c }),
  routePoints: [],
  addRoutePoint: (pt) =>
    set((state) => ({ routePoints: [...state.routePoints, pt] })),
  clearRoutePoints: () => set({ routePoints: [] }),
  terrainExaggeration: 1.0,
  setTerrainExaggeration: (v) => set({ terrainExaggeration: v }),
  hillshadeEnabled: false,
  setHillshadeEnabled: (v) => set({ hillshadeEnabled: v }),
  elevationPreset: 'natural',
  setElevationPreset: (v) => set({ elevationPreset: v }),

  // ── Export ──
  exportResolution: 'fhd',
  setExportResolution: (v) => set({ exportResolution: v }),
  exportSelectionMode: false,
  setExportSelectionMode: (v) => set({ exportSelectionMode: v }),

  // ── Hi-Res Capture ──
  hiResZoomDelta: 1,
  setHiResZoomDelta: (v) => set({ hiResZoomDelta: v }),
  hiResCapturing: false,
  setHiResCapturing: (v) => set({ hiResCapturing: v }),

  // ── Fly To AE ──
  flyRoute: { ...DEFAULT_FLY_ROUTE },
  setFlyRouteFrom: (pt) =>
    set((state) => ({ flyRoute: { ...state.flyRoute, from: pt } })),
  setFlyRouteTo: (pt) =>
    set((state) => ({ flyRoute: { ...state.flyRoute, to: pt } })),
  setFlyRouteLineStyle: (s) =>
    set((state) => ({ flyRoute: { ...state.flyRoute, lineStyle: s } })),
  setFlyRouteShowLine: (v) =>
    set((state) => ({ flyRoute: { ...state.flyRoute, showLine: v } })),
  setFlyRouteShowIcon: (v) =>
    set((state) => ({ flyRoute: { ...state.flyRoute, showIcon: v } })),
  setFlyRouteIconType: (t) =>
    set((state) => ({ flyRoute: { ...state.flyRoute, iconType: t } })),
  setFlyRouteCustomIcon: (url) =>
    set((state) => ({ flyRoute: { ...state.flyRoute, customIconUrl: url } })),
  flyFromPickMode: false,
  setFlyFromPickMode: (v) => set({ flyFromPickMode: v, flyToPickMode: v ? false : get().flyToPickMode }),
  flyToPickMode: false,
  setFlyToPickMode: (v) => set({ flyToPickMode: v, flyFromPickMode: v ? false : get().flyFromPickMode }),

  // ── Extra Look ──
  extraLook: null,
  setExtraLook: (v) => set({ extraLook: v }),
  extraLookPreviewOpen: false,
  setExtraLookPreviewOpen: (v) => set({ extraLookPreviewOpen: v }),

  // ── Panel sections ──
  sections: { ...DEFAULT_SECTIONS },
  toggleSection: (key) =>
    set((state) => ({
      sections: { ...state.sections, [key]: !state.sections[key] },
    })),
  setSectionOpen: (key, open) =>
    set((state) => ({
      sections: { ...state.sections, [key]: open },
    })),
}));
