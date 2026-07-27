# Smart Cluster Graph

A folder-based cluster graph view plugin for [Obsidian](https://obsidian.md). It organizes your vault notes into distinct community clusters with soft convex hulls, line-crossing avoidance, and real-time node search.

![Smart Cluster Graph Demo](./Demo.png)

## Features

- 🏝️ **Community Clusters**: Groups notes into clean topic clusters with soft convex hulls.
- 🌉 **Strongest Bridge Links**: Displays key cross-cluster bridge relationships without web clutter.
- ↪️ **Line Crossing Avoidance**: Curves cross-cluster links smoothly around intermediate hulls.
- 🔍 **Live Node Search**: Search and highlight notes directly within the graph view.
- 🎯 **Active Note Tracking**: Automatically syncs with your currently open Obsidian note.

## Usage

- **Click Node**: Select node.
- **Double Click Node**: Open note in Obsidian workspace.
- **Right Click Node**: Open context menu (Open note, Open in new tab, Copy link).
- **Search Bar**: Type to filter and highlight matching nodes in real time.
- **Pan & Zoom**: Drag canvas to pan; scroll wheel to zoom around screen center.

## Installation

### Community Plugins
1. Open Obsidian **Settings** → **Community plugins**.
2. Search for `Smart Cluster Graph`.
3. Click **Install**, then **Enable**.

### Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the latest [Release](https://github.com/comedianhhh/obsidian-smart-cluster-graph/releases).
2. Copy files into your vault's `.obsidian/plugins/smart-cluster-graph/` directory.
3. Reload Obsidian and enable the plugin in settings.

## License

[MIT](LICENSE)
