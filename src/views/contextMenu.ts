import { App, Menu, TFile } from 'obsidian';
import { GraphNode } from '../types';

export interface ContextMenuCallbacks {
  onOpenNote: (node: GraphNode, inNewTab: boolean) => void;
  onSetCenter: (node: GraphNode) => void;
  onTogglePin: (node: GraphNode) => void;
  onHideNode: (node: GraphNode) => void;
}

export function showNodeContextMenu(
  event: MouseEvent,
  node: GraphNode,
  app: App,
  callbacks: ContextMenuCallbacks
): void {
  event.preventDefault();
  const menu = new Menu();

  menu.addItem((item) => {
    item
      .setTitle('Open note')
      .setIcon('document')
      .onClick(() => callbacks.onOpenNote(node, false));
  });

  menu.addItem((item) => {
    item
      .setTitle('Open in new tab')
      .setIcon('file-plus')
      .onClick(() => callbacks.onOpenNote(node, true));
  });

  menu.addSeparator();

  menu.addItem((item) => {
    item
      .setTitle('Set as center')
      .setIcon('crosshair')
      .onClick(() => callbacks.onSetCenter(node));
  });

  menu.addItem((item) => {
    item
      .setTitle(node.isPinned ? 'Unpin node' : 'Pin node')
      .setIcon(node.isPinned ? 'pin-off' : 'pin')
      .onClick(() => callbacks.onTogglePin(node));
  });

  menu.addItem((item) => {
    item
      .setTitle('Hide node')
      .setIcon('eye-off')
      .onClick(() => callbacks.onHideNode(node));
  });

  menu.addSeparator();

  menu.addItem((item) => {
    item
      .setTitle('Copy Obsidian link')
      .setIcon('link')
      .onClick(() => {
        const link = `[[${node.title}]]`;
        navigator.clipboard.writeText(link);
      });
  });

  menu.showAtPosition({ x: event.clientX, y: event.clientY });
}
