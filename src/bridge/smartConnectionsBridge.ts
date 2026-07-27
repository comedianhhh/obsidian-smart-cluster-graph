import { App } from 'obsidian';
import { SmartConnectionsPlugin } from '../types';

export interface SemanticNeighbor {
  path: string;
  score: number;
  title: string;
  vec?: number[];
}

export class SmartConnectionsBridge {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  public isSmartConnectionsAvailable(): boolean {
    const plugins = (this.app as any).plugins;
    if (!plugins) return false;
    return !!plugins.getPlugin('smart-connections');
  }

  public getPluginInstance(): SmartConnectionsPlugin | null {
    const plugins = (this.app as any).plugins;
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
        const source = env.smart_sources.get ? env.smart_sources.get(filePath) : env.smart_sources[filePath];
        if (source && typeof source.find_similar === 'function') {
          const results = await source.find_similar(topK);
          if (Array.isArray(results)) {
            return results
              .map((r: any) => ({
                path: r.item?.path || r.path || r.key || '',
                score: r.score || r.similarity || 0,
                title: r.item?.name || r.name || (r.path ? r.path.split('/').pop()?.replace('.md', '') : ''),
                vec: r.item?.vec || r.vec || undefined,
              }))
              .filter((n) => n.path && n.path !== filePath);
          }
        }
      }

      if (sc.api?.get_nearest) {
        const results = await sc.api.get_nearest(filePath, topK);
        return (results || [])
          .map((r: any) => ({
            path: r.path || '',
            score: r.score || 0,
            title: r.title || r.path?.split('/').pop()?.replace('.md', '') || '',
            vec: r.vec || undefined,
          }))
          .filter((n) => n.path && n.path !== filePath);
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
