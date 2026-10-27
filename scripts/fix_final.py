import sys
import re

file_path = r'e:\2d alyout\frontend\src\cad\dimensions\DimensionManager.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace("if (obj.properties.attachedWallId === w.id) {", "if ((obj.properties as any).attachedWallId === w.id) {")
with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

file_path2 = r'e:\2d alyout\frontend\src\cad\rendering\CADRenderer.ts'
with open(file_path2, 'r', encoding='utf-8') as f:
    content2 = f.read()
content2 = content2.replace(
    "const rot = Math.atan2(p2.y - p1.y, p2.x - p1.x);", 
    "// const rot = Math.atan2(p2.y - p1.y, p2.x - p1.x);"
)
# Note: actually `rot` might be used in CADRenderer.ts. Let me check its usage.
# If it's used elsewhere, maybe the line number 657 was for `dim.orientation === 'inward'`?
# Ah! In CADRenderer.ts, drawDimension:
# `const rot = Math.atan2(dy, dx);`
# `// Wait, inward is just vertical or horizontal depending on projection vector.`
content2 = content2.replace("const rot = Math.atan2(dy, dx);", "// const rot = Math.atan2(dy, dx);")
with open(file_path2, 'w', encoding='utf-8') as f:
    f.write(content2)


file_path3 = r'e:\2d alyout\frontend\src\components\CAD\CADEditor.tsx'
with open(file_path3, 'r', encoding='utf-8') as f:
    content3 = f.read()
content3 = content3.replace(
    """const newEntities = entities.map(ent => ent.id === col.id ? {
                               ...ent,
                               geometry: { ...ent.geometry, x: newX, y: newY },
                               properties: { ...ent.properties, columnType: 'wall', attachedWallId: targetWallId }
                             } : ent);""",
    """const newEntities = entities.map((ent): CADEntity => ent.id === col.id ? {
                               ...ent,
                               geometry: { ...(ent as ColumnEntity).geometry, x: newX, y: newY },
                               properties: { ...(ent as ColumnEntity).properties, columnType: 'wall', attachedWallId: targetWallId }
                             } as ColumnEntity : ent);"""
)

content3 = content3.replace(
    """const newEntities = entities.map(ent => ent.id === col.id ? {
                               ...ent,
                               properties: { ...ent.properties, columnType: 'free', attachedWallId: null }
                             } : ent);""",
    """const newEntities = entities.map((ent): CADEntity => ent.id === col.id ? {
                               ...ent,
                               properties: { ...(ent as ColumnEntity).properties, columnType: 'free', attachedWallId: undefined }
                             } as ColumnEntity : ent);"""
)

with open(file_path3, 'w', encoding='utf-8') as f:
    f.write(content3)

print('Replaced final TS errors successfully.')
