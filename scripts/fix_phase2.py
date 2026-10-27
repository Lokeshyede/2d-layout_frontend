import re
import os

types_path = "src/cad/types/index.ts"
with open(types_path, "r", encoding="utf-8") as f:
    t_content = f.read()

if "anchorStart: Point2D;" not in t_content:
    t_content = t_content.replace(
        "startPoint: Point2D;\n  endPoint: Point2D;",
        "startPoint: Point2D;\n  endPoint: Point2D;\n  anchorStart: Point2D;\n  anchorEnd: Point2D;"
    )
    with open(types_path, "w", encoding="utf-8") as f:
        f.write(t_content)


manager_path = "src/cad/dimensions/DimensionManager.ts"
with open(manager_path, "r", encoding="utf-8") as f:
    m_content = f.read()

# 1. Update createDimensionItem to accept and set anchorStart/End
create_regex = r"(private createDimensionItem\(params: any\): DimensionItem \{[\s\S]*?return \{[\s\S]*?priority: params\.priority \|\| 1,\n)(.*?)\};\n  \})"

def replace_create(m):
    return m.group(1) + "      anchorStart: params.anchorStart || params.startPoint,\n      anchorEnd: params.anchorEnd || params.endPoint,\n" + m.group(2) + "};\n  }"

m_content = re.sub(create_regex, replace_create, m_content)

# 2. Fix BUG-007 Redundant Wall Segments
segment_loop_regex = r"(let cutPoints = \[0, wallLen\];\n\s*for \(const obj of attached\) \{[\s\S]*?\}\n\s*cutPoints = \[\.\.\.new Set\(cutPoints\)\]\.sort\(\(a,b\) => a - b\);\n\s*for \(let i = 0; i < cutPoints\.length - 1; i\+\+\) \{)"

segment_loop_repl = """let cutPoints = [0, wallLen];
        let objectSpans: {start: number, end: number}[] = [];
        for (const obj of attached) {
           const center = { x: (obj as any).geometry.x, y: (obj as any).geometry.y };
           let t = 0;
           if (isHoriz) t = Math.abs(center.x - p1.x);
           else if (isVert) t = Math.abs(center.y - p1.y);
           else {
             const dx = p2.x - p1.x; const dy = p2.y - p1.y;
             const len = Math.sqrt(dx*dx + dy*dy);
             t = ((center.x - p1.x)*dx + (center.y - p1.y)*dy) / len;
           }
           
           const ow = (obj as any).geometry.width || 24;
           const sT = Math.max(0, t - ow/2);
           const eT = Math.min(wallLen, t + ow/2);
           cutPoints.push(sT);
           cutPoints.push(eT);
           objectSpans.push({ start: sT, end: eT });
        }
        
        cutPoints = [...new Set(cutPoints)].sort((a,b) => a - b);
        
        for (let i = 0; i < cutPoints.length - 1; i++) {
           const startT = cutPoints[i];
           const endT = cutPoints[i+1];
           const segLen = endT - startT;
           if (segLen < 1) continue;
           
           const isObjectFootprint = objectSpans.some(span => Math.abs(span.start - startT) < 1 && Math.abs(span.end - endT) < 1);
           if (isObjectFootprint) continue;"""

m_content = re.sub(segment_loop_regex, segment_loop_repl, m_content)

# 3. Fix BUG-004 Dynamic Lane Allocation in solveDimensionCollisions
collision_regex = r"private solveDimensionCollisions\(dims: DimensionItem\[\]\): DimensionItem\[\] \{[\s\S]*?\n  \}"

