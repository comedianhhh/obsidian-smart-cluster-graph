import { App, Menu } from 'obsidian';
import { GraphNode } from '../types';

export interface ContextMenuCallbacks {
  onOpenNote: (node: GraphNode, inNewTab: boolean) => void;
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
      .setTitle('Copy Obsidian link')
      .setIcon('link')
      .onClick(() => {
        const link = `[[${node.title}]]`;
        void navigator.clipboard.writeText(link);
      });
  });

  menu.showAtMouseEvent(event);
}
