import { polygonHull } from 'd3-polygon';
import { ClusterGroup } from '../types';
import tinycolor from 'tinycolor2';

export class HullRenderer {
  /**
   * Render convex hulls / polygons per cluster on Canvas 2D context.
   */
  public drawHulls(
    ctx: CanvasRenderingContext2D,
    clusters: Map<string, ClusterGroup>,
    globalOpacity: number = 0.07,
    padding: number = 18
  ): void {
    clusters.forEach((cluster) => {
      const nodes = cluster.nodes.filter((n) => n.x !== undefined && n.y !== undefined);
      if (nodes.length === 0) return;

      const fillColor = tinycolor(cluster.color).setAlpha(globalOpacity).toRgbString();
      const strokeColor = tinycolor(cluster.color).setAlpha(globalOpacity * 2.5).toRgbString();

      ctx.save();
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1;

      if (nodes.length === 1) {
        // Case A: 1 Node -> Circle Hull
        const n = nodes[0];
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, 22, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
      } else if (nodes.length === 2) {
        // Case B: 2 Nodes -> Capsule Hull
        const [n1, n2] = nodes;
        const dx = n2.x! - n1.x!;
        const dy = n2.y! - n1.y!;
        const angle = Math.atan2(dy, dx);
        const dist = Math.sqrt(dx * dx + dy * dy);
        const radius = 18;

        ctx.beginPath();
        ctx.arc(n1.x!, n1.y!, radius, angle + Math.PI / 2, angle - Math.PI / 2);
        ctx.arc(n2.x!, n2.y!, radius, angle - Math.PI / 2, angle + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        // Case C: 3+ Nodes -> Convex Hull with Smooth Curves
        const points: [number, number][] = nodes.map((n) => [n.x!, n.y!]);
        const hull = polygonHull(points);

        if (hull && hull.length >= 3) {
          const centroid = this.getCentroid(hull);
          const expandedPoints = hull.map(([x, y]) => {
            const dx = x - centroid[0];
            const dy = y - centroid[1];
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            return [
              x + (dx / dist) * padding,
              y + (dy / dist) * padding,
            ] as [number, number];
          });

          ctx.beginPath();
          const first = expandedPoints[0];
          ctx.moveTo(first[0], first[1]);

          for (let i = 0; i < expandedPoints.length; i++) {
            const p1 = expandedPoints[i];
            const p2 = expandedPoints[(i + 1) % expandedPoints.length];
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
