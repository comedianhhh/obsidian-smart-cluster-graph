import { App } from 'obsidian';
import { SmartConnectionsPlugin } from '../types';

export interface SemanticNeighbor {
  path: string;
  score: number;
  title: string;
}

export class SmartConnectionsBridge {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * Checks if Smart Connections plugin is installed and enabled in Obsidian.
   */
  public isSmartConnectionsAvailable(): boolean {
    const plugins = (this.app as any).plugins;
    if (!plugins) return false;
    const sc = plugins.getPlugin('smart-connections');
    return !!sc;
  }

  /**
   * Gets the instance of Smart Connections plugin if loaded.
   */
  public getPluginInstance(): SmartConnectionsPlugin | null {
    const plugins = (this.app as any).plugins;
    if (!plugins) return null;
    return plugins.getPlugin('smart-connections') || null;
  }

  /**
   * Fetch semantically similar files for a given active note path.
   */
  public async getSemanticNeighbors(filePath: string, topK: number = 10, threshold: number = 0.7): Promise<SemanticNeighbor[]> {
    const sc = this.getPluginInstance();
    if (!sc) return [];

    try {
      // 1. Try smart_env / env API if available
      const env = sc.smart_env || sc.env;
      if (env && env.smart_sources) {
        const sourceKey = filePath;
        const source = env.smart_sources.get ? env.smart_sources.get(sourceKey) : env.smart_sources[sourceKey];
        if (source && typeof source.find_similar === 'function') {
          const results = await source.find_similar(topK);
          if (Array.isArray(results)) {
            return results
              .map((r: any) => ({
                path: r.item?.path || r.path || r.key || '',
                score: r.score || r.similarity || 0,
                title: r.item?.name || r.name || (r.path ? r.path.split('/').pop()?.replace('.md', '') : ''),
              }))
              .filter((n) => n.path && n.score >= threshold && n.path !== filePath);
          }
        }
      }

      // 2. Try generic search/nearest API fallback
      if (sc.api?.get_nearest) {
        const results = await sc.api.get_nearest(filePath, topK);
        return (results || [])
          .map((r: any) => ({
            path: r.path || '',
            score: r.score || 0,
            title: r.title || r.path?.split('/').pop()?.replace('.md', '') || '',
          }))
          .filter((n) => n.path && n.score >= threshold && n.path !== filePath);
      }
    } catch (err) {
      console.warn('[SmartGraph] Error fetching semantic neighbors from Smart Connections:', err);
    }

    return [];
  }
}
