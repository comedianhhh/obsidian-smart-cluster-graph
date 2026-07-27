import { App, PluginSettingTab, Setting } from 'obsidian';
import type SmartGraphPlugin from '../main';
import { GraphMode } from '../types';

export class SmartGraphSettingsTab extends PluginSettingTab {
  private plugin: SmartGraphPlugin;

  constructor(app: App, plugin: SmartGraphPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Smart Cluster Graph Settings' });

    // 1. Default Initial Zoom Scale (Manual adjustment)
    new Setting(containerEl)
      .setName('Default Initial Zoom Scale')
      .setDesc('Manually set default initial camera zoom level (1.0x to 6.0x).')
      .addSlider((slider) =>
        slider
          .setLimits(1.0, 6.0, 0.2)
          .setValue(this.plugin.settings.defaultZoomLevel || 3.5)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.defaultZoomLevel = val;
            await this.plugin.saveSettings();
            // Instantly update canvas zoom in real time without lagging graph rebuild!
            this.plugin.updateZoomOnly(val);
          })
      );

    // 2. Follow Active Note
    new Setting(containerEl)
      .setName('Follow Active Note')
      .setDesc('Automatically update active note selection in graph when switching Obsidian tabs.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.followActiveNote)
          .onChange(async (val) => {
            this.plugin.settings.followActiveNote = val;
            await this.plugin.saveSettings();
          })
      );

    // 3. Focus Similarity Threshold
    new Setting(containerEl)
      .setName('Focus Similarity Threshold')
      .setDesc('Minimum vector similarity score (0.30 to 0.85) for semantic relationship discovery.')
      .addSlider((slider) =>
        slider
          .setLimits(0.3, 0.85, 0.05)
          .setValue(this.plugin.settings.focusSimilarityThreshold)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.focusSimilarityThreshold = val;
            await this.plugin.saveSettings();
            this.plugin.refreshView();
          })
      );

    // 4. Cluster Polygon Hull Opacity
    new Setting(containerEl)
      .setName('Cluster Polygon Hull Opacity')
      .setDesc('Fill opacity for semi-transparent cluster hulls (0.01 to 0.20).')
      .addSlider((slider) =>
        slider
          .setLimits(0.01, 0.2, 0.01)
          .setValue(this.plugin.settings.hullOpacity)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.hullOpacity = val;
            await this.plugin.saveSettings();
            this.plugin.refreshView();
          })
      );

    // 5. Default Graph Mode
    new Setting(containerEl)
      .setName('Default Graph Mode')
      .setDesc('Primary mode used for relationship discovery.')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('neighborhood', 'Neighborhood (Semantic + Links + Tags)')
          .addOption('semantic', 'Semantic Only (Vector Similarity)')
          .addOption('links', 'Links Only (WikiLinks & Backlinks)')
          .setValue(this.plugin.settings.graphMode)
          .onChange(async (val) => {
            this.plugin.settings.graphMode = val as GraphMode;
            await this.plugin.saveSettings();
            this.plugin.refreshView();
          })
      );
  }
}
