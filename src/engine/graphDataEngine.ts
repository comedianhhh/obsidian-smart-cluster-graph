import { App, TFile } from 'obsidian';
import { SmartConnectionsBridge, SemanticNeighbor } from '../bridge/smartConnectionsBridge';
import { GraphNode, GraphEdge, SmartGraphSettings, DensityPreset } from '../types';


export class GraphDataEngine {
  private app: App;
  private bridge: SmartConnectionsBridge;

  constructor(app: App, bridge: SmartConnectionsBridge) {
    this.app = app;
    this.bridge = bridge;
  }

  /**
   * Resolve density preset into concrete limits.
   */
  private getDensityLimits(preset: DensityPreset): { maxNodes: number; maxEdgesPerNode: number } {
    switch (preset) {
      case 'compact':
        return { maxNodes: 20, maxEdgesPerNode: 2 };
      case 'expanded':
        return { maxNodes: 100, maxEdgesPerNode: 6 };
      case 'balanced':
      default:
        return { maxNodes: 50, maxEdgesPerNode: 4 };
    }
  }

  /**
   * Build complete multi-cluster candidate graph around focus note file and vault notes.
   */
  public async buildGraphData(
    centerFile: TFile | null,
    settings: SmartGraphSettings
  ): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }> {
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const candidateMap = new Map<string, SemanticNeighbor>();

    const focusPath = centerFile ? centerFile.path : '';
    const densityLimits = this.getDensityLimits(settings.densityPreset || 'balanced');
    const nodeLimit = Math.min(settings.visibleNodeLimit, densityLimits.maxNodes);

    // 1. Add Central Focus Note if available
    if (centerFile) {
      candidateMap.set(focusPath, {
        path: focusPath,
        score: 1.0,
        title: centerFile.basename,
      });
    }

    // 2. Fetch Semantic Neighbors via Smart Connections
    if (centerFile && this.bridge.isSmartConnectionsAvailable() && settings.graphMode !== 'links') {
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

    // 3. Backfill with Vault Markdown Files up to nodeLimit
    const allVaultFiles = this.app.vault.getMarkdownFiles();
    allVaultFiles.forEach((file) => {
      if (candidateMap.size < nodeLimit && !candidateMap.has(file.path)) {
        candidateMap.set(file.path, {
          path: file.path,
          score: file.path === focusPath ? 1.0 : 0.5,
          title: file.basename,
        });
      }
    });

    // Convert candidateMap into GraphNodes
    const candidateList = Array.from(candidateMap.values());
    candidateList.forEach((cand) => {
      const isFocus = cand.path === focusPath;
      const node: GraphNode = {
        id: cand.path,
        title: cand.title || cand.path.split('/').pop()?.replace('.md', '') || cand.path,
        path: cand.path,
        clusterId: 'cluster-0',
        cluster: 'cluster-0',
        clusterColor: '#59a978',
        size: isFocus ? 7 : 4,
        color: '#59a978',
        type: isFocus ? 'cluster-center' : 'note',
        depth: isFocus ? 0 : 1,
        similarity: cand.score,
        isFocus,
        isRepresentative: false,
      };
      nodes.push(node);
    });

    // Map file paths to tags for shared-tag edge detection
    const fileTagsMap = new Map<string, Set<string>>();
    allVaultFiles.forEach((file) => {
      const cache = this.app.metadataCache.getFileCache(file);
      const tagSet = new Set<string>();
      if (cache?.tags) {
        cache.tags.forEach((t) => tagSet.add(t.tag.toLowerCase()));
      }
      if (cache?.frontmatter?.tags) {
        const fmTags = Array.isArray(cache.frontmatter.tags)
          ? cache.frontmatter.tags
          : [cache.frontmatter.tags];
        fmTags.forEach((t: string) => tagSet.add(String(t).toLowerCase()));
      }
      fileTagsMap.set(file.path, tagSet);
    });

    // Read Obsidian's resolvedLinks graph
    const resolvedLinks = this.app.metadataCache.resolvedLinks || {};

    // 4. Compute Edges based on GraphMode & limits
    const edgeKeySet = new Set<string>();
    const nodeEdgeCounts = new Map<string, number>();
    const mode = settings.graphMode || 'neighborhood';

    for (let i = 0; i < candidateList.length; i++) {
      for (let j = i + 1; j < candidateList.length; j++) {
        const candA = candidateList[i];
        const candB = candidateList[j];

        const countA = nodeEdgeCounts.get(candA.path) || 0;
        const countB = nodeEdgeCounts.get(candB.path) || 0;

        if (countA >= densityLimits.maxEdgesPerNode && countB >= densityLimits.maxEdgesPerNode) {
          continue;
        }

        const key = candA.path < candB.path ? `${candA.path}|${candB.path}` : `${candB.path}|${candA.path}`;
        if (edgeKeySet.has(key)) continue;

        let isWikiLink = false;
        let isSharedTag = false;
        let semanticScore = 0;

        // Check WikiLinks / Backlinks
        if (mode === 'neighborhood' || mode === 'links') {
          if (
            (resolvedLinks[candA.path] && resolvedLinks[candA.path][candB.path]) ||
            (resolvedLinks[candB.path] && resolvedLinks[candB.path][candA.path])
          ) {
            isWikiLink = true;
          }
        }

        // Check Shared Tags
        if (mode === 'neighborhood') {
          const tagsA = fileTagsMap.get(candA.path);
          const tagsB = fileTagsMap.get(candB.path);
          if (tagsA && tagsB) {
            for (const tag of tagsA) {
              if (tagsB.has(tag)) {
                isSharedTag = true;
                break;
              }
            }
          }
        }

        // Check Pairwise Semantic Similarity
        if ((mode === 'neighborhood' || mode === 'semantic') && this.bridge.isSmartConnectionsAvailable()) {
          semanticScore = await this.bridge.getPairwiseSimilarity(candA, candB);
        }

        let edgeType: 'wiki-link' | 'shared-tag' | 'semantic' | null = null;
        let weight = 0;

        if (isWikiLink) {
          edgeType = 'wiki-link';
          weight = 0.85;
        } else if (isSharedTag) {
          edgeType = 'shared-tag';
          weight = 0.65;
        } else if (semanticScore >= settings.clusterSimilarityThreshold) {
          edgeType = 'semantic';
          weight = semanticScore;
        } else if (candA.path === focusPath || candB.path === focusPath) {
          if (semanticScore >= settings.focusSimilarityThreshold) {
            edgeType = 'semantic';
            weight = semanticScore;
          }
        }

        if (edgeType) {
          edgeKeySet.add(key);
          nodeEdgeCounts.set(candA.path, countA + 1);
          nodeEdgeCounts.set(candB.path, countB + 1);

          edges.push({
            source: candA.path,
            target: candB.path,
            type: edgeType,
            weight,
            dashed: edgeType === 'shared-tag',
            opacity: edgeType === 'wiki-link' ? 0.4 : 0.25,
          });
        }
      }
    }

    return { nodes, edges };
  }
}
