export type NodeType = 'root' | 'note' | 'cluster';

export type EdgeType = 'semantic' | 'wiki-link' | 'backlink' | 'shared-tag';

export interface GraphNode {
  id: string; // file path or unique key
  title: string;
  path: string;
  cluster: string;
  size: number;
  color: string;
  type: NodeType;
  depth: number;
  score?: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
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
  hullPoints?: [number, number][];
}

export interface SmartGraphSettings {
  similarityThreshold: number;
  maxNeighborsDepth: number;
  maxNodesLimit: number;
  showSemanticLinks: boolean;
  showWikiLinks: boolean;
  showBacklinks: boolean;
  showSharedTags: boolean;
  clusterHullsOpacity: number;
  clusterColors: string[];
  licenseKey: string;
  isLicensed: boolean;
}

export const DEFAULT_SETTINGS: SmartGraphSettings = {
  similarityThreshold: 0.75,
  maxNeighborsDepth: 2,
  maxNodesLimit: 150,
  showSemanticLinks: true,
  showWikiLinks: true,
  showBacklinks: true,
  showSharedTags: true,
  clusterHullsOpacity: 0.15,
  clusterColors: [
    '#2ecc71', // Green
    '#f1c40f', // Yellow
    '#3498db', // Blue
    '#ff6b9d', // Pink
    '#e056fd', // Purple
    '#1abc9c', // Teal
    '#e67e22', // Orange
  ],
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
