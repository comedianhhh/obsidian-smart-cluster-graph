import { GraphNode, GraphEdge, ClusterGroup } from '../types';

export interface CommunityResult {
  nodes: GraphNode[];
  clusters: Map<string, ClusterGroup>;
}

export class CommunityDetector {
  /**
   * Run folder-based and connectivity-based community detection.
   * Limits max visible clusters to 5 and assigns unique sequential palette colors.
   */
  public detectCommunities(
    nodes: GraphNode[],
    edges: GraphEdge[],
    colorPalette: string[],
    minimumClusterSize: number = 3
  ): CommunityResult {
    if (nodes.length === 0) {
      return { nodes: [], clusters: new Map() };
    }

    // 1. Group nodes by Folder Path if available
    const folderMap = new Map<string, GraphNode[]>();

    nodes.forEach((node) => {
      const parts = node.path.split('/');
      const folderName = parts.length > 1 ? parts[0] : (node.isFocus ? 'Focus Topic' : 'Uncategorized');

      if (!folderMap.has(folderName)) {
        folderMap.set(folderName, []);
      }
      folderMap.get(folderName)!.push(node);
    });

    // Sort folders by size (largest first, with focus folder prioritized)
    const sortedFolders = Array.from(folderMap.entries()).sort(([f1, n1], [f2, n2]) => {
      const hasFocus1 = n1.some((n) => n.isFocus);
      const hasFocus2 = n2.some((n) => n.isFocus);
      if (hasFocus1 !== hasFocus2) return hasFocus1 ? -1 : 1;
      return n2.length - n1.length;
    });

    // Limit to max 5 visible primary clusters
    const primaryFolders = sortedFolders.slice(0, 5);

    const clusters = new Map<string, ClusterGroup>();

    primaryFolders.forEach(([folderName, cNodes], folderIndex) => {
      // Guarantee distinct sequential palette colors for all 5 clusters (no hash collision!)
      const color = colorPalette[folderIndex % colorPalette.length];

      // Internal edges
      const internalEdges = edges.filter((e) => {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        return cNodes.some((n) => n.id === s) && cNodes.some((n) => n.id === t);
      });

      // Representative node selection
      let representativeNode = cNodes[0];
      let maxScore = -1;

      cNodes.forEach((node) => {
        const degree = internalEdges.filter(
          (e) => (typeof e.source === 'object' ? e.source.id : e.source) === node.id ||
                 (typeof e.target === 'object' ? e.target.id : e.target) === node.id
        ).length;

        const score = degree * 0.6 + (node.similarity || 0) * 0.4 + (node.isFocus ? 1.0 : 0);
        if (score > maxScore) {
          maxScore = score;
          representativeNode = node;
        }
      });

      // Size Hierarchy according to user spec:
      // Normal node = 4.5px, Representative / Focus = 8.0px
      const connectedClusterNodes: GraphNode[] = [];

      cNodes.forEach((node) => {
        const degreeInCluster = internalEdges.filter(
          (e) => (typeof e.source === 'object' ? e.source.id : e.source) === node.id ||
                 (typeof e.target === 'object' ? e.target.id : e.target) === node.id
        ).length;

        // If a node has no internal edges in this cluster and is not focus/representative, isolate it
        const isIsolatedInFolder = degreeInCluster === 0 && !node.isFocus && cNodes.length > 1;

        if (isIsolatedInFolder) {
          const isolatedClusterId = `isolated-${node.id}`;
          node.clusterId = isolatedClusterId;
          node.cluster = isolatedClusterId;
          node.clusterColor = color;
          node.color = color;
          node.isRepresentative = false;
          node.type = 'note';
          node.size = 3.5;
          node.isOrphan = false;
          
          clusters.set(isolatedClusterId, {
            id: isolatedClusterId,
            name: node.title,
            color,
            nodes: [node],
            representativeId: node.id,
          });
        } else {
          node.clusterId = folderName;
          node.cluster = folderName;
          node.clusterColor = color;
          node.color = color;
          node.isRepresentative = node.id === representativeNode.id && !node.isFocus;
          node.type = node.isFocus || node.isRepresentative ? 'cluster-center' : 'note';

          if (node.isFocus || node.isRepresentative) {
            node.size = 8.0;
            node.isOrphan = false;
          } else if (cNodes.length < minimumClusterSize && !node.isFocus) {
            node.isOrphan = true;
            node.size = 2.5;
            node.opacity = 0.25;
          } else {
            node.size = 4.5;
            node.isOrphan = false;
          }
          connectedClusterNodes.push(node);
        }
      });

      if (connectedClusterNodes.length > 0) {
        clusters.set(folderName, {
          id: folderName,
          name: representativeNode ? representativeNode.title : folderName,
          color,
          nodes: connectedClusterNodes,
          representativeId: representativeNode ? representativeNode.id : undefined,
        });
      }
    });

    // Handle nodes outside top 5 clusters as background orphan nodes
    const primaryFolderNames = new Set(primaryFolders.map(([f]) => f));
    nodes.forEach((node) => {
      if (!node.clusterId || (!primaryFolderNames.has(node.clusterId) && !node.clusterId.startsWith('isolated-'))) {
        node.isOrphan = true;
        node.size = 2.5;
        node.opacity = 0.25;
      }
    });

    return { nodes, clusters };
  }
}
