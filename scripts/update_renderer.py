import re

file_path = "src/cad/rendering/CADRenderer.ts"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update the render switch block
render_switch_pattern = r"(case 'column':\n\s+)this\.drawColumn\(ent,\s*isSelected\);\n\s+break;"
render_switch_replacement = r"\1this.drawColumn(ent, isSelected, params.entities);\n          break;"
content = re.sub(render_switch_pattern, render_switch_replacement, content)

# 2. Update drawColumn
draw_column_pattern = r"(private drawColumn\(col:\s*CADEntity[\s\S]*?ctx\.restore\(\);\n  \})"

new_draw_column = """  private drawColumn(col: any, isSelected: boolean, entities: CADEntity[]) {
    if (col.properties.columnType === 'free') {
      this.drawFreeColumn(col, isSelected);
    } else {
      this.drawWallColumn(col, isSelected, entities);
    }
  }

  private drawFreeColumn(col: any, isSelected: boolean) {
    const { ctx, viewport } = this;
    const center = viewport.worldToScreen({ x: col.geometry.x, y: col.geometry.y });
    const cw = (col.geometry.width || 24) * viewport.zoom;
    const ch = (col.geometry.height || 24) * viewport.zoom;

    ctx.save();
    const x = center.x - cw / 2;
    const y = center.y - ch / 2;

    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.strokeRect(x - 3, y - 3, cw + 6, ch + 6);
    }

    ctx.fillStyle = '#94a3b8'; // Lighter gray for free column
    ctx.fillRect(x, y, cw, ch);

    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, cw, ch);

    if (cw >= 20) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('COL', center.x, center.y);
    }

    ctx.restore();
  }

  private drawWallColumn(col: any, isSelected: boolean, entities: CADEntity[]) {
    const { ctx, viewport } = this;
    const wall = entities.find(e => e.id === col.properties.attachedWallId) as any;
    
    let normal = { x: 0, y: 1 }; // Default down
    let rot = 0;
    
    if (wall) {
      // Find room bounds to get room center
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const w of entities) {
        if (w.type === 'wall' || w.type === 'partition') {
          const g = (w as any).geometry;
          minX = Math.min(minX, g.x1, g.x2);
          maxX = Math.max(maxX, g.x1, g.x2);
          minY = Math.min(minY, g.y1, g.y2);
          maxY = Math.max(maxY, g.y1, g.y2);
        }
      }
      const rcX = (minX + maxX) / 2;
      const rcY = (minY + maxY) / 2;
      
      const p1 = { x: wall.geometry.x1, y: wall.geometry.y1 };
      const p2 = { x: wall.geometry.x2, y: wall.geometry.y2 };
      const isHoriz = Math.abs(p1.y - p2.y) < 1;
      const isVert = Math.abs(p1.x - p2.x) < 1;
      
      let offsetSign = 1;
      const mid = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 };
      if (isHoriz) {
        offsetSign = mid.y <= rcY ? 1 : -1; // 1 means down, -1 means up
      } else if (isVert) {
        offsetSign = mid.x <= rcX ? 1 : -1; // 1 means right, -1 means left
      }
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      normal = { x: -(dy/len) * offsetSign, y: (dx/len) * offsetSign };
      
      // Calculate rotation for drawing
      rot = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    }
    
    const center = viewport.worldToScreen({ x: col.geometry.x, y: col.geometry.y });
    const cw = (col.geometry.width || 24) * viewport.zoom;
    const cDepth = (col.geometry.height || 24) * viewport.zoom; // Physical depth
    const proj = (col.properties.inwardProjection || 24) * viewport.zoom;
    
    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.rotate(rot);
    
    // We want the width to be along the wall (X axis).
    // The projection is perpendicular (Y axis).
    // offsetSign tells us which way is inward (down or up relative to wall vector)
    // Wait, the normal we calculated was absolute. 
    // Since we rotated by the wall's angle, the wall is horizontal.
    // The room center is either above or below this local X axis.
    // Let's just use `proj` in the Y axis. But which way?
    // We need local Y direction that points towards room center.
    let localYDir = 1; 
    if (wall) {
       // Convert room center to local coordinates relative to wall mid
       // Not strictly needed, we just need to know if normal points 'down' or 'up' in local space.
       // The perpendicular vector in local space is (0, 1).
       // Rotate (0, 1) by rot: x = -sin(rot), y = cos(rot).
       // If dot product with normal is positive, localYDir = 1, else -1.
       const localNx = -Math.sin(rot);
       const localNy = Math.cos(rot);
       const dot = localNx * normal.x + localNy * normal.y;
       localYDir = dot > 0 ? 1 : -1;
    }

    const startY = localYDir === 1 ? - (cDepth - proj) : -proj;
    
    if (isSelected) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.strokeRect(-cw/2 - 3, startY - 3, cw + 6, cDepth + 6);
    }

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-cw/2, startY, cw, cDepth);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    ctx.strokeRect(-cw/2, startY, cw, cDepth);

    ctx.strokeStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(-cw/2, startY);
    ctx.lineTo(cw/2, startY + cDepth);
    ctx.moveTo(cw/2, startY);
    ctx.lineTo(-cw/2, startY + cDepth);
    ctx.stroke();

    if (cw >= 20) {
      ctx.save();
      // Keep text upright
      ctx.rotate(-rot);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Center of the column
      const cy = startY + cDepth/2;
      // Rotate cy back to upright
      const tx = cy * Math.sin(rot);
      const ty = cy * Math.cos(rot);
      ctx.fillText('W-COL', tx, ty);
      ctx.restore();
    }

    ctx.restore();
  }"""

content = re.sub(draw_column_pattern, new_draw_column, content, count=1)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated CADRenderer.ts")
