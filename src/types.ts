export type NodeType = 'cluster-center' | 'note';

export type EdgeType = 'semantic' | 'wiki-link' | 'backlink' | 'shared-tag' | 'cluster-link';

export type GraphMode = 'neighborhood' | 'semantic' | 'links';

export type DensityPreset = 'compact' | 'balanced' | 'expanded';

export interface GraphNode {
  id: string; // file path or unique key
  title: string;
  path: string;
  clusterId: string;
  cluster: string; // legacy alias
  clusterColor: string;
  size: number;
  color: string;
  type: NodeType;
  depth: number;
  similarity: number;
  score?: number;
  isFocus: boolean;
  isRepresentative: boolean;
  isOrphan?: boolean;
  opacity?: number;
  isPinned?: boolean;
  isHidden?: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export interface GraphEdge {
  source: string | GraphNode;
  target: string | GraphNode;
  type: EdgeType;
  weight: number;
  dashed: boolean;
  opacity: number;
  isPrimaryCrossCluster?: boolean;
}

export interface ClusterGroup {
  id: string;
  name: string;
  color: string;
  nodes: GraphNode[];
  representativeId?: string;
  anchorX?: number;
  anchorY?: number;
}

export interface NodeInteractionState {
  hoveredNodeId: string | null;
  selectedNodeId: string | null;
  focusNodeId: string | null;
  focusHistory: string[];
  focusHistoryIndex: number;
}

export interface SavedGraphView {
  name: string;
  focusPath: string;
  mode: GraphMode;
  density: DensityPreset;
  pinnedNodeIds: string[];
  hiddenNodeIds: string[];
  zoom?: number;
  center?: { x: number; y: number };
}

export interface SmartGraphSettings {
  candidateLimit: number;
  visibleNodeLimit: number;
  focusSimilarityThreshold: number;
  clusterSimilarityThreshold: number;
  maxSemanticEdgesPerNode: number;
  maxCrossClusterEdgesPerPair: number;
  minimumClusterSize: number;
  maximumClusterCount: number;
  clusterSpacing: number;
  hullPadding: number;
  hullOpacity: number;
  defaultZoomLevel: number;
  clusterColors: string[];
  showSemanticLinks: boolean;
  showWikiLinks: boolean;
  showBacklinks: boolean;
  showSharedTags: boolean;
  followActiveNote: boolean;
  graphMode: GraphMode;
  densityPreset: DensityPreset;
  licenseKey: string;
  isLicensed: boolean;
}

export const CLUSTER_MUTED_PALETTE = [
  '#55B476', // Emerald Green
  '#EB9433', // Bright Orange
  '#D962B2', // Vivid Pink
  '#5E8FE8', // Bright Royal Blue
  '#EB6070', // Vivid Coral Red
  '#73B9B3', // Crisp Teal
];

export const DEFAULT_SETTINGS: SmartGraphSettings = {
  candidateLimit: 80,
  visibleNodeLimit: 60,
  focusSimilarityThreshold: 0.42,
  clusterSimilarityThreshold: 0.52,
  maxSemanticEdgesPerNode: 2,
  maxCrossClusterEdgesPerPair: 1,
  minimumClusterSize: 3,
  maximumClusterCount: 5,
  clusterSpacing: 140,
  hullPadding: 10,
  hullOpacity: 0.035,
  defaultZoomLevel: 2.8,
  clusterColors: CLUSTER_MUTED_PALETTE,
  showSemanticLinks: true,
  showWikiLinks: true,
  showBacklinks: true,
  showSharedTags: true,
  followActiveNote: false,
  graphMode: 'neighborhood',
  densityPreset: 'balanced',
  licenseKey: '',
  isLicensed: false,
};

export interface SmartSource {
  find_similar?: (topK: number) => Promise<unknown>;
}

export interface SmartSources {
  get?: (key: string) => SmartSource | undefined;
  [key: string]: unknown;
}

export interface SmartEnv {
  smart_sources?: SmartSources;
  [key: string]: unknown;
}

export interface SmartConnectionsPlugin {
  env?: SmartEnv;
  smart_env?: SmartEnv;
  api?: {
    search?: (query: string, options?: Record<string, unknown>) => Promise<unknown[]>;
    get_nearest?: (filePath: string, topK?: number) => Promise<unknown[]>;
  };
}
