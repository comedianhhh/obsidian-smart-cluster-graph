import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import ForceGraph from 'force-graph';
import { forceX, forceY, forceManyBody, forceLink, forceCollide } from 'd3-force';
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
  private hoverNode: GraphNode | null = null;
  private hasInitialFit: boolean = false;

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

    // Canvas Wrapper
    this.canvasWrapper = container.createDiv({ cls: 'smart-graph-canvas-wrapper' });

    // Initialize Graph
    this.initGraph();
    await this.refreshGraph();
  }

  private initGraph(): void {
    if (!this.canvasWrapper) return;

    const width = this.canvasWrapper.clientWidth || 800;
    const height = this.canvasWrapper.clientHeight || 600;

    this.graphInstance = ForceGraph()(this.canvasWrapper)
      .backgroundColor('#0f1115')
      .nodeId('id')
      .nodeVal((node: any) => node.size || 4)
      .nodeColor((node: any) => node.color || '#ffffff')
      .linkSource('source')
      .linkTarget('target')
      .linkWidth(0.8)
      .linkColor(() => 'rgba(170, 176, 190, 0.18)')
      .onNodeHover((node: any) => {
        this.hoverNode = node || null;
      })

      // Custom Background Render Phase: Convex Cluster Hulls
      .onRenderFramePre((ctx: CanvasRenderingContext2D) => {
        if (this.currentClusters.size > 0) {
          this.hullRenderer.drawHulls(
            ctx,
            this.currentClusters,
            this.plugin.settings.hullOpacity,
            this.plugin.settings.hullPadding
          );
        }
      })

      // Custom Node Canvas Painting & Minimal Labels
      .nodeCanvasObject((node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
        const x = node.x || 0;
        const y = node.y || 0;
        const radius = node.size || 4;

        // 1. Central Focus Node Halo
        if (node.isFocus) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(x, y, 14, 0, 2 * Math.PI, false);
          ctx.fillStyle = 'rgba(88, 183, 123, 0.18)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(88, 183, 123, 0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();
        }

        // 2. Node Circle
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.color || '#ffffff';
        ctx.fill();

        // 3. Selective Label Drawing: Only show for Focus, Representative, or Hovered nodes
        const showLabel = node.isFocus || node.isRepresentative || (this.hoverNode && this.hoverNode.id === node.id);

        if (showLabel) {
          const label = node.title;
          const fontSize = Math.max(9 / globalScale, 2.5);
          ctx.font = `${fontSize}px Sans-Serif`;

          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth + 6, fontSize + 4];

          ctx.fillStyle = 'rgba(10, 11, 13, 0.88)';
          ctx.fillRect(
            x - bckgDimensions[0] / 2,
            y + radius + 3,
            bckgDimensions[0],
            bckgDimensions[1]
          );

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(245, 246, 248, 0.95)';
          ctx.fillText(label, x, y + radius + 3 + bckgDimensions[1] / 2);
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
      })

      // Auto zoom to fit once on engine stop
      .onEngineStop(() => {
        if (!this.hasInitialFit && this.graphInstance) {
          this.hasInitialFit = true;
          this.graphInstance.zoomToFit(500, 70);
        }
      });

    // Remove strong default center force
    this.graphInstance.d3Force('center', null);
  }

  private applyClusterForces(width: number, height: number): void {
    if (!this.graphInstance || this.currentClusters.size === 0) return;

    const clusterIds = Array.from(this.currentClusters.keys());
    const anchors = new Map<string, { x: number; y: number }>();

    const centerX = width / 2;
    const centerY = height / 2;
    const radiusX = width * 0.32;
    const radiusY = height * 0.32;

    // Find focus cluster ID
    let focusClusterId = clusterIds[0];
    this.currentClusters.forEach((c, id) => {
      if (c.nodes.some((n) => n.isFocus)) focusClusterId = id;
    });

    // Position focus cluster in the exact center
    anchors.set(focusClusterId, { x: centerX, y: centerY });

    const remainingClusters = clusterIds.filter((id) => id !== focusClusterId);
    remainingClusters.forEach((clusterId, index) => {
      const angle = (index / remainingClusters.length) * Math.PI * 2 - Math.PI / 2;
      anchors.set(clusterId, {
        x: centerX + Math.cos(angle) * radiusX,
        y: centerY + Math.sin(angle) * radiusY,
      });
    });

    // 1. Cluster Force X and Y
    this.graphInstance.d3Force(
      'clusterX',
      forceX<any>((node) => anchors.get(node.clusterId)?.x ?? centerX).strength(0.12)
    );

    this.graphInstance.d3Force(
      'clusterY',
      forceY<any>((node) => anchors.get(node.clusterId)?.y ?? centerY).strength(0.12)
    );

    // 2. Charge force
    this.graphInstance.d3Force(
      'charge',
      forceManyBody<any>().strength((node) => (node.isRepresentative || node.isFocus ? -90 : -30))
    );

    // 3. Collision force
    this.graphInstance.d3Force(
      'collision',
      forceCollide<any>()
        .radius((node) => (node.isRepresentative || node.isFocus ? 18 : 9))
        .strength(0.8)
    );

    // 4. Link force
    this.graphInstance.d3Force(
      'link',
      forceLink<any>()
        .distance((edge: any) => {
          if (edge.type === 'cluster-link') return 180;
          if (edge.type === 'wiki-link') return 70;
          return 45;
        })
        .strength((edge: any) => (edge.type === 'cluster-link' ? 0.05 : 0.25))
    );
  }

  public async refreshGraph(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    const { nodes, edges } = await this.dataEngine.buildGraphData(
      activeFile,
      this.plugin.settings
    );

    // Run Community Detection & Select Representative Nodes
    const { nodes: clusteredNodes, clusters } = this.communityDetector.detectCommunities(
      nodes,
      edges,
      this.plugin.settings.clusterColors,
      this.plugin.settings.minimumClusterSize
    );

    this.currentNodes = clusteredNodes;
    this.currentEdges = edges;
    this.currentClusters = clusters;
    this.hasInitialFit = false;

    if (this.graphInstance && this.canvasWrapper) {
      const width = this.canvasWrapper.clientWidth || 800;
      const height = this.canvasWrapper.clientHeight || 600;

      this.graphInstance.graphData({
        nodes: this.currentNodes,
        links: this.currentEdges,
      });

      this.applyClusterForces(width, height);
      this.graphInstance.numDimensions(2);
    }
  }

  async onClose(): Promise<void> {
    if (this.graphInstance) {
      this.graphInstance._destructor?.();
      this.graphInstance = null;
    }
  }
}
