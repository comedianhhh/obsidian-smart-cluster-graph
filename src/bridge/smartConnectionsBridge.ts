import { App } from 'obsidian';
import { SmartConnectionsPlugin, SmartSource } from '../types';

export interface SemanticNeighbor {
  path: string;
  score: number;
  title: string;
  vec?: number[];
}

interface SmartConnectionsItem {
  path?: string;
  key?: string;
  name?: string;
  vec?: number[];
}

interface SmartConnectionsResult {
  item?: SmartConnectionsItem;
  path?: string;
  key?: string;
  name?: string;
  score?: number;
  similarity?: number;
  title?: string;
  vec?: number[];
}

interface ObsidianPluginManager {
  getPlugin(id: string): SmartConnectionsPlugin | null;
}

export class SmartConnectionsBridge {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  public isSmartConnectionsAvailable(): boolean {
    const plugins = (this.app as unknown as { plugins?: ObsidianPluginManager }).plugins;
    if (!plugins) return false;
    return !!plugins.getPlugin('smart-connections');
  }

  public getPluginInstance(): SmartConnectionsPlugin | null {
    const plugins = (this.app as unknown as { plugins?: ObsidianPluginManager }).plugins;
    if (!plugins) return null;
    return plugins.getPlugin('smart-connections') || null;
  }

  /**
   * Fetch similar notes for a target note path up to topK candidates.
   */
  public async getSimilarSources(filePath: string, topK: number = 80): Promise<SemanticNeighbor[]> {
    const sc = this.getPluginInstance();
    if (!sc) return [];

    try {
      const env = sc.smart_env || sc.env;
      if (env && env.smart_sources) {
        const smartSources = env.smart_sources;
        const source = (
          typeof smartSources.get === 'function'
            ? smartSources.get(filePath)
            : (smartSources as Record<string, unknown>)[filePath]
        ) as SmartSource | undefined;

        if (source && typeof source.find_similar === 'function') {
          const rawResults = await source.find_similar(topK);
          if (Array.isArray(rawResults)) {
            const results = rawResults as SmartConnectionsResult[];
            return results
              .map((r: SmartConnectionsResult) => ({
                path: r.item?.path || r.path || r.key || '',
                score: r.score || r.similarity || 0,
                title: r.item?.name || r.name || (r.path ? r.path.split('/').pop()?.replace('.md', '') : '') || '',
                vec: r.item?.vec || r.vec || undefined,
              }))
              .filter((n) => n.path && n.path !== filePath);
          }
        }
      }

      if (sc.api?.get_nearest) {
        const rawResults = await sc.api.get_nearest(filePath, topK);
        if (Array.isArray(rawResults)) {
          const results = rawResults as SmartConnectionsResult[];
          return results
            .map((r: SmartConnectionsResult) => ({
              path: r.path || '',
              score: r.score || 0,
              title: r.title || (r.path ? r.path.split('/').pop()?.replace('.md', '') : '') || '',
              vec: r.vec || undefined,
            }))
            .filter((n) => n.path && n.path !== filePath);
        }
      }
    } catch (err) {
      console.warn('[SmartGraph] Error in getSimilarSources:', err);
    }

    return [];
  }


  /**
   * Compute pairwise similarity score between two files.
   */
  public async getPairwiseSimilarity(fileA: SemanticNeighbor, fileB: SemanticNeighbor): Promise<number> {
    if (fileA.vec && fileB.vec && fileA.vec.length === fileB.vec.length) {
      return this.cosineSimilarity(fileA.vec, fileB.vec);
    }

    // Heuristic fallbacks if vectors are missing: shared links/path similarity
    if (fileA.path === fileB.path) return 1.0;
    
    // Shared directory path score
    const pathA = fileA.path.split('/');
    const pathB = fileB.path.split('/');
    if (pathA.length > 1 && pathB.length > 1 && pathA[0] === pathB[0]) {
      return 0.55;
    }

    return 0.0;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
