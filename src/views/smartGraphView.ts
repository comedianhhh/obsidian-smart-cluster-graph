import { ItemView, WorkspaceLeaf, TFile, setIcon } from 'obsidian';
import ForceGraph from 'force-graph';
import { forceX, forceY, forceManyBody, forceLink, forceCollide } from 'd3-force';
import type SmartGraphPlugin from '../main';
import { GraphNode, GraphEdge, ClusterGroup } from '../types';
import { SmartConnectionsBridge } from '../bridge/smartConnectionsBridge';
import { GraphDataEngine } from '../engine/graphDataEngine';
import { CommunityDetector } from '../engine/communityDetector';
import { HullRenderer } from './hullRenderer';
import { showNodeContextMenu } from './contextMenu';

export const SMART_GRAPH_VIEW_TYPE = 'smart-cluster-graph-view';

interface ForceGraphInstance {
  width(w: number): ForceGraphInstance;
  height(h: number): ForceGraphInstance;
  backgroundColor(color: string): ForceGraphInstance;
  nodeId(id: string): ForceGraphInstance;
  nodeVal(fn: (node: GraphNode) => number): ForceGraphInstance;
  nodeColor(fn: (node: GraphNode) => string): ForceGraphInstance;
  linkSource(source: string): ForceGraphInstance;
  linkTarget(target: string): ForceGraphInstance;
  onNodeHover(fn: (node: GraphNode | null) => void): ForceGraphInstance;
  onEngineStop(fn: () => void): ForceGraphInstance;
  enablePanInteraction(enable: boolean): ForceGraphInstance;
  enableZoomInteraction(enable: boolean): ForceGraphInstance;
  linkCanvasObject(fn: (link: GraphEdge, ctx: CanvasRenderingContext2D) => void): ForceGraphInstance;
  onRenderFramePre(fn: (ctx: CanvasRenderingContext2D) => void): ForceGraphInstance;
  nodeCanvasObject(fn: (node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => void): ForceGraphInstance;
  onNodeClick(fn: (node: GraphNode, event: MouseEvent) => void): ForceGraphInstance;
  onNodeRightClick(fn: (node: GraphNode, event: MouseEvent) => void): ForceGraphInstance;
  onBackgroundClick(fn: () => void): ForceGraphInstance;
  zoom(): number;
  zoom(level: number, duration?: number): ForceGraphInstance;
  centerAt(x?: number, y?: number, duration?: number): ForceGraphInstance;
  graphData(data: { nodes: GraphNode[]; links: GraphEdge[] }): ForceGraphInstance;
  d3Force(name: string): unknown;
  d3Force(name: string, force: unknown): ForceGraphInstance;
  numDimensions(dims: number): ForceGraphInstance;
  resumeAnimation(): void;
  d3ReheatSimulation(): void;
  _destructor?(): void;
}

export class SmartGraphView extends ItemView {
  private plugin: SmartGraphPlugin;
  private bridge: SmartConnectionsBridge;
  private dataEngine: GraphDataEngine;
  private communityDetector: CommunityDetector;
  private hullRenderer: HullRenderer;

  private container: HTMLDivElement | null = null;
  private canvasWrapper: HTMLDivElement | null = null;
  private graphInstance: ForceGraphInstance | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private searchQuery: string = '';

  // Interaction State
  private hoverNode: GraphNode | null = null;
  private selectedNode: GraphNode | null = null;
  private focusFile: TFile | null = null;

  private pinnedNodes: Set<string> = new Set();
  private hiddenNodes: Set<string> = new Set();

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
    return 'Smart Cluster Graph';
  }

