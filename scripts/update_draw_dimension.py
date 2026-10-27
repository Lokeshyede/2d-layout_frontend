import re

file_path = "src/cad/rendering/CADRenderer.ts"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

draw_dim_pattern = r"(private drawDimension\(dim: DimensionItem\) \{[\s\S]*?\}\s*)$"

new_draw_dim = """  private drawDimension(dim: DimensionItem) {
    const { ctx, viewport } = this;
    const p1 = viewport.worldToScreen(dim.startPoint);
    const p2 = viewport.worldToScreen(dim.endPoint);
    const labelP = viewport.worldToScreen(dim.labelPoint);

    ctx.save();
    ctx.strokeStyle = '#b91c1c';
    ctx.fillStyle = '#b91c1c';
    ctx.lineWidth = 1;

    let lineStart = { x: 0, y: 0 };
    let lineEnd = { x: 0, y: 0 };
    
    // Calculate rotation and extension points
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    
    if (dim.orientation === 'horizontal') {
      lineStart = { x: p1.x, y: labelP.y };
      lineEnd = { x: p2.x, y: labelP.y };
      // Extension lines
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p1.x, labelP.y);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p2.x, labelP.y);
      ctx.stroke();
    } else if (dim.orientation === 'vertical') {
      lineStart = { x: labelP.x, y: p1.y };
      lineEnd = { x: labelP.x, y: p2.y };
      // Extension lines
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(labelP.x, p1.y);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(labelP.x, p2.y);
      ctx.stroke();
    } else if (dim.orientation === 'inward') {
      lineStart = { x: labelP.x, y: p1.y };
      lineEnd = { x: labelP.x, y: p2.y };
      // For inward, if it's horizontal we use Y labels, but projection is perpendicular to attached wall.
      // We'll calculate angle directly.
      const rot = Math.atan2(dy, dx);
      // Wait, inward is just vertical or horizontal depending on projection vector.
      // We will treat it generically by projecting to labelPoint vector.
      const lDx = labelP.x - (p1.x + p2.x)/2;
      const lDy = labelP.y - (p1.y + p2.y)/2;
      // We just draw direct from start/end to label line.
      lineStart = { x: p1.x + lDx, y: p1.y + lDy };
      lineEnd = { x: p2.x + lDx, y: p2.y + lDy };
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(lineStart.x, lineStart.y);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(lineEnd.x, lineEnd.y);
      ctx.stroke();
    } else { // aligned
      const lDx = labelP.x - (p1.x + p2.x)/2;
      const lDy = labelP.y - (p1.y + p2.y)/2;
      lineStart = { x: p1.x + lDx, y: p1.y + lDy };
      lineEnd = { x: p2.x + lDx, y: p2.y + lDy };
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(lineStart.x, lineStart.y);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(lineEnd.x, lineEnd.y);
      ctx.stroke();
    }

    // Dimension line
    ctx.beginPath();
    ctx.moveTo(lineStart.x, lineStart.y);
    ctx.lineTo(lineEnd.x, lineEnd.y);
    ctx.stroke();

    // Arrowheads
    const rot = Math.atan2(lineEnd.y - lineStart.y, lineEnd.x - lineStart.x);
    const arrowLen = 6;
    const arrowAngle = Math.PI / 6; // 30 degrees

    // Draw arrow at lineEnd
    ctx.beginPath();
    ctx.moveTo(lineEnd.x, lineEnd.y);
    ctx.lineTo(lineEnd.x - arrowLen * Math.cos(rot - arrowAngle), lineEnd.y - arrowLen * Math.sin(rot - arrowAngle));
    ctx.lineTo(lineEnd.x - arrowLen * Math.cos(rot + arrowAngle), lineEnd.y - arrowLen * Math.sin(rot + arrowAngle));
    ctx.closePath();
    ctx.fill();

    // Draw arrow at lineStart
    ctx.beginPath();
    ctx.moveTo(lineStart.x, lineStart.y);
    ctx.lineTo(lineStart.x + arrowLen * Math.cos(rot - arrowAngle), lineStart.y + arrowLen * Math.sin(rot - arrowAngle));
    ctx.lineTo(lineStart.x + arrowLen * Math.cos(rot + arrowAngle), lineStart.y + arrowLen * Math.sin(rot + arrowAngle));
    ctx.closePath();
    ctx.fill();

    // Dimension Text
    ctx.font = 'bold 10px JetBrains Mono, Inter, monospace';
    const textWidth = ctx.measureText(dim.formattedValue).width;
    const badgeW = textWidth + 8;
    const badgeH = 14;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(labelP.x - badgeW / 2, labelP.y - badgeH / 2, badgeW, badgeH);

    ctx.strokeStyle = '#fee2e2';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(labelP.x - badgeW / 2, labelP.y - badgeH / 2, badgeW, badgeH);

    ctx.fillStyle = '#991b1b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dim.formattedValue, labelP.x, labelP.y + 1);

    ctx.restore();
  }
}"""

content = re.sub(draw_dim_pattern, new_draw_dim, content, count=1, flags=re.MULTILINE)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated drawDimension with Arrowheads")
