import re

file_path = "src/cad/dimensions/DimensionManager.ts"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

dimension_block_pattern = r"(if\s*\(this\.config\.showColumnInwardDimensions\)\s*\{[\s\S]*?\}\s*\})"

new_dimension_block = """    if (this.config.showColumnInwardDimensions) {
      for (const col of columns) {
        const cx = col.geometry.x;
        const cy = col.geometry.y;
        const cw = col.geometry.width || 24;
        const ch = col.geometry.height || 24;
        const inwardProj = col.properties.inwardProjection || 24;
        const isSelected = col.id === selectedEntityId;

        if (col.properties.columnType === 'wall') {
           // Wall Column: Show Width and Inward Projection
           
           // Width dimension
           rawRequests.push(this.createDimensionItem({
             id: `dim_col_w_${col.id}`,
             entityId: col.id,
             startPoint: { x: cx - cw / 2, y: cy },
             endPoint: { x: cx + cw / 2, y: cy },
             value: cw,
             orientation: 'horizontal',
             lane: 0,
             priority: 8,
             type: 'column_width',
             offsetDistance: - (ch / 2 + 10),
             labelPoint: { x: cx, y: cy - ch / 2 - 12 },
           }));
           
           // Inward Projection
           rawRequests.push(this.createDimensionItem({
             id: `dim_col_proj_${col.id}`,
             entityId: col.id,
             startPoint: { x: cx, y: cy - inwardProj / 2 },
             endPoint: { x: cx, y: cy + inwardProj / 2 },
             value: inwardProj,
             orientation: 'inward',
             lane: 1,
             priority: 8,
             type: 'column_inward',
             offsetDistance: cw / 2 + 10,
             labelPoint: { x: cx + cw / 2 + 12, y: cy },
           }));
        } else if (col.properties.columnType === 'free') {
           // Free Column
           
           // Always show Width and Depth for Free column when selected (or normal)
           rawRequests.push(this.createDimensionItem({
             id: `dim_free_col_w_${col.id}`,
             entityId: col.id,
             startPoint: { x: cx - cw / 2, y: cy - ch / 2 },
             endPoint: { x: cx + cw / 2, y: cy - ch / 2 },
             value: cw,
             orientation: 'horizontal',
             lane: 0,
             priority: 8,
             type: 'column_width',
             offsetDistance: -10,
             labelPoint: { x: cx, y: cy - ch / 2 - 12 },
           }));
           
           rawRequests.push(this.createDimensionItem({
             id: `dim_free_col_d_${col.id}`,
             entityId: col.id,
             startPoint: { x: cx + cw / 2, y: cy - ch / 2 },
             endPoint: { x: cx + cw / 2, y: cy + ch / 2 },
             value: ch,
             orientation: 'vertical',
             lane: 0,
             priority: 8,
             type: 'column_inward',
             offsetDistance: 10,
             labelPoint: { x: cx + cw / 2 + 12, y: cy },
           }));

           const showFreeRef = isSelected || this.config.showTemporaryReferenceDimensions || overrideTempRefMode;
           if (showFreeRef && hasValidRoomBounds) {
             // Left Wall -> Column
             rawRequests.push(this.createDimensionItem({
               id: `dim_free_ref_l_${col.id}`,
               entityId: col.id,
               startPoint: { x: minX, y: cy },
               endPoint: { x: cx - cw / 2, y: cy },
               value: (cx - cw / 2) - minX,
               orientation: 'horizontal',
               lane: 1,
               priority: 3,
               type: 'segment',
               offsetDistance: 0,
               labelPoint: { x: (minX + cx - cw / 2) / 2, y: cy - 10 },
             }));

             // Right Wall -> Column
             rawRequests.push(this.createDimensionItem({
               id: `dim_free_ref_r_${col.id}`,
               entityId: col.id,
               startPoint: { x: cx + cw / 2, y: cy },
               endPoint: { x: maxX, y: cy },
               value: maxX - (cx + cw / 2),
               orientation: 'horizontal',
               lane: 1,
               priority: 3,
               type: 'segment',
               offsetDistance: 0,
               labelPoint: { x: ((cx + cw / 2) + maxX) / 2, y: cy - 10 },
             }));

             // Top Wall -> Column
             rawRequests.push(this.createDimensionItem({
               id: `dim_free_ref_t_${col.id}`,
               entityId: col.id,
               startPoint: { x: cx, y: minY },
               endPoint: { x: cx, y: cy - ch / 2 },
               value: (cy - ch / 2) - minY,
               orientation: 'vertical',
               lane: 1,
               priority: 3,
               type: 'segment',
               offsetDistance: 0,
               labelPoint: { x: cx + 10, y: (minY + cy - ch / 2) / 2 },
             }));

             // Bottom Wall -> Column
             rawRequests.push(this.createDimensionItem({
               id: `dim_free_ref_b_${col.id}`,
               entityId: col.id,
               startPoint: { x: cx, y: cy + ch / 2 },
               endPoint: { x: cx, y: maxY },
               value: maxY - (cy + ch / 2),
               orientation: 'vertical',
               lane: 1,
               priority: 3,
               type: 'segment',
               offsetDistance: 0,
               labelPoint: { x: cx + 10, y: ((cy + ch / 2) + maxY) / 2 },
             }));
           }
        }
      }
    }"""

content = re.sub(dimension_block_pattern, new_dimension_block, content, count=1)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated DimensionManager.ts")
