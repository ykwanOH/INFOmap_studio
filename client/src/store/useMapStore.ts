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
export type RouteIconType = 'plane' | 'missile' | 'custom';
export type ExtraLookType = 'bwprint' | 'vintage' | 'digital' | null;
export type RouteCapStyle = 'none' | 'circle' | 'arrow';
export type RouteLineStyle = 'solid' | 'dashed';

export interface RouteSegment {
  id: string;
  points: Array<[number, number]>;   // 앵커 포인트들 (Catmull-Rom 통과점)
  color: string;
  lineStyle: RouteLineStyle;
  capStyle: RouteCapStyle;
  width: number;                     // 라인 굵기 (px)
  selected: boolean;
}

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

export type PickDisplayMode = 'floating' | 'extrude';
export type PickUnitMode = 'country' | 'state';

export interface PickedFeature {
  id: string | number;
  sourceLayer: string;
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  floatHeight: number;   // floating/extrude 공유 높이 (m)
  geometry?: GeoJSON.Geometry;
  groupId: number;       // 세트 번호: Float/Extrude 적용 시 새 그룹 시작
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
  borderTouched: boolean;  // 보더 슬라이더/토글을 한 번이라도 건드렸는지
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
  pickDisplayMode: PickDisplayMode;
  setPickDisplayMode: (v: PickDisplayMode) => void;
  pickUnitMode: PickUnitMode;
  setPickUnitMode: (v: PickUnitMode) => void;
  pickedFeatures: PickedFeature[];
  currentGroupId: number;           // 현재 진행 중인 세트 번호
  groupModified: boolean;           // 현재 세트 컨트롤이 수정되었는지
  addPickedFeature: (f: PickedFeature) => void;
  updatePickedFeature: (id: string | number, updates: Partial<PickedFeature>) => void;
  updateCurrentGroupHeight: (height: number) => void;  // 현재 세트 전체 높이 변경
  updateCurrentGroupProps: (updates: Partial<PickedFeature>) => void;  // 현재 세트 전체 속성 변경
  commitGroup: () => void;           // 새 세트 시작
  clearPickedFeatures: () => void;
  resetAllPicks: () => void;

  // ── Route Line ──
  routes: RouteSegment[];                          // 완료된 라인들
  draftPoints: Array<[number, number]>;            // 현재 그리는 중인 점들
  isDrawingRoute: boolean;
  setIsDrawingRoute: (v: boolean) => void;
  activeRouteColor: string;
  setActiveRouteColor: (c: string) => void;
  activeRouteLineStyle: RouteLineStyle;
  setActiveRouteLineStyle: (s: RouteLineStyle) => void;
  activeRouteCapStyle: RouteCapStyle;
  setActiveRouteCapStyle: (s: RouteCapStyle) => void;
  activeRouteWidth: number;
  setActiveRouteWidth: (v: number) => void;
  draftDragPoint: [number, number] | null;         // 드래그 중 마우스 위치 (곡률 미리보기)
  setDraftDragPoint: (pt: [number, number] | null) => void;
  addDraftPoint: (pt: [number, number]) => void;
  undoLastDraftPoint: () => void;                  // Backspace
  commitRoute: () => void;                         // Enter — draft → route
  selectRoute: (id: string | null) => void;
  updateRoute: (id: string, updates: Partial<Pick<RouteSegment, 'color' | 'lineStyle' | 'capStyle' | 'width'>>) => void;
  deleteSelectedRoute: () => void;
  clearAllRoutes: () => void;
  terrainExaggeration: number;
  setTerrainExaggeration: (v: number) => void;
  hillshadeEnabled: boolean;
  setHillshadeEnabled: (v: boolean) => void;
  hillshadeSharpness: number;       // 0.1 ~ 1.0 (높을수록 선명)
  setHillshadeSharpness: (v: number) => void;
  elevationPreset: 'natural' | 'vivid' | 'arctic';
  setElevationPreset: (v: 'natural' | 'vivid' | 'arctic') => void;
  elevationColors: { shadow: string; highlight: string; midtone: string };
  setElevationColors: (c: { shadow: string; highlight: string; midtone: string }) => void;
  extrudeLightAzimuth: number;        // 빛 방향 수평각 (0~360°)
  setExtrudeLightAzimuth: (v: number) => void;
  extrudeAOIntensity: number;         // Ambient Occlusion 강도 (0~1)
  setExtrudeAOIntensity: (v: number) => void;
  extrudeAORadius: number;            // AO 반경 (m)
  setExtrudeAORadius: (v: number) => void;
  illuminationAngle: number;
  setIlluminationAngle: (v: number) => void;

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