  getIcon(): string {
    return 'dot-network';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLDivElement;
    container.empty();
    container.addClass('smart-graph-view-container');
    this.container = container;

    // Build Ultra-Minimal Header Toolbar
    this.buildHeaderToolbar(container);

    // Canvas Wrapper
    this.canvasWrapper = container.createDiv({ cls: 'smart-graph-canvas-wrapper' });

    // Observe size changes to sync graph dimensions
    this.resizeObserver = new ResizeObserver(() => {
      this.syncDimensions();
    });
    this.resizeObserver.observe(this.canvasWrapper);

    // Register tab/screen switch listeners to prevent freezing
    this.registerEvent(
      this.app.workspace.on('layout-change', () => {
        this.handleVisibilityRestore();
      })
    );

    this.registerEvent(
      this.app.workspace.on('active-leaf-change', (leaf) => {
        if (leaf === this.leaf) {
          this.handleVisibilityRestore();
        } else {
          // Highlight currently active file node without re-centering
          this.syncActiveFileSelection();
        }
      })
    );

    window.addEventListener('visibilitychange', this.handleWindowVisibility);

    // Initialize Graph
    this.initGraph();
    await this.refreshGraph();
  }

  onResize(): void {
    super.onResize();
    this.handleVisibilityRestore();
  }

  private handleWindowVisibility = (): void => {
    if (document.visibilityState === 'visible') {
      this.handleVisibilityRestore();
    }
  };

  private handleVisibilityRestore(): void {
    if (!this.canvasWrapper || !this.graphInstance) return;
    const width = this.canvasWrapper.clientWidth;
    const height = this.canvasWrapper.clientHeight;

    // Guard against zero dimensions when backgrounded
    if (width > 50 && height > 50) {
      this.graphInstance.width(width).height(height);
      if (typeof this.graphInstance.resumeAnimation === 'function') {
        this.graphInstance.resumeAnimation();
      }
      if (typeof this.graphInstance.d3ReheatSimulation === 'function') {
        this.graphInstance.d3ReheatSimulation();
      }
      this.applyUserZoomAndCentering();
    }
  }

  private syncDimensions(): void {
    if (this.canvasWrapper && this.graphInstance) {
      const width = this.canvasWrapper.clientWidth;
      const height = this.canvasWrapper.clientHeight;
      if (width > 50 && height > 50) {
        this.graphInstance.width(width).height(height);
      }
    }
  }

  private syncActiveFileSelection(): void {
    const activeFile = this.app.workspace.getActiveFile();
    if (activeFile) {
      const matchedNode = this.currentNodes.find((n) => n.path === activeFile.path);
      if (matchedNode) {
        this.selectedNode = matchedNode;
      }
    }
  }

  public setZoomLevel(zoom: number): void {
    if (this.graphInstance) {
      this.graphInstance.zoom(zoom, 150);
    }
  }

  private applyUserZoomAndCentering(): void {
    if (!this.graphInstance) return;

    const activeNodes = this.currentNodes.filter((n) => !n.isHidden);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    activeNodes.forEach((n) => {
      if (n.x !== undefined && n.y !== undefined) {
        if (n.x < minX) minX = n.x;
        if (n.x > maxX) maxX = n.x;
        if (n.y < minY) minY = n.y;
        if (n.y > maxY) maxY = n.y;
      }
    });

    const userZoom = this.plugin.settings.defaultZoomLevel || 3.5;

    if (minX !== Infinity && maxX !== -Infinity) {
      const midX = (minX + maxX) / 2;
      const midY = (minY + maxY) / 2;
      this.graphInstance.centerAt(midX, midY, 150);
      this.graphInstance.zoom(userZoom, 150);
    } else {
      this.graphInstance.centerAt(0, 0, 150);
      this.graphInstance.zoom(userZoom, 150);
    }
  }

