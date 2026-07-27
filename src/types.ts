export type NodeType = 'cluster-center' | 'note';

export type EdgeType = 'semantic' | 'wiki-link' | 'backlink' | 'shared-tag' | 'cluster-link';

export interface GraphNode {
  id: string; // file path or unique key
  title: string;
  path: string;
  clusterId: string;
  cluster: string; // legacy alias
  size: number;
  color: string;
  type: NodeType;
  depth: number;
  similarity: number;
  score?: number;
  isFocus: boolean;
  isRepresentative: boolean;
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
  clusterColors: string[];
  showSemanticLinks: boolean;
  showWikiLinks: boolean;
  showBacklinks: boolean;
  showSharedTags: boolean;
  licenseKey: string;
  isLicensed: boolean;
}

export const DEFAULT_SETTINGS: SmartGraphSettings = {
  candidateLimit: 80,
  visibleNodeLimit: 60,
  focusSimilarityThreshold: 0.42,
  clusterSimilarityThreshold: 0.52,
  maxSemanticEdgesPerNode: 4,
  maxCrossClusterEdgesPerPair: 1,
  minimumClusterSize: 2,
  maximumClusterCount: 12,
  clusterSpacing: 180,
  hullPadding: 14,
  hullOpacity: 0.07,
  clusterColors: [
    '#58B77B', // Soft Emerald Green
    '#E3B529', // Golden Yellow
    '#5889E8', // Royal Blue
    '#DE6372', // Coral Pink
    '#D86DC0', // Soft Orchid Purple
    '#36C5F0', // Sky Blue
    '#ECB22E', // Amber
  ],
  showSemanticLinks: true,
  showWikiLinks: true,
  showBacklinks: true,
  showSharedTags: true,
  licenseKey: '',
  isLicensed: false,
};

export interface SmartConnectionsPlugin {
  env?: any;
  smart_env?: any;
  api?: {
    search?: (query: string, options?: any) => Promise<any[]>;
    get_nearest?: (filePath: string, topK?: number) => Promise<any[]>;
  };
}