  // ── BW Print settings ──
  bwStripeColor: string;
  setBwStripeColor: (v: string) => void;
  bwStripeAngle: number;
  setBwStripeAngle: (v: number) => void;
  bwStripeWidth: number;
  setBwStripeWidth: (v: number) => void;
  bwStripeGap: number;
  setBwStripeGap: (v: number) => void;

  // ── Vintage preset ──
  vintagePreset: 'kodachrome' | 'desert' | 'bauhaus';
  setVintagePreset: (v: 'kodachrome' | 'desert' | 'bauhaus') => void;

  // ── Digital preset ──
  digitalPreset: 'cyberglitch' | 'neonnights';
  setDigitalPreset: (v: 'cyberglitch' | 'neonnights') => void;

  // ── Panel section open/close ──
  sections: Record<string, boolean>;
  toggleSection: (key: string) => void;
  setSectionOpen: (key: string, open: boolean) => void;
}

// 새 기본 컬러값 (요청 #12)
const DEFAULT_COLORS: ColorConfig = {
  landmass:   '#DCD5D0',
  hydro:      '#99AABD',
  green:      '#B3BDA3',
  expressway: '#ECECEC',
  streetroad: '#E8E2E0',
};

const DEFAULT_BORDERS: Record<BorderLevel, BorderConfig> = {
  country:  { enabled: true,  color: '#949184', width: 1.5 },
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
  showRoads: false,
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
  borderTouched: false,
  setBorderEnabled: (level, enabled) =>
    set((state) => ({
      borderTouched: true,
      borders: { ...state.borders, [level]: { ...state.borders[level], enabled } },
    })),
  setBorderColor: (level, color) =>
    set((state) => ({
      borderTouched: true,
      borders: { ...state.borders, [level]: { ...state.borders[level], color } },
    })),
  setBorderWidth: (level, width) =>
    set((state) => ({
      borderTouched: true,
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
  pickDisplayMode: 'floating',
  setPickDisplayMode: (v) => set({ pickDisplayMode: v }),
  pickUnitMode: 'country',
  setPickUnitMode: (v) => set({ pickUnitMode: v }),
  pickedFeatures: [],
  currentGroupId: 0,
  groupModified: false,
  addPickedFeature: (f) =>
    set((state) => {
      // 현재 세트가 수정된 적 있으면 → 새 세트 자동 시작
      const groupId = state.groupModified
        ? state.currentGroupId + 1
        : state.currentGroupId;
      const newCurrentGroupId = state.groupModified ? groupId : state.currentGroupId;

      // 같은 그룹 내 동일 id → 토글 해제
      const exists = state.pickedFeatures.find(
        (p) => p.id === f.id && p.groupId === newCurrentGroupId
      );
      if (exists) return {
        pickedFeatures: state.pickedFeatures.filter(
          (p) => !(p.id === f.id && p.groupId === newCurrentGroupId)
        ),
        currentGroupId: newCurrentGroupId,
        groupModified: false,
      };
      return {
        pickedFeatures: [...state.pickedFeatures, { ...f, groupId: newCurrentGroupId }],
        currentGroupId: newCurrentGroupId,
        groupModified: false,
      };
    }),
  updatePickedFeature: (id, updates) =>
    set((state) => ({
      pickedFeatures: state.pickedFeatures.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),
  updateCurrentGroupHeight: (height) =>
    set((state) => ({
      pickedFeatures: state.pickedFeatures.map((f) =>
        f.groupId === state.currentGroupId ? { ...f, floatHeight: height } : f
      ),
      groupModified: true,
    })),
  updateCurrentGroupProps: (updates) =>
    set((state) => ({
      pickedFeatures: state.pickedFeatures.map((f) =>
        f.groupId === state.currentGroupId ? { ...f, ...updates } : f
      ),
      groupModified: true,
    })),
  commitGroup: () =>
    set((state) => ({ currentGroupId: state.currentGroupId + 1 })),
  clearPickedFeatures: () => set({ pickedFeatures: [], currentGroupId: 0, groupModified: false }),
  resetAllPicks: () => set({ pickedFeatures: [], pickMode: false, currentGroupId: 0, groupModified: false }),

  // ── Route Line ──
  routes: [],
  draftPoints: [],
  isDrawingRoute: false,
  setIsDrawingRoute: (v) => set({ isDrawingRoute: v }),
  activeRouteColor: '#e05c2a',
  setActiveRouteColor: (c) => set({ activeRouteColor: c }),
  activeRouteLineStyle: 'solid',
  setActiveRouteLineStyle: (s) => set({ activeRouteLineStyle: s }),
  activeRouteCapStyle: 'none',
  setActiveRouteCapStyle: (s) => set({ activeRouteCapStyle: s }),
  activeRouteWidth: 2.5,
  setActiveRouteWidth: (v) => set({ activeRouteWidth: v }),
  draftDragPoint: null,
  setDraftDragPoint: (pt) => set({ draftDragPoint: pt }),
  addDraftPoint: (pt) =>
    set((state) => ({ draftPoints: [...state.draftPoints, pt] })),
  undoLastDraftPoint: () =>
    set((state) => ({ draftPoints: state.draftPoints.slice(0, -1) })),
  commitRoute: () =>
    set((state) => {
      if (state.draftPoints.length < 2) return { draftPoints: [] };
      const newRoute: RouteSegment = {
        id: `route-${Date.now()}`,
        points: [...state.draftPoints],
        color: state.activeRouteColor,
        lineStyle: state.activeRouteLineStyle,
        capStyle: state.activeRouteCapStyle,
        width: state.activeRouteWidth,
        selected: false,
      };
      return { routes: [...state.routes, newRoute], draftPoints: [], draftDragPoint: null, isDrawingRoute: false };
    }),
  selectRoute: (id) =>
    set((state) => ({
      routes: state.routes.map((r) => ({ ...r, selected: r.id === id })),
    })),
  updateRoute: (id, updates) =>
    set((state) => ({
      routes: state.routes.map((r) => r.id === id ? { ...r, ...updates } : r),
    })),
  deleteSelectedRoute: () =>
    set((state) => ({ routes: state.routes.filter((r) => !r.selected) })),
  clearAllRoutes: () => set({ routes: [], draftPoints: [], draftDragPoint: null }),
  terrainExaggeration: 1.0,
  setTerrainExaggeration: (v) => set({ terrainExaggeration: v }),
  hillshadeEnabled: false,
  setHillshadeEnabled: (v) => set({ hillshadeEnabled: v }),
  hillshadeSharpness: 0.5,
  setHillshadeSharpness: (v) => set({ hillshadeSharpness: v }),
  elevationPreset: 'natural',
  setElevationPreset: (v) => set({ elevationPreset: v }),
  elevationColors: { shadow: '#c09050', highlight: '#d0d0d0', midtone: '#4a8a4a' },
  extrudeLightAzimuth: 210,
  setExtrudeLightAzimuth: (v) => set({ extrudeLightAzimuth: v }),
  extrudeAOIntensity: 0.5,
  setExtrudeAOIntensity: (v) => set({ extrudeAOIntensity: v }),
  extrudeAORadius: 60,
  setExtrudeAORadius: (v) => set({ extrudeAORadius: v }),
  setElevationColors: (c) => set({ elevationColors: c }),
  illuminationAngle: 315,
  setIlluminationAngle: (v) => set({ illuminationAngle: v }),

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

  // ── BW Print settings ──
  bwStripeColor: '#555555',
  setBwStripeColor: (v) => set({ bwStripeColor: v }),
  bwStripeAngle: 45,
  setBwStripeAngle: (v) => set({ bwStripeAngle: v }),
  bwStripeWidth: 3,
  setBwStripeWidth: (v) => set({ bwStripeWidth: v }),
  bwStripeGap: 6,
  setBwStripeGap: (v) => set({ bwStripeGap: v }),

  // ── Vintage preset ──
  vintagePreset: 'kodachrome' as const,
  setVintagePreset: (v) => set({ vintagePreset: v }),

  // ── Digital preset ──
  digitalPreset: 'cyberglitch' as const,
  setDigitalPreset: (v) => set({ digitalPreset: v }),

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
