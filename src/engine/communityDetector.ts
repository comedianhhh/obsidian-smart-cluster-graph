import { GraphNode, GraphEdge, ClusterGroup } from '../types';

export interface CommunityResult {
  nodes: GraphNode[];
  clusters: Map<string, ClusterGroup>;
}

export class CommunityDetector {
  /**
   * Run community partition algorithm, select representatives, and map colors.
   */
  public detectCommunities(
    nodes: GraphNode[],
    edges: GraphEdge[],
    colorPalette: string[],
    minimumClusterSize: number = 2
  ): CommunityResult {
    if (nodes.length === 0) {
      return { nodes: [], clusters: new Map() };
    }

    const nodeMap = new Map<string, GraphNode>();
    nodes.forEach((n) => nodeMap.set(n.id, n));

    // 1. Build adjacency matrix & degree maps
    const adjMap = new Map<string, Map<string, number>>();
    nodes.forEach((n) => adjMap.set(n.id, new Map()));

    edges.forEach((edge) => {
      const srcId = typeof edge.source === 'object' ? (edge.source as GraphNode).id : edge.source;
      const tgtId = typeof edge.target === 'object' ? (edge.target as GraphNode).id : edge.target;

      if (adjMap.has(srcId) && adjMap.has(tgtId)) {
        adjMap.get(srcId)!.set(tgtId, (adjMap.get(srcId)!.get(tgtId) || 0) + edge.weight);
        adjMap.get(tgtId)!.set(srcId, (adjMap.get(tgtId)!.get(srcId) || 0) + edge.weight);
      }
    });

    // 2. Modularity & Connected Component Partition
    const visited = new Set<string>();
    const communityAssignments = new Map<string, string>();
    let clusterIndex = 0;

    // Prioritize focus node to form cluster-0 at the center
    const sortedNodes = [...nodes].sort((a, b) => (b.isFocus ? 1 : 0) - (a.isFocus ? 1 : 0));

    sortedNodes.forEach((startNode) => {
      if (visited.has(startNode.id)) return;

      const clusterId = `cluster-${clusterIndex}`;
      clusterIndex++;

      const queue = [startNode.id];
      visited.add(startNode.id);

      while (queue.length > 0) {
        const currId = queue.shift()!;
        communityAssignments.set(currId, clusterId);

        const neighbors = adjMap.get(currId);
        if (neighbors) {
          neighbors.forEach((weight, nbrId) => {
            if (!visited.has(nbrId) && weight >= 0.3) {
              visited.add(nbrId);
              queue.push(nbrId);
            }
          });
        }
      }
    });

    // 3. Group nodes by community ID
    const tempClusters = new Map<string, GraphNode[]>();
    nodes.forEach((node) => {
      const cId = communityAssignments.get(node.id) || 'cluster-0';
      if (!tempClusters.has(cId)) tempClusters.set(cId, []);
      tempClusters.get(cId)!.push(node);
    });

    // 4. Merge tiny clusters (< minimumClusterSize) into nearest larger cluster
    const clusters = new Map<string, ClusterGroup>();
    let finalClusterIndex = 0;

    tempClusters.forEach((cNodes, cId) => {
      const color = colorPalette[finalClusterIndex % colorPalette.length];
      finalClusterIndex++;

      // Compute internal degrees for representative selection
      const internalEdges = edges.filter((e) => {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        return cNodes.some((n) => n.id === s) && cNodes.some((n) => n.id === t);
      });

      // Find representative node: score = internalDegree * 0.6 + similarity * 0.4
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

      // Apply node metadata & properties
      cNodes.forEach((node) => {
        node.clusterId = cId;
        node.cluster = cId;
        node.color = color;
        node.isRepresentative = node.id === representativeNode.id && !node.isFocus;
        node.type = node.isFocus || node.isRepresentative ? 'cluster-center' : 'note';

        // Size rules according to spec
        if (node.isFocus) node.size = 10;
        else if (node.isRepresentative) node.size = 8;
        else node.size = 4;
      });

      clusters.set(cId, {
        id: cId,
        name: representativeNode ? representativeNode.title : `Cluster ${cId}`,
        color,
        nodes: cNodes,
        representativeId: representativeNode ? representativeNode.id : undefined,
      });
    });

    return { nodes, clusters };
  }
}
