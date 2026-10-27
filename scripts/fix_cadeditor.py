import sys
import re

file_path = r'e:\2d alyout\frontend\src\components\CAD\CADEditor.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace map(e => ...) with map((e): CADEntity => ...) and append as <Type>
# Wall thickness
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, properties: { ...e.properties, thickness: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, properties: { ...(e as WallEntity).properties, thickness: val } } as WallEntity : e)"
)

# Wall length
content = content.replace(
    "const newEntities = entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...geom, x2: newX2, y2: newY2 } } : e);",
    "const newEntities = entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...geom, x2: newX2, y2: newY2 } } as WallEntity : e);"
)

# Column Width
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as ColumnEntity).geometry, width: val } } as ColumnEntity : e)"
)

# Column Depth
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as ColumnEntity).geometry, height: val } } as ColumnEntity : e)"
)

# Column Projection
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, properties: { ...e.properties, inwardProjection: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, properties: { ...(e as ColumnEntity).properties, inwardProjection: val } } as ColumnEntity : e)"
)

# Column X
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, x: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as ColumnEntity).geometry, x: val } } as ColumnEntity : e)"
)

# Column Y
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, y: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as ColumnEntity).geometry, y: val } } as ColumnEntity : e)"
)

# Door Width
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as DoorEntity).geometry, width: val } } as DoorEntity : e)"
)

# Door Height
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as DoorEntity).geometry, height: val } } as DoorEntity : e)"
)

# Door Frame
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, properties: { ...e.properties, frameThickness: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, properties: { ...(e as DoorEntity).properties, frameThickness: val } } as DoorEntity : e)"
)

# Window Width
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as WindowEntity).geometry, width: val } } as WindowEntity : e)"
)

# Window Height
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as WindowEntity).geometry, height: val } } as WindowEntity : e)"
)

# Rack Type
content = content.replace(
    "entities.map(item => item.id === selectedEntity.id ? { ...item, properties: { ...item.properties, rackType: val } } : item)",
    "entities.map((item): CADEntity => item.id === selectedEntity.id ? { ...item, properties: { ...(item as RackEntity).properties, rackType: val } } as RackEntity : item)"
)

# Rack Length
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as RackEntity).geometry, width: val } } as RackEntity : e)"
)

# Rack Depth
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, depth: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as RackEntity).geometry, depth: val } } as RackEntity : e)"
)

# Rack Height
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as RackEntity).geometry, height: val } } as RackEntity : e)"
)

# Shutter Width
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as ShutterEntity).geometry, width: val } } as ShutterEntity : e)"
)
# Shutter Height
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as ShutterEntity).geometry, height: val } } as ShutterEntity : e)"
)

# Glass gate (same branch as shutter, but let's just do any entity since it's merged)
content = content.replace(
    "updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e), 'Update Width')",
    "updateEntitiesWithHistory(entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as any).geometry, width: val } } as any : e), 'Update Width')"
)
content = content.replace(
    "updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e), 'Update Height')",
    "updateEntitiesWithHistory(entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...(e as any).geometry, height: val } } as any : e), 'Update Height')"
)

# Partition Thickness
content = content.replace(
    "entities.map(e => e.id === selectedEntity.id ? { ...e, properties: { ...e.properties, thickness: val } } : e)",
    "entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, properties: { ...(e as PartitionEntity).properties, thickness: val } } as PartitionEntity : e)"
)

# Partition Length
content = content.replace(
    "updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...geom, x2: newX2, y2: newY2 } } : e), 'Update Partition Length');",
    "updateEntitiesWithHistory(entities.map((e): CADEntity => e.id === selectedEntity.id ? { ...e, geometry: { ...geom, x2: newX2, y2: newY2 } } as PartitionEntity : e), 'Update Partition Length');"
)


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Replaced types successfully.')
