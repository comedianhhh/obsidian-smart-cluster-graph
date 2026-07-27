import { App, PluginSettingTab, Setting } from 'obsidian';
import type SmartGraphPlugin from '../main';
import { LicenseManager } from '../license/licenseManager';

export class SmartGraphSettingsTab extends PluginSettingTab {
  private plugin: SmartGraphPlugin;

  constructor(app: App, plugin: SmartGraphPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Smart Graph Explorer Settings' });

    // 1. Similarity Threshold
    new Setting(containerEl)
      .setName('Semantic Similarity Threshold')
      .setDesc('Minimum similarity score (0.50 to 0.95) for connecting notes.')
      .addSlider((slider) =>
        slider
          .setLimits(0.5, 0.95, 0.05)
          .setValue(this.plugin.settings.similarityThreshold)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.similarityThreshold = val;
            await this.plugin.saveSettings();
            this.plugin.refreshView();
          })
      );

    // 2. Max Nodes Limit
    new Setting(containerEl)
      .setName('Max Graph Nodes Limit')
      .setDesc('Maximum number of nodes rendered to maintain high FPS performance.')
      .addSlider((slider) =>
        slider
          .setLimits(30, 500, 10)
          .setValue(this.plugin.settings.maxNodesLimit)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.maxNodesLimit = val;
            await this.plugin.saveSettings();
            this.plugin.refreshView();
          })
      );

    // 3. Cluster Hulls Opacity
    new Setting(containerEl)
      .setName('Cluster Polygon Hull Opacity')
      .setDesc('Background opacity of semi-transparent cluster convex hulls.')
      .addSlider((slider) =>
        slider
          .setLimits(0.05, 0.5, 0.05)
          .setValue(this.plugin.settings.clusterHullsOpacity)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.clusterHullsOpacity = val;
            await this.plugin.saveSettings();
            this.plugin.refreshView();
          })
      );

    // 4. Multimodal Edge Toggles
    new Setting(containerEl)
      .setName('Show Semantic Similarity Links')
      .setDesc('Draw solid edges for semantically similar notes calculated by Smart Connections.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showSemanticLinks)
          .onChange(async (val) => {
            this.plugin.settings.showSemanticLinks = val;
            await this.plugin.saveSettings();
            this.plugin.refreshView();
          })
      );

    new Setting(containerEl)
      .setName('Show Obsidian Wiki Links')
      .setDesc('Draw dashed edges for explicit [[Wiki Links]].')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.showWikiLinks)
          .onChange(async (val) => {
            this.plugin.settings.showWikiLinks = val;
            await this.plugin.saveSettings();
            this.plugin.refreshView();
          })
      );

    // 5. Commercial License Key Section
    containerEl.createEl('h3', { text: 'License & Monetization' });

    const licenseManager = new LicenseManager(this.plugin.settings);

    new Setting(containerEl)
      .setName('Pro License Key')
      .setDesc('Enter your commercial license key to unlock advanced cluster filters and export features.')
      .addText((text) =>
        text
          .setPlaceholder('SG-PRO-XXXX-XXXX-XXXX')
          .setValue(this.plugin.settings.licenseKey)
          .onChange(async (val) => {
            const res = await licenseManager.validateLicenseKey(val);
            if (res.isValid) {
              this.plugin.settings.licenseKey = val;
              this.plugin.settings.isLicensed = true;
            }
            await this.plugin.saveSettings();
          })
      );
  }
}
