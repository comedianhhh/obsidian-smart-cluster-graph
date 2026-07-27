import { Plugin, WorkspaceLeaf } from 'obsidian';
import { SmartGraphSettings, DEFAULT_SETTINGS } from './types';
import { SmartGraphView, SMART_GRAPH_VIEW_TYPE } from './views/smartGraphView';
import { SmartGraphSettingsTab } from './settings/settingsTab';

export default class SmartGraphPlugin extends Plugin {
  settings: SmartGraphSettings = DEFAULT_SETTINGS;

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register Custom View
    this.registerView(
      SMART_GRAPH_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new SmartGraphView(leaf, this)
    );

    // Add Ribbon Icon to Left Sidebar
    this.addRibbonIcon('dot-network', 'Smart Graph Explorer', () => {
      this.activateView();
    });

    // Add Command Palette Command
    this.addCommand({
      id: 'open-smart-graph-explorer',
      name: 'Open Smart Graph Explorer',
      callback: () => {
        this.activateView();
      },
    });

    // Register Settings Tab
    this.addSettingTab(new SmartGraphSettingsTab(this.app, this));

    // Listen for active leaf change to update graph view centered on current note
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.refreshView();
      })
    );
  }

  async activateView(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(SMART_GRAPH_VIEW_TYPE);

    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getRightLeaf(false);
      await leaf?.setViewState({
        type: SMART_GRAPH_VIEW_TYPE,
        active: true,
      });
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }

  public refreshView(): void {
    const leaves = this.app.workspace.getLeavesOfType(SMART_GRAPH_VIEW_TYPE);
    leaves.forEach((leaf) => {
      if (leaf.view instanceof SmartGraphView) {
        leaf.view.refreshGraph();
      }
    });
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(SMART_GRAPH_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
