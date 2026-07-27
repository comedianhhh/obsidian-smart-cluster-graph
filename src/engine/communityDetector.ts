import { GraphNode, GraphEdge, ClusterGroup } from '../types';

export class CommunityDetector {
  /**
   * Run Louvain community detection or partition algorithm on nodes and edges.
   */
  public detectCommunities(
    nodes: GraphNode[],
    edges: GraphEdge[],
    colorPalette: string[]
  ): { nodes: GraphNode[]; clusters: Map<string, ClusterGroup> } {
    if (nodes.length === 0) {
      return { nodes: [], clusters: new Map() };
    }

    // 1. Build adjacency list for community detection
    const nodeMap = new Map<string, GraphNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    const nodeIds = nodes.map((n) => n.id);
    const matrix: { [key: string]: { [key: string]: number } } = {};
    nodeIds.forEach((id) => (matrix[id] = {}));

    edges.forEach((edge) => {
      const srcId = typeof edge.source === 'object' ? (edge.source as GraphNode).id : edge.source;
      const tgtId = typeof edge.target === 'object' ? (edge.target as GraphNode).id : edge.target;
      if (matrix[srcId] && matrix[tgtId]) {
        matrix[srcId][tgtId] = (matrix[srcId][tgtId] || 0) + edge.weight;
        matrix[tgtId][srcId] = (matrix[tgtId][srcId] || 0) + edge.weight;
      }
    });

    // 2. Simple modularity partition / cluster assignment algorithm
    const communityAssignments = new Map<string, string>();
    let clusterIndex = 0;

    // Group connected components or assign cluster ID
    const visited = new Set<string>();

    nodeIds.forEach((startId) => {
      if (visited.has(startId)) return;

      const clusterId = `cluster-${clusterIndex % colorPalette.length}`;
      clusterIndex++;

      const queue = [startId];
      visited.add(startId);

      while (queue.length > 0) {
        const current = queue.shift()!;
        communityAssignments.set(current, clusterId);

        const neighbors = matrix[current] ? Object.keys(matrix[current]) : [];
        neighbors.forEach((nbr) => {
          if (!visited.has(nbr)) {
            visited.add(nbr);
            queue.push(nbr);
          }
        });
      }
    });

    // 3. Update nodes with cluster ID and color
    const clusters = new Map<string, ClusterGroup>();

    nodes.forEach((node) => {
      const cId = communityAssignments.get(node.id) || 'cluster-0';
      const cIdx = parseInt(cId.split('-')[1] || '0', 10);
      const color = colorPalette[cIdx % colorPalette.length];

      node.cluster = cId;
      node.color = color;

      if (!clusters.has(cId)) {
        clusters.set(cId, {
          id: cId,
          name: `Cluster ${cIdx + 1}`,
          color,
          nodes: [],
        });
      }

      clusters.get(cId)!.nodes.push(node);
    });

    return { nodes, clusters };
  }
}