  private buildHeaderToolbar(container: HTMLDivElement): void {
    const toolbar = container.createDiv({ cls: 'smart-graph-header-toolbar' });

    // Left: Title
    const titleGroup = toolbar.createDiv({ cls: 'smart-graph-title-group' });
    titleGroup.createDiv({ cls: 'smart-graph-title', text: 'Smart Cluster Graph' });

    // Right Action Section
    const rightActions = toolbar.createDiv({ cls: 'smart-graph-toolbar-right' });

    // Minimal Node Search Bar
    const searchContainer = rightActions.createDiv({ cls: 'smart-graph-search-container' });
    const searchInput = searchContainer.createEl('input', {
      cls: 'smart-graph-search-input',
      type: 'text',
      placeholder: 'Search nodes...',
    });
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      this.handleSearchFilter();
    });

    // Refresh Button
    const refreshBtn = rightActions.createDiv({ cls: 'smart-graph-refresh-button' });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.setAttribute('aria-label', 'Refresh graph');
    refreshBtn.addEventListener('click', () => {
      void this.refreshGraph();
    });

    // Show warning banner ONLY if Smart Connections is unavailable
    if (!this.bridge.isSmartConnectionsAvailable()) {
      container.createDiv({
        cls: 'smart-graph-notice-banner',
        text: 'Smart Connections unavailable',
      });
    }
  }

  private handleSearchFilter(): void {
    if (!this.searchQuery) return;

    const matchedNode = this.currentNodes.find(
      (n) => !n.isHidden && (n.title.toLowerCase().includes(this.searchQuery) || n.path.toLowerCase().includes(this.searchQuery))
    );

    if (matchedNode) {
      this.selectedNode = matchedNode;
    }
  }

  private initGraph(): void {
    if (!this.canvasWrapper) return;

    const forceGraphConstructor = ForceGraph as unknown as () => (element: HTMLElement) => ForceGraphInstance;
    const createGraph = forceGraphConstructor();
    this.graphInstance = createGraph(this.canvasWrapper)
      .backgroundColor('#0f1115')
      .nodeId('id')
      .nodeVal((node: GraphNode) => node.size || 4.5)
      .nodeColor((node: GraphNode) => node.clusterColor || node.color || '#55B476')
      .linkSource('source')
      .linkTarget('target')
      .onNodeHover((node: GraphNode | null) => {
        this.hoverNode = node || null;
      })

      // Lock user-configured initial zoom when D3 force simulation settles
      .onEngineStop(() => {
        this.applyUserZoomAndCentering();
      })

      // Enable left-click canvas panning
      .enablePanInteraction(true)

      // Disable default force-graph wheel zoom so we can zoom around screen center
      .enableZoomInteraction(false)

      // Custom Edge Rendering with Line Crossing Avoidance (Curves around intermediate clusters)
      .linkCanvasObject((link: GraphEdge, ctx: CanvasRenderingContext2D) => {
        const sId = typeof link.source === 'object' ? link.source.id : link.source;
        const tId = typeof link.target === 'object' ? link.target.id : link.target;
        const sNode = typeof link.source === 'object' ? link.source : this.currentNodes.find((n) => n.id === sId);
        const tNode = typeof link.target === 'object' ? link.target : this.currentNodes.find((n) => n.id === tId);

        if (!sNode || !tNode || sNode.isHidden || tNode.isHidden) return;
        if (sNode.clusterId === tNode.clusterId) return; // Hide internal edges completely

        const x1 = sNode.x || 0;
        const y1 = sNode.y || 0;
        const x2 = tNode.x || 0;
        const y2 = tNode.y || 0;

        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const ux = dx / len;
        const uy = dy / len;

        // Check if line passes through or near any intermediate cluster
        let maxDeflection = 0;
        let deflectionSign = 1;

        this.currentClusters.forEach((cluster) => {
          if (cluster.id === sNode.clusterId || cluster.id === tNode.clusterId) return;

          let cx = 0, cy = 0;
          const activeClusterNodes = cluster.nodes.filter(n => !n.isHidden);
          if (activeClusterNodes.length === 0) return;

          activeClusterNodes.forEach((n) => {
            cx += n.x || 0;
            cy += n.y || 0;
          });
          cx /= activeClusterNodes.length;
          cy /= activeClusterNodes.length;

          // Projection along line vector
          const proj = (cx - x1) * ux + (cy - y1) * uy;
          if (proj > 15 && proj < len - 15) {
            // Perpendicular distance from cluster center to line
            const perpDist = Math.abs((x2 - x1) * (y1 - cy) - (x1 - cx) * (y2 - y1)) / len;
            const clearance = 65;

            if (perpDist < clearance) {
              const shift = clearance - perpDist + 20;
              if (shift > maxDeflection) {
                maxDeflection = shift;
                const side = (x2 - x1) * (cy - y1) - (y2 - y1) * (cx - x1);
                deflectionSign = side > 0 ? -1 : 1;
              }
            }
          }
        });

        const isHovered = this.hoverNode && (sNode.id === this.hoverNode.id || tNode.id === this.hoverNode.id);
        ctx.save();
        ctx.lineWidth = isHovered ? 1.8 : 1.2;
        ctx.strokeStyle = isHovered ? 'rgba(235, 238, 244, 0.65)' : 'rgba(205, 210, 220, 0.16)';

        ctx.beginPath();
        ctx.moveTo(x1, y1);

        if (maxDeflection > 0) {
          // Curve smoothly around intermediate cluster hull
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          const nx = -uy * deflectionSign;
          const ny = ux * deflectionSign;

          const ctrlX = midX + nx * maxDeflection;
          const ctrlY = midY + ny * maxDeflection;

          ctx.quadraticCurveTo(ctrlX, ctrlY, x2, y2);
        } else {
          // Clear path -> straight line
          ctx.lineTo(x2, y2);
        }

        ctx.stroke();
        ctx.restore();
      })

      // Convex Cluster Hulls
      .onRenderFramePre((ctx: CanvasRenderingContext2D) => {
        if (this.currentClusters.size > 0) {
          this.hullRenderer.drawHulls(
            ctx,
            this.currentClusters,
            this.selectedNode?.id || null,
            this.plugin.settings.hullOpacity,
            18
          );
        }
      })

      // Custom Node Canvas Painting & Center Label Badges
      .nodeCanvasObject((node: GraphNode, ctx: CanvasRenderingContext2D, globalScale: number) => {
        if (node.isHidden) return;

        const x = node.x || 0;
        const y = node.y || 0;
        let radius = node.size || 4.5;

        // Hover scale boost
        if (this.hoverNode && this.hoverNode.id === node.id) {
          radius *= 1.1;
        }

        let opacity = 1.0;

        if (this.hoverNode && this.hoverNode.id !== node.id) {
          const hoverId = this.hoverNode.id;
          const isConnected = this.currentEdges.some((e) => {
            const sId = typeof e.source === 'object' ? e.source.id : e.source;
            const tId = typeof e.target === 'object' ? e.target.id : e.target;
            return (sId === hoverId && tId === node.id) || (tId === hoverId && sId === node.id);
          });
          if (!isConnected) {
            opacity = 0.18;
          }
        }


        ctx.save();
        ctx.globalAlpha = opacity;

        // 1. Node Circle (Permanent cluster color)
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
        ctx.fillStyle = node.clusterColor || node.color || '#55B476';
        ctx.fill();

        // 2. Selected Ring (Tight crisp white ring around node circle - NO center shift!)
        if (this.selectedNode && this.selectedNode.id === node.id) {
          ctx.beginPath();
          ctx.arc(x, y, radius + 1.2, 0, 2 * Math.PI, false);
          ctx.strokeStyle = 'rgba(245, 247, 250, 0.95)';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }

        // 3. Cluster Representative Badge / Hover Label
        const isSelected = this.selectedNode && this.selectedNode.id === node.id;
        const isHovered = this.hoverNode && this.hoverNode.id === node.id;
        const showCenterBadge = node.isFocus || node.isRepresentative;
        const showHoverLabel = (isSelected || isHovered) && !showCenterBadge;

        if (showCenterBadge) {
          this.drawCenterBadgeLabel(ctx, node, x, y, radius, globalScale);
        } else if (showHoverLabel) {
          this.drawFormattedLabel(ctx, node, x, y, radius, globalScale);
        }

        ctx.restore();
      })

      // Single Click Node -> Select node ONLY
      .onNodeClick((node: GraphNode) => {
        this.selectedNode = node;
      })

      // Click Background -> Deselect node
      .onBackgroundClick(() => {
        this.selectedNode = null;
      })

      // Right Click Node -> Context Menu
      .onNodeRightClick((node: GraphNode, event: MouseEvent) => {
        if (node) {
          showNodeContextMenu(event, node, this.app, {
            onOpenNote: (n, tab) => this.openNodeFile(n, tab),
          });
        }
      });

    const canvas = this.canvasWrapper.querySelector('canvas');
    if (canvas) {
      // Intercept Middle Click (button === 1) to prevent canvas autoscroll
      const preventMiddleClick = (e: MouseEvent | PointerEvent) => {
        if (e.button === 1) {
          e.preventDefault();
          e.stopPropagation();
        }
      };

      canvas.addEventListener('pointerdown', preventMiddleClick, true);
      canvas.addEventListener('mousedown', preventMiddleClick, true);
      canvas.addEventListener('auxclick', preventMiddleClick, true);

      // Custom Wheel Listener: Zoom centered around SCREEN CENTER
      canvas.addEventListener(
        'wheel',
        (e: WheelEvent) => {
          e.preventDefault();
          e.stopPropagation();
          const currentZoom = this.graphInstance.zoom();
          const zoomFactor = e.deltaY < 0 ? 1.12 : 0.88;
          const targetZoom = Math.max(0.3, Math.min(6.0, currentZoom * zoomFactor));
          this.graphInstance.zoom(targetZoom, 80);
        },
        { passive: false }
      );

      // Double Click canvas node -> Open file ONLY (DO NOT re-center graph!)
      canvas.addEventListener('dblclick', () => {
        if (this.hoverNode) {
          this.openNodeFile(this.hoverNode);
        }
      });
    }
  }

  /**
   * P2 Style: Badge centered directly below representative node (labelY = y + radius + 5)
   */
  private drawCenterBadgeLabel(
    ctx: CanvasRenderingContext2D,
    node: GraphNode,
    x: number,
    y: number,
    radius: number,
    globalScale: number
  ): void {
    const fontSize = Math.max(8.5 / globalScale, 2.8);
    ctx.font = `600 ${fontSize}px Sans-Serif`;

    const text = node.title;
    const textWidth = ctx.measureText(text).width;
    const padX = 3.5 / globalScale;
    const padY = 1.5 / globalScale;
    const bgWidth = textWidth + padX * 2;
    const bgHeight = fontSize + padY * 2;

    // Centered directly below the representative node
    const labelY = y + radius + padY + 3 / globalScale;
    const rectX = x - bgWidth / 2;
    const rectY = labelY;

    ctx.fillStyle = 'rgba(8, 9, 11, 0.94)';
    ctx.fillRect(rectX, rectY, bgWidth, bgHeight);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 0.8 / globalScale;
    ctx.strokeRect(rectX, rectY, bgWidth, bgHeight);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(245, 246, 248, 0.98)';
    ctx.fillText(text, x, labelY + bgHeight / 2);
  }

  private drawFormattedLabel(
    ctx: CanvasRenderingContext2D,
    node: GraphNode,
    x: number,
    y: number,
    radius: number,
    globalScale: number
  ): void {
    const fontSize = Math.max(8.5 / globalScale, 2.5);
    ctx.font = `500 ${fontSize}px Sans-Serif`;

    const rawTitle = node.title;
    const textWidth = ctx.measureText(rawTitle).width;
    const padX = 3.5 / globalScale;
    const padY = 1.5 / globalScale;
    const bgWidth = textWidth + padX * 2;
    const bgHeight = fontSize + padY * 2;

    const labelY = y + radius + padY + 3 / globalScale;

    // Background rect
    ctx.fillStyle = 'rgba(8, 9, 11, 0.90)';
    ctx.fillRect(x - bgWidth / 2, labelY, bgWidth, bgHeight);

    // Text
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(245, 246, 248, 0.96)';
    ctx.fillText(rawTitle, x, labelY + bgHeight / 2);
  }

  private openNodeFile(node: GraphNode, newTab: boolean = false): void {
    if (node && node.path) {
      const file = this.app.vault.getAbstractFileByPath(node.path);
      if (file instanceof TFile) {
        const leaf = newTab ? this.app.workspace.getLeaf('tab') : this.app.workspace.getLeaf();
        void leaf.openFile(file);
      }
    }
  }

  /**
   * Filter edges to display ONLY the strongest bridge per cluster pair (max 2 bridges per cluster).
   * Completely excludes internal edges from visual rendering.
   */
  private buildVisibleEdges(
    edges: GraphEdge[],
    nodes: GraphNode[]
  ): GraphEdge[] {
    const nodeClusterMap = new Map<string, string>();
    nodes.forEach((n) => nodeClusterMap.set(n.id, n.clusterId));

    // 1. Find strongest edge per cluster pair
    const strongestByClusterPair = new Map<string, GraphEdge>();

    for (const edge of edges) {
      const sId = typeof edge.source === 'object' ? edge.source.id : edge.source;
      const tId = typeof edge.target === 'object' ? edge.target.id : edge.target;

      const sourceCluster = nodeClusterMap.get(sId);
      const targetCluster = nodeClusterMap.get(tId);

      if (!sourceCluster || !targetCluster) continue;

      // Discard internal cluster edges completely
      if (sourceCluster === targetCluster) continue;

      const pairKey = [sourceCluster, targetCluster].sort().join('::');
      const existing = strongestByClusterPair.get(pairKey);

      if (!existing || (edge.weight || 0) > (existing.weight || 0)) {
        strongestByClusterPair.set(pairKey, edge);
      }
    }

    // 2. Limit each cluster to max 2 neighbor bridges
    const bridges = Array.from(strongestByClusterPair.values());
    bridges.sort((a, b) => (b.weight || 0) - (a.weight || 0));

    const clusterDegreeMap = new Map<string, number>();
    const filteredBridges: GraphEdge[] = [];

    for (const bridge of bridges) {
      const sId = typeof bridge.source === 'object' ? bridge.source.id : bridge.source;
      const tId = typeof bridge.target === 'object' ? bridge.target.id : bridge.target;


      const sCluster = nodeClusterMap.get(sId)!;
      const tCluster = nodeClusterMap.get(tId)!;

      const degS = clusterDegreeMap.get(sCluster) || 0;
      const degT = clusterDegreeMap.get(tCluster) || 0;

      if (degS < 2 && degT < 2) {
        clusterDegreeMap.set(sCluster, degS + 1);
        clusterDegreeMap.set(tCluster, degT + 1);
        bridge.isPrimaryCrossCluster = true;
        filteredBridges.push(bridge);
      }
    }

    return filteredBridges;
  }

  private applyClusterForces(): void {
    if (!this.graphInstance || this.currentClusters.size === 0) return;

    const clusterIds = Array.from(this.currentClusters.keys());
    const anchors = new Map<string, { x: number; y: number }>();

    // Focus cluster anchor strictly at (0, 0)
    const centerX = 0;
    const centerY = 0;
    const radius = 220;

    let focusClusterId = clusterIds[0];
    this.currentClusters.forEach((c, id) => {
      if (c.nodes.some((n) => n.isFocus)) focusClusterId = id;
    });

    anchors.set(focusClusterId, { x: centerX, y: centerY });

    // Fix Focus Node at exact origin (0, 0)
    const focusNode = this.currentNodes.find((n) => n.isFocus);
    if (focusNode) {
      focusNode.fx = 0;
      focusNode.fy = 0;
    }

    const remainingClusters = clusterIds.filter((id) => id !== focusClusterId);
    remainingClusters.forEach((clusterId, index) => {
      const angle = (index / remainingClusters.length) * Math.PI * 2 - Math.PI / 2;
      anchors.set(clusterId, {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    });

    // 1. Cluster Anchor Force
    this.graphInstance.d3Force(
      'clusterX',
      forceX<GraphNode>((node) => anchors.get(node.clusterId)?.x ?? 0).strength(0.22)
    );

    this.graphInstance.d3Force(
      'clusterY',
      forceY<GraphNode>((node) => anchors.get(node.clusterId)?.y ?? 0).strength(0.22)
    );

    // 2. Central Attraction
    this.graphInstance.d3Force('centerGravityX', forceX<GraphNode>(0).strength(0.08));
    this.graphInstance.d3Force('centerGravityY', forceY<GraphNode>(0).strength(0.08));

    // 3. Charge force (Stronger repulsion to push unconnected / isolated nodes apart)
    this.graphInstance.d3Force(
      'charge',
      forceManyBody<GraphNode>().strength((node) => (node.clusterId.startsWith('isolated-') ? -220 : node.isRepresentative || node.isFocus ? -120 : -80))
    );

    // 4. Collision force
    this.graphInstance.d3Force(
      'collision',
      forceCollide<GraphNode>()
        .radius((node) => (node.isRepresentative || node.isFocus ? 28 : 20))
        .strength(0.9)
    );

    // 5. Link force
    this.graphInstance.d3Force(
      'link',
      forceLink<GraphNode, GraphEdge>()
        .distance((edge: GraphEdge) => (edge.type === 'semantic' ? 120 : 60))
        .strength((edge: GraphEdge) => {
          const s = typeof edge.source === 'object' ? edge.source : this.currentNodes.find((n) => n.id === edge.source);
          const t = typeof edge.target === 'object' ? edge.target : this.currentNodes.find((n) => n.id === edge.target);
          if (s && t && s.clusterId === t.clusterId) return 0.35;
          return 0.06;
        })
    );
  }

  public async refreshGraph(): Promise<void> {
    const activeFile = this.app.workspace.getActiveFile();
    const { nodes, edges } = await this.dataEngine.buildGraphData(
      activeFile,
      this.plugin.settings
    );

    // Run Community Detection (Max 5 clusters, min size 3)
    const { nodes: clusteredNodes, clusters } = this.communityDetector.detectCommunities(
      nodes,
      edges,
      this.plugin.settings.clusterColors,
      this.plugin.settings.minimumClusterSize
    );

    // Exclude orphan background nodes completely
    const primaryNodes = clusteredNodes.filter((n) => !n.isOrphan);

    // Build visible bridge edges
    const visibleEdges = this.buildVisibleEdges(edges, primaryNodes);

    // Synchronize currently active file in Obsidian with selectedNode (tight white ring)
    if (activeFile) {
      const activeNode = primaryNodes.find((n) => n.path === activeFile.path);
      if (activeNode) {
        this.selectedNode = activeNode;
      }
    }

    // Restore Pinned / Hidden states
    primaryNodes.forEach((node) => {
      if (this.pinnedNodes.has(node.id)) {
        node.isPinned = true;
      }
      if (this.hiddenNodes.has(node.id)) {
        node.isHidden = true;
      }
    });

    this.currentNodes = primaryNodes;
    this.currentEdges = visibleEdges;
    this.currentClusters = clusters;

    if (this.graphInstance) {
      this.syncDimensions();

      this.graphInstance.graphData({
        nodes: this.currentNodes.filter((n) => !n.isHidden),
        links: this.currentEdges,
      });

      this.applyClusterForces();
      this.graphInstance.numDimensions(2);

      // Lock user configured zoom both early (250ms) and on simulation stop
      window.setTimeout(() => {
        this.applyUserZoomAndCentering();
      }, 250);

      window.setTimeout(() => {
        this.applyUserZoomAndCentering();
      }, 600);
    }
  }


  async onClose(): Promise<void> {
    window.removeEventListener('visibilitychange', this.handleWindowVisibility);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.graphInstance) {
      this.graphInstance._destructor?.();
      this.graphInstance = null;
    }
  }
}
