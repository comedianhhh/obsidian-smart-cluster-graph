import { App, TFile } from 'obsidian';
import { SmartConnectionsBridge, SemanticNeighbor } from '../bridge/smartConnectionsBridge';
import { GraphNode, GraphEdge, SmartGraphSettings } from '../types';

export class GraphDataEngine {
  private app: App;
  private bridge: SmartConnectionsBridge;

  constructor(app: App, bridge: SmartConnectionsBridge) {
    this.app = app;
    this.bridge = bridge;
  }

  /**
   * Build multi-cluster candidate graph around focus note file.
   */
  public async buildGraphData(
    centerFile: TFile | null,
    settings: SmartGraphSettings
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const candidateMap = new Map<string, SemanticNeighbor>();

    if (!centerFile) {
      // Vault fallback if no active note
      const files = this.app.vault.getMarkdownFiles().slice(0, settings.visibleNodeLimit);
      files.forEach((file, idx) => {
        nodes.push({
          id: file.path,
          title: file.basename,
          path: file.path,
          clusterId: `cluster-${idx % 5}`,
          cluster: `cluster-${idx % 5}`,
          size: 4,
          color: settings.clusterColors[idx % settings.clusterColors.length],
          type: 'note',
          depth: 1,
          similarity: 0.5,
          isFocus: idx === 0,
          isRepresentative: false,
        });
      });
      return { nodes, edges };
    }

    // 1. Add Central Focus Note
    const focusPath = centerFile.path;
    candidateMap.set(focusPath, {
      path: focusPath,
      score: 1.0,
      title: centerFile.basename,
    });

    // 2. Step 1: Collect 60-80 candidate notes via Smart Connections
    if (this.bridge.isSmartConnectionsAvailable()) {
      const candidates = await this.bridge.getSimilarSources(
        focusPath,
        settings.candidateLimit
      );

      candidates.forEach((cand) => {
        if (cand.score >= settings.focusSimilarityThreshold && !candidateMap.has(cand.path)) {
          candidateMap.set(cand.path, cand);
        }
      });
    }

    // 3. Step 2: Merge Wiki-links & Backlinks
    const cache = this.app.metadataCache.getFileCache(centerFile);
    if (cache && cache.links && settings.showWikiLinks) {
      cache.links.forEach((link) => {
        const destFile = this.app.metadataCache.getFirstLinkpathDest(link.link, focusPath);
        if (destFile && !candidateMap.has(destFile.path)) {
          candidateMap.set(destFile.path, {
            path: destFile.path,
            score: 0.75,
            title: destFile.basename,
          });
        }
      });
    }

    // Convert candidateMap into GraphNodes (cap at visibleNodeLimit)
    const candidateList = Array.from(candidateMap.values()).slice(0, settings.visibleNodeLimit);

    candidateList.forEach((cand) => {
      const isFocus = cand.path === focusPath;
      const node: GraphNode = {
        id: cand.path,
        title: cand.title || cand.path.split('/').pop()?.replace('.md', '') || cand.path,
        path: cand.path,
        clusterId: 'cluster-0',
        cluster: 'cluster-0',
        size: isFocus ? 10 : 4,
        color: '#ffffff',
        type: isFocus ? 'cluster-center' : 'note',
        depth: isFocus ? 0 : 1,
        similarity: cand.score,
        isFocus,
        isRepresentative: false,
      };
      nodes.push(node);
    });

    // 4. Step 3: Compute Pairwise Similarities & Edges between all candidate nodes
    const edgeCountMap = new Map<string, number>();

    for (let i = 0; i < candidateList.length; i++) {
      for (let j = i + 1; j < candidateList.length; j++) {
        const candA = candidateList[i];
        const candB = candidateList[j];

        // Check semantic similarity or structural relationship
        const score = await this.bridge.getPairwiseSimilarity(candA, candB);

        if (score >= settings.clusterSimilarityThreshold || candA.path === focusPath || candB.path === focusPath) {
          const countA = edgeCountMap.get(candA.path) || 0;
          const countB = edgeCountMap.get(candB.path) || 0;

          if (countA < settings.maxSemanticEdgesPerNode && countB < settings.maxSemanticEdgesPerNode) {
            edgeCountMap.set(candA.path, countA + 1);
            edgeCountMap.set(candB.path, countB + 1);

            edges.push({
              source: candA.path,
              target: candB.path,
              type: 'semantic',
              weight: score || 0.6,
              dashed: false,
              opacity: Math.max(0.15, score),
            });
          }
        }
      }
    }

    return { nodes, edges };
  }
}