new_collision = """private solveDimensionCollisions(dims: DimensionItem[]): DimensionItem[] {
    const spacing = this.config.laneSpacingInches;
    
    // Sort by priority descending. Highest priority gets first pick (lane 1).
    const sorted = [...dims].sort((a,b) => b.priority - a.priority);
    const finalDims: DimensionItem[] = [];
    
    for (const dim of sorted) {
      let currentLane = 1;
      let collides = true;
      
      const dx = dim.anchorEnd.x - dim.anchorStart.x;
      const dy = dim.anchorEnd.y - dim.anchorStart.y;
      const w = Math.abs(dx) + 30;
      const h = Math.abs(dy) + 30;
      
      while (collides) {
         let pushDist = this.config.baseOffsetInches + (currentLane - 1) * spacing;
         if (dim.type === 'column_inward' || dim.offsetDistance < 0) {
           pushDist = -pushDist;
         }
         if (dim.type === 'rack') {
           pushDist = (dim.offsetDistance > 0 ? 1 : -1) * (12 + (currentLane - 1) * spacing);
         }
         
         const perp = perpendicularVector(dim.anchorStart, dim.anchorEnd, pushDist);
         const mid = midpoint(dim.anchorStart, dim.anchorEnd);
         const candidateLabel = { x: mid.x + perp.x, y: mid.y + perp.y };
         
         const bw = Math.max(w, 40);
         const bh = Math.max(h, 40);
         const candidateBox = {
           minX: candidateLabel.x - bw/2, maxX: candidateLabel.x + bw/2,
           minY: candidateLabel.y - bh/2, maxY: candidateLabel.y + bh/2
         };
         
         let hit = false;
         for (const fd of finalDims) {
            if (fd.orientation === dim.orientation) {
               if (!(candidateBox.maxX < fd.boundingBox.minX || candidateBox.minX > fd.boundingBox.maxX ||
                     candidateBox.maxY < fd.boundingBox.minY || candidateBox.minY > fd.boundingBox.maxY)) {
                  hit = true;
                  break;
               }
            }
         }
         
         if (!hit) {
           collides = false;
           dim.lane = currentLane;
           dim.labelPoint = candidateLabel;
           dim.boundingBox = candidateBox;
           dim.startPoint = { x: dim.anchorStart.x + perp.x, y: dim.anchorStart.y + perp.y };
           dim.endPoint = { x: dim.anchorEnd.x + perp.x, y: dim.anchorEnd.y + perp.y };
         } else {
           currentLane++;
         }
      }
      finalDims.push(dim);
    }
    return finalDims;
  }"""

m_content = re.sub(collision_regex, new_collision, m_content)

with open(manager_path, "w", encoding="utf-8") as f:
    f.write(m_content)


renderer_path = "src/cad/rendering/CADRenderer.ts"
with open(renderer_path, "r", encoding="utf-8") as f:
    r_content = f.read()

# 4. Fix BUG-002 Floating Extension Lines (CADRenderer.ts)
# Find where drawDimension draws the extension lines and update it to use dim.anchorStart/anchorEnd
draw_dim_regex = r"(private drawDimension\(dim: DimensionItem\) \{[\s\S]*?let dy = p2\.y - p1\.y;)"

new_draw_dim_start = """private drawDimension(dim: DimensionItem) {
    const { ctx, viewport } = this;
    const p1 = viewport.worldToScreen(dim.startPoint);
    const p2 = viewport.worldToScreen(dim.endPoint);
    const anchor1 = viewport.worldToScreen(dim.anchorStart);
    const anchor2 = viewport.worldToScreen(dim.anchorEnd);
    const labelP = viewport.worldToScreen(dim.labelPoint);

    ctx.save();
    ctx.strokeStyle = '#b91c1c';
    ctx.fillStyle = '#b91c1c';
    ctx.lineWidth = 1;

    let lineStart = { x: 0, y: 0 };
    let lineEnd = { x: 0, y: 0 };
    
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;"""

r_content = re.sub(draw_dim_regex, new_draw_dim_start, r_content)

# Update extension line logic
# Replace ctx.moveTo(p1.x, p1.y) with ctx.moveTo(anchor1.x, anchor1.y)
# Replace ctx.moveTo(p2.x, p2.y) with ctx.moveTo(anchor2.x, anchor2.y)

ext_lines_regex = r"(if \(dim\.orientation === 'horizontal'\) \{[\s\S]*?\} else \{ // aligned\n[\s\S]*?ctx\.stroke\(\);\n    \})"

def replace_ext_lines(m):
    body = m.group(1)
    body = body.replace("moveTo(p1.x, p1.y)", "moveTo(anchor1.x, anchor1.y)")
    body = body.replace("moveTo(p2.x, p2.y)", "moveTo(anchor2.x, anchor2.y)")
    return body

r_content = re.sub(ext_lines_regex, replace_ext_lines, r_content)

with open(renderer_path, "w", encoding="utf-8") as f:
    f.write(r_content)

print("Phase 2 fixes applied.")
