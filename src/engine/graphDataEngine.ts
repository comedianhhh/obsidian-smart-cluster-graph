import { App, TFile } from 'obsidian';
import { SmartConnectionsBridge } from '../bridge/smartConnectionsBridge';
import { GraphNode, GraphEdge, SmartGraphSettings } from '../types';

export class GraphDataEngine {
  private app: App;
  private bridge: SmartConnectionsBridge;

  constructor(app: App, bridge: SmartConnectionsBridge) {
    this.app = app;
    this.bridge = bridge;
  }

  /**
   * Build complete graph data centered around target note file.
   */
  public async buildGraphData(
    centerFile: TFile | null,
    settings: SmartGraphSettings
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    if (!centerFile) {
      // Fallback: load vault files if no active center note
      const files = this.app.vault.getMarkdownFiles().slice(0, settings.maxNodesLimit);
      files.forEach((file) => {
        const node: GraphNode = {
          id: file.path,
          title: file.basename,
          path: file.path,
          cluster: 'cluster-0',
          size: 6,
          color: '#ffffff',
          type: 'note',
          depth: 1,
        };
        nodes.push(node);
        nodeMap.set(file.path, node);
      });
      return { nodes, edges };
    }

    // 1. Add Central Root Node
    const rootNode: GraphNode = {
      id: centerFile.path,
      title: centerFile.basename,
      path: centerFile.path,
      cluster: 'cluster-root',
      size: 14,
      color: '#ffffff',
      type: 'root',
      depth: 0,
      score: 1.0,
    };

    nodes.push(rootNode);
    nodeMap.set(centerFile.path, rootNode);

    // 2. Fetch Semantic Neighbors via Smart Connections Bridge
    if (settings.showSemanticLinks && this.bridge.isSmartConnectionsAvailable()) {
      const neighbors = await this.bridge.getSemanticNeighbors(
        centerFile.path,
        settings.maxNodesLimit,
        settings.similarityThreshold
      );

      neighbors.forEach((nbr) => {
        if (!nodeMap.has(nbr.path)) {
          const node: GraphNode = {
            id: nbr.path,
            title: nbr.title || nbr.path.split('/').pop()?.replace('.md', '') || nbr.path,
            path: nbr.path,
            cluster: 'cluster-0',
            size: Math.max(4, Math.round(nbr.score * 10)),
            color: '#3498db',
            type: 'note',
            depth: 1,
            score: nbr.score,
          };
          nodes.push(node);
          nodeMap.set(nbr.path, node);
        }

        // Add Semantic Edge (Solid line)
        edges.push({
          source: centerFile.path,
          target: nbr.path,
          type: 'semantic',
          weight: nbr.score,
          dashed: false,
          opacity: Math.max(0.2, nbr.score),
        });
      });
    }

    // 3. Extract Wiki-links & Backlinks from MetadataCache
    const cache = this.app.metadataCache.getFileCache(centerFile);
    if (cache && cache.links && settings.showWikiLinks) {
      cache.links.forEach((link) => {
        const destFile = this.app.metadataCache.getFirstLinkpathDest(link.link, centerFile.path);
        if (destFile && !nodeMap.has(destFile.path)) {
          const node: GraphNode = {
            id: destFile.path,
            title: destFile.basename,
            path: destFile.path,
            cluster: 'cluster-0',
            size: 6,
            color: '#2ecc71',
            type: 'note',
            depth: 1,
          };
          nodes.push(node);
          nodeMap.set(destFile.path, node);

          // Add Wiki Link Edge (Dashed line)
          edges.push({
            source: centerFile.path,
            target: destFile.path,
            type: 'wiki-link',
            weight: 0.8,
            dashed: true,
            opacity: 0.6,
          });
        }
      });
    }

    return { nodes, edges };
  }
}
