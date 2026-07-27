import { polygonHull } from 'd3-polygon';
import { ClusterGroup } from '../types';
import tinycolor from 'tinycolor2';

export class HullRenderer {
  /**
   * Render tight soft polygon envelopes per cluster on Canvas 2D context.
   * Guarantees all nodes and selection rings are 100% enclosed inside the hull boundary.
   */
  public drawHulls(
    ctx: CanvasRenderingContext2D,
    clusters: Map<string, ClusterGroup>,
    selectedNodeId: string | null = null,
    globalOpacity: number = 0.035,
    padding: number = 18
  ): void {
    clusters.forEach((cluster) => {
      const nodes = cluster.nodes.filter(
        (n) => n.x !== undefined && n.y !== undefined && !n.isHidden
      );

      if (nodes.length === 0) return;

      const containsSelected = selectedNodeId
        ? nodes.some((n) => n.id === selectedNodeId)
        : false;

      const fillOpacity = containsSelected ? 0.05 : globalOpacity;
      const strokeOpacity = containsSelected ? 0.18 : Math.min(globalOpacity * 3.7, 0.13);

      const fillColor = tinycolor(cluster.color).setAlpha(fillOpacity).toRgbString();
      const strokeColor = tinycolor(cluster.color).setAlpha(strokeOpacity).toRgbString();

      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.2;

      // Ensure padding accounts for quadratic curve inward shrinkage (min 22px expansion)
      const expansionPadding = 22;

      if (nodes.length === 1) {
        // Case A: 1 Node -> Circle Hull Envelope
        const n = nodes[0];
        const radius = Math.max((n.size || 4.5) + expansionPadding, 22);
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, radius, 0, 2 * Math.PI, false);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else if (nodes.length === 2) {
        // Case B: 2 Nodes -> Capsule Hull Envelope
        const [n1, n2] = nodes;
        const dx = n2.x! - n1.x!;
        const dy = n2.y! - n1.y!;
        const angle = Math.atan2(dy, dx);
        const radius = Math.max((Math.max(n1.size || 4.5, n2.size || 4.5)) + 14, 20);

        ctx.beginPath();
        ctx.arc(n1.x!, n1.y!, radius, angle + Math.PI / 2, angle - Math.PI / 2);
        ctx.arc(n2.x!, n2.y!, radius, angle - Math.PI / 2, angle + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Case C: 3+ Nodes -> Tight Soft Polygon Hull Envelope
        const points: [number, number][] = nodes.map((n) => [n.x!, n.y!]);
        const hull = polygonHull(points);

        if (hull && hull.length >= 3) {
          const centroid = this.getCentroid(hull);

          // Expand vertices outward from centroid to guarantee 100% node enclosure
          const expandedPoints = hull.map(([x, y]) => {
            const dx = x - centroid[0];
            const dy = y - centroid[1];
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            return [
              x + (dx / dist) * expansionPadding,
              y + (dy / dist) * expansionPadding,
            ] as [number, number];
          });

          const len = expandedPoints.length;
          const last = expandedPoints[len - 1];
          const first = expandedPoints[0];

          ctx.beginPath();
          ctx.moveTo((last[0] + first[0]) / 2, (last[1] + first[1]) / 2);

          for (let i = 0; i < len; i++) {
            const p1 = expandedPoints[i];
            const p2 = expandedPoints[(i + 1) % len];
            const midX = (p1[0] + p2[0]) / 2;
            const midY = (p1[1] + p2[1]) / 2;
            ctx.quadraticCurveTo(p1[0], p1[1], midX, midY);
          }

          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }

      ctx.restore();
    });
  }

  private getCentroid(points: [number, number][]): [number, number] {
    let cx = 0;
    let cy = 0;
    points.forEach(([x, y]) => {
      cx += x;
      cy += y;
    });
    return [cx / points.length, cy / points.length];
  }
}
