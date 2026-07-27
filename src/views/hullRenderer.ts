import { polygonHull } from 'd3-polygon';
import { ClusterGroup, GraphNode } from '../types';
import tinycolor from 'tinycolor2';

export class HullRenderer {
  /**
   * Render convex hulls / polygons around node clusters on the Canvas 2D context.
   */
  public drawHulls(
    ctx: CanvasRenderingContext2D,
    clusters: Map<string, ClusterGroup>,
    globalOpacity: number = 0.15,
    padding: number = 25
  ): void {
    clusters.forEach((cluster) => {
      const nodes = cluster.nodes.filter((n) => n.x !== undefined && n.y !== undefined);
      if (nodes.length < 3) return; // Polygon hull requires at least 3 points

      // Extract [x, y] coordinates
      const points: [number, number][] = nodes.map((n) => [n.x!, n.y!]);

      // Compute convex hull using d3-polygon
      const hull = polygonHull(points);
      if (!hull || hull.length < 3) return;

      // Expand hull points outward by padding
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

      // Draw smooth rounded polygon hull
      ctx.save();
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

      // Style polygon fill and stroke
      const fillColor = tinycolor(cluster.color).setAlpha(globalOpacity).toRgbString();
      const strokeColor = tinycolor(cluster.color).setAlpha(globalOpacity * 2.5).toRgbString();

      ctx.fillStyle = fillColor;
      ctx.fill();

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();

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
