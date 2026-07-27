import { App, TFile } from 'obsidian';
import { GraphNode, GraphEdge, ClusterGroup } from '../types';

export interface InspectorCallbacks {
  onOpenNote: (node: GraphNode, newTab?: boolean) => void;
  onSetFocus: (node: GraphNode) => void;
  onTogglePin: (node: GraphNode) => void;
  onHideNode: (node: GraphNode) => void;
  onClose: () => void;
}

export class InspectorPanel {
  private app: App;
  private containerEl: HTMLElement;
  private panelEl: HTMLDivElement | null = null;

  constructor(app: App, containerEl: HTMLElement) {
    this.app = app;
    this.containerEl = containerEl;
  }

  public show(
    node: GraphNode,
    focusNode: GraphNode | null,
    edges: GraphEdge[],
    cluster: ClusterGroup | undefined,
    callbacks: InspectorCallbacks
  ): void {
    this.hide();

    const panel = this.containerEl.createDiv({ cls: 'smart-graph-inspector-panel' });
    this.panelEl = panel;

    // Header
    const header = panel.createDiv({ cls: 'smart-graph-inspector-header' });
    const titleContainer = header.createDiv({ cls: 'smart-graph-inspector-title-container' });

    const colorDot = titleContainer.createDiv({ cls: 'smart-graph-inspector-color-dot' });
    colorDot.style.backgroundColor = node.clusterColor || node.color;

    const titleEl = titleContainer.createDiv({
      cls: 'smart-graph-inspector-title',
      text: node.title,
    });
    titleEl.title = node.title;

    const closeBtn = header.createEl('button', {
      cls: 'smart-graph-inspector-close-btn',
      text: '✕',
    });
    closeBtn.addEventListener('click', () => {
      this.hide();
      callbacks.onClose();
    });

    // Content Body
    const body = panel.createDiv({ cls: 'smart-graph-inspector-body' });

    // Section 1: Meta Grid
    const metaGrid = body.createDiv({ cls: 'smart-graph-inspector-meta-grid' });

    // Cluster Info
    const clusterBox = metaGrid.createDiv({ cls: 'smart-graph-inspector-meta-box' });
    clusterBox.createDiv({ cls: 'smart-graph-meta-label', text: 'Cluster' });
    clusterBox.createDiv({
      cls: 'smart-graph-meta-val',
      text: cluster ? cluster.name : 'Default Community',
    });

    // Similarity to Focus
    if (focusNode && !node.isFocus) {
      const simBox = metaGrid.createDiv({ cls: 'smart-graph-inspector-meta-box' });
      simBox.createDiv({ cls: 'smart-graph-meta-label', text: 'Similarity to focus' });
      const pct = Math.round((node.similarity || 0) * 100);
      simBox.createDiv({ cls: 'smart-graph-meta-val highlight', text: `${pct}%` });
    }

    // Section 2: Relations Overview & "Why connected?"
    const connectedEdges = edges.filter((e) => {
      const sId = typeof e.source === 'object' ? (e.source as GraphNode).id : e.source;
      const tId = typeof e.target === 'object' ? (e.target as GraphNode).id : e.target;
      return sId === node.id || tId === node.id;
    });

    let wikiCount = 0;
    let backlinkCount = 0;
    let sharedTagCount = 0;
    let semanticCount = 0;
    const reasons: string[] = [];

    connectedEdges.forEach((e) => {
      if (e.type === 'wiki-link') wikiCount++;
      if (e.type === 'backlink') backlinkCount++;
      if (e.type === 'shared-tag') sharedTagCount++;
      if (e.type === 'semantic') semanticCount++;

      const otherId = typeof e.source === 'object'
        ? (e.source as GraphNode).id === node.id ? (e.target as any).id || e.target : (e.source as GraphNode).id
        : e.source === node.id ? e.target : e.source;

      const otherTitle = typeof otherId === 'string' ? otherId.split('/').pop()?.replace('.md', '') : 'Neighbor';

      if (e.type === 'semantic' && e.weight > 0.4) {
        reasons.push(`• Semantic similarity ${(e.weight).toFixed(2)} with ${otherTitle}`);
      } else if (e.type === 'wiki-link') {
        reasons.push(`• Wiki-link relation with ${otherTitle}`);
      } else if (e.type === 'shared-tag') {
        reasons.push(`• Shared tag with ${otherTitle}`);
      }
    });

    if (node.similarity && node.similarity > 0.4) {
      reasons.unshift(`• Focus similarity ${Math.round(node.similarity * 100)}%`);
    }

    const relBox = body.createDiv({ cls: 'smart-graph-inspector-section' });
    relBox.createDiv({ cls: 'smart-graph-section-title', text: 'Relations' });
    const relSummary = relBox.createDiv({ cls: 'smart-graph-relations-summary' });
    relSummary.setText(
      `${connectedEdges.length} links (${wikiCount} wiki, ${sharedTagCount} tags, ${semanticCount} semantic)`
    );

    // Why connected section
    const whySection = body.createDiv({ cls: 'smart-graph-inspector-section' });
    whySection.createDiv({ cls: 'smart-graph-section-title', text: 'Why connected?' });
    const whyList = whySection.createDiv({ cls: 'smart-graph-why-list' });

    if (reasons.length === 0) {
      whyList.createDiv({ cls: 'smart-graph-why-item', text: '• Candidate node in local vault graph' });
    } else {
      reasons.slice(0, 4).forEach((reason) => {
        whyList.createDiv({ cls: 'smart-graph-why-item', text: reason });
      });
    }

    // Section 3: Action Buttons
    const actionsRow = panel.createDiv({ cls: 'smart-graph-inspector-actions' });

    const openBtn = actionsRow.createEl('button', {
      cls: 'smart-graph-btn primary',
      text: '📄 Open Note',
    });
    openBtn.addEventListener('click', () => callbacks.onOpenNote(node, false));

    const focusBtn = actionsRow.createEl('button', {
      cls: 'smart-graph-btn',
      text: '🎯 Set as Center',
    });
    focusBtn.addEventListener('click', () => callbacks.onSetFocus(node));

    const pinBtn = actionsRow.createEl('button', {
      cls: 'smart-graph-btn',
      text: node.isPinned ? '📍 Unpin' : '📌 Pin',
    });
    pinBtn.addEventListener('click', () => callbacks.onTogglePin(node));

    const hideBtn = actionsRow.createEl('button', {
      cls: 'smart-graph-btn danger',
      text: '👁️ Hide',
    });
    hideBtn.addEventListener('click', () => callbacks.onHideNode(node));
  }

  public hide(): void {
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
  }
}
