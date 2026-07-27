import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import ForceGraph from 'force-graph';
import type SmartGraphPlugin from '../main';
import { GraphNode, GraphEdge, ClusterGroup } from '../types';
import { SmartConnectionsBridge } from '../bridge/smartConnectionsBridge';
import { GraphDataEngine } from '../engine/graphDataEngine';
import { CommunityDetector } from '../engine/communityDetector';
import { HullRenderer } from './hullRenderer';

export const SMART_GRAPH_VIEW_TYPE = 'smart-graph-explorer-view';

export class SmartGraphView extends ItemView {
  private plugin: SmartGraphPlugin;
  private bridge: SmartConnectionsBridge;
  private dataEngine: GraphDataEngine;
  private communityDetector: CommunityDetector;
  private hullRenderer: HullRenderer;

  private container: HTMLDivElement | null = null;
  private canvasWrapper: HTMLDivElement | null = null;
  private graphInstance: any = null;

  private currentNodes: GraphNode[] = [];
  private currentEdges: GraphEdge[] = [];
  private currentClusters: Map<string, ClusterGroup> = new Map();

  constructor(leaf: WorkspaceLeaf, plugin: SmartGraphPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.bridge = new SmartConnectionsBridge(this.app);
    this.dataEngine = new GraphDataEngine(this.app, this.bridge);
    this.communityDetector = new CommunityDetector();
    this.hullRenderer = new HullRenderer();
  }

  getViewType(): string {
    return SMART_GRAPH_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'Smart Graph Explorer';
  }

  getIcon(): string {
    return 'dot-network';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLDivElement;
    container.empty();
    container.addClass('smart-graph-view-container');

    this.container = container;

    // Header Toolbar
    const toolbar = container.createDiv({ cls: 'smart-graph-header-toolbar' });
    toolbar.createDiv({ cls: 'smart-graph-title', text: 'Smart Graph Explorer' });

    const scAvailable = this.bridge.isSmartConnectionsAvailable();
    const badge = toolbar.createDiv({
      cls: 'smart-graph-badge',
      text: scAvailable ? 'Smart Connections Linked' : 'Standalone Mode',
    });
    if (!scAvailable) {
      badge.style.background = '#e74c3c22';
      badge.style.color = '#e74c3c';
      badge.style.borderColor = '#e74c3c44';
    }

    if (!scAvailable) {
      const banner = container.createDiv({ cls: 'smart-graph-notice-banner' });
      banner.setText('Notice: obsidian-smart-connections is not active. Showing Vault links fallback.');
    }

    // Canvas Wrapper
    this.canvasWrapper = container.createDiv({ cls: 'smart-graph-canvas-wrapper' });

    // Initialize Force Graph
    this.initGraph();
    await this.refreshGraph();
  }

  private initGraph(): void {
    if (!this.canvasWrapper) return;

    this.graphInstance = ForceGraph()(this.canvasWrapper)
      .backgroundColor('#0f1115')
      .nodeId('id')
      .nodeLabel((node: any) => `${node.title} (${node.path})`)
      .nodeVal((node: any) => node.size || 6)
      .nodeColor((node: any) => node.color || '#ffffff')
      .linkSource('source')
      .linkTarget('target')
      .linkDirectionalArrowLength((link: any) => (link.type === 'backlink' ? 4 : 0))
      .linkDirectionalArrowRelPos(1)
      .linkWidth((link: any) => (link.weight ? link.weight * 2 : 1))
      .linkColor((link: any) => {
        if (link.type === 'semantic') return 'rgba(52, 152, 219, 0.4)';
        if (link.type === 'wiki-link') return 'rgba(46, 204, 113, 0.4)';
        return 'rgba(255, 255, 255, 0.2)';
      })
      // Custom Background Render Phase: Convex Cluster Hulls
      .onRenderFramePre((ctx: CanvasRenderingContext2D) => {
        if (this.currentClusters.size > 0) {
          this.hullRenderer.drawHulls(
            ctx,
            this.currentClusters,
            this.plugin.settings.clusterHullsOpacity,
            25
          );
        }
      })
      // Custom Node Canvas Painting (Halo ring for center root node)
      .nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const x = node.x || 0;
        const y = node.y || 0;
        const radius = (node.size || 6) / 2;

        // 1. Central Root Node Halo Ring
        if (node.type === 'root') {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, radius + 4, 0, 2 * Math.PI, false);
          ctx.strokeStyle = '#2ecc71';
          ctx.lineWidth = 2;
          ctx.shadowColor = '#2ecc71';
          ctx.shadowBlur = 10;
          ctx.stroke();
          ctx.restore();
        }

        // 2. Node Circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.color || '#ffffff';
        ctx.fill();

        // 3. Node Title Label (White text with background pill)
        const label = node.title;
        const fontSize = Math.max(10 / globalScale, 3);
        ctx.font = `${fontSize}px Sans-Serif`;

        if (globalScale > 0.8 || node.type === 'root') {
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth + 6, fontSize + 4];

          ctx.fillStyle = 'rgba(15, 17, 21, 0.8)';
          ctx.fillRect(
            x - bckgDimensions[0] / 2,
            y + radius + 2,
            bckgDimensions[0],
            bckgDimensions[1]
          );

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#ffffff';
          ctx.fillText(label, x, y + radius + 2 + bckgDimensions[1] / 2);
        }
      })
      // Click node to open Obsidian note
      .onNodeClick((node: any) => {
        if (node && node.path) {
          const file = this.app.vault.getAbstractFileByPath(node.path);
          if (file instanceof TFile) {
            this.app.workspace.getLeaf().openFile(file);
          }
        }
      });
  }

  public async refreshGraph(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    const { nodes, edges } = await this.dataEngine.buildGraphData(
      activeFile,
      this.plugin.settings
    );

    // Run Louvain Community Detection
    const { nodes: clusteredNodes, clusters } = this.communityDetector.detectCommunities(
      nodes,
      edges,
      this.plugin.settings.clusterColors
    );

    this.currentNodes = clusteredNodes;
    this.currentEdges = edges;
    this.currentClusters = clusters;

    if (this.graphInstance) {
      this.graphInstance.graphData({
        nodes: this.currentNodes,
        links: this.currentEdges,
      });
    }
  }

  async onClose(): Promise<void> {
    if (this.graphInstance) {
      this.graphInstance._destructor?.();
      this.graphInstance = null;
    }
  }
}
