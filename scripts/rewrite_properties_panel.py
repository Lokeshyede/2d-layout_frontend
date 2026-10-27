import sys
import re

file_path = r'e:\2d alyout\frontend\src\components\CAD\CADEditor.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()


# 1. Update the useEffect render loop
old_use_effect = """  // Synchronize refs with state for callbacks
  useEffect(() => {
    entitiesRef.current = entities;
  }, [entities]);"""

new_use_effect = """  // Synchronize refs with state for callbacks
  useEffect(() => {
    entitiesRef.current = entities;
    renderScene(); // Force render when entities change
  }, [entities, renderScene]);"""
content = content.replace(old_use_effect, new_use_effect)

# 2. Add updateEntityProperty inside CADEditor (after updateEntitiesWithHistory)
old_update_entities = """  // 4. Update entities with History & Auto-Save
  const updateEntitiesWithHistory = useCallback((newEntities: CADEntity[], actionDesc?: string) => {
    setEntities(newEntities);
    historyRef.current.pushState(newEntities, actionDesc);
    triggerAutoSave(newEntities);
  }, [triggerAutoSave]);"""

new_update_entities = """  // 4. Update entities with History & Auto-Save
  const updateEntitiesWithHistory = useCallback((newEntities: CADEntity[], actionDesc?: string) => {
    setEntities(newEntities);
    historyRef.current.pushState(newEntities, actionDesc);
    triggerAutoSave(newEntities);
  }, [triggerAutoSave]);

  const updateEntityProperty = useCallback(<T extends CADEntity>(id: string, actionDesc: string, updater: (ent: T) => T) => {
    const newEntities = entitiesRef.current.map((e) => {
      if (e.id === id) {
        return updater(e as T) as CADEntity;
      }
      return e;
    });
    updateEntitiesWithHistory(newEntities, actionDesc);
  }, [updateEntitiesWithHistory]);"""

if "updateEntityProperty =" not in content:
    content = content.replace(old_update_entities, new_update_entities)


# 3. Fix Properties Panel to use updateEntityProperty
# Wall Thickness
content = re.sub(
    r"onApply=\{\(val\) => \{(?:\s*const newEntities.*?;)?\s*updateEntitiesWithHistory\(.*?, 'Update Wall Thickness'\);\s*\}\}",
    r"onApply={(val) => updateEntityProperty<WallEntity>(selectedEntity.id, 'Update Wall Thickness', (e) => ({ ...e, properties: { ...e.properties, thickness: val } }))}",
    content, flags=re.DOTALL
)

# Wall Length
content = re.sub(
    r"onApply=\{\(val\) => \{\s*const geom = \(selectedEntity as WallEntity\)\.geometry;.*?updateEntitiesWithHistory\(newEntities, 'Update Wall Length'\);\s*\}\}",
    r"""onApply={(val) => updateEntityProperty<WallEntity>(selectedEntity.id, 'Update Wall Length', (e) => {
                        const len = distance({x: e.geometry.x1, y: e.geometry.y1}, {x: e.geometry.x2, y: e.geometry.y2});
                        if (len === 0) return e;
                        const scale = val / len;
                        const newX2 = e.geometry.x1 + (e.geometry.x2 - e.geometry.x1) * scale;
                        const newY2 = e.geometry.y1 + (e.geometry.y2 - e.geometry.y1) * scale;
                        return { ...e, geometry: { ...e.geometry, x2: newX2, y2: newY2 } };
                      })}""",
    content, flags=re.DOTALL
)

# Column Type Switch Wall
content = re.sub(
    r"const newEntities = entities\.map\(\(ent\): CADEntity => ent\.id === col\.id \? \{.*?properties: \{ \.\.\.\(ent as ColumnEntity\)\.properties, columnType: 'wall', attachedWallId: targetWallId \}.*?\} as ColumnEntity : ent\);\s*updateEntitiesWithHistory\(newEntities, 'Change Column Type to Wall'\);",
    r"updateEntityProperty<ColumnEntity>(col.id, 'Change Column Type to Wall', (e) => ({ ...e, geometry: { ...e.geometry, x: newX, y: newY }, properties: { ...e.properties, columnType: 'wall', attachedWallId: targetWallId } }));",
    content, flags=re.DOTALL
)

# Column Type Switch Free
content = re.sub(
    r"const newEntities = entities\.map\(\(ent\): CADEntity => ent\.id === col\.id \? \{.*?properties: \{ \.\.\.\(ent as ColumnEntity\)\.properties, columnType: 'free', attachedWallId: undefined \}.*?\} as ColumnEntity : ent\);\s*updateEntitiesWithHistory\(newEntities, 'Change Column Type to Free'\);",
    r"updateEntityProperty<ColumnEntity>(col.id, 'Change Column Type to Free', (e) => ({ ...e, properties: { ...e.properties, columnType: 'free', attachedWallId: undefined } }));",
    content, flags=re.DOTALL
)

# Column Width
content = re.sub(
    r"onApply=\{\(val\) => \{(?:\s*const newEntities.*?;)?\s*updateEntitiesWithHistory\(.*?, 'Update Column Width'\);\s*\}\}",
    r"onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column Width', (e) => ({ ...e, geometry: { ...e.geometry, width: val } }))}",
    content, flags=re.DOTALL
)

# Column Depth
content = re.sub(
    r"onApply=\{\(val\) => \{(?:\s*const newEntities.*?;)?\s*updateEntitiesWithHistory\(.*?, 'Update Column Depth'\);\s*\}\}",
    r"onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column Depth', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}",
    content, flags=re.DOTALL
)

# Column Projection
content = re.sub(
    r"onApply=\{\(val\) => \{(?:\s*const newEntities.*?;)?\s*updateEntitiesWithHistory\(.*?, 'Update Column Projection'\);\s*\}\}",
    r"onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column Projection', (e) => ({ ...e, properties: { ...e.properties, inwardProjection: val } }))}",
    content, flags=re.DOTALL
)

# Column X
content = re.sub(
    r"onApply=\{\(val\) => \{(?:\s*const newEntities.*?;)?\s*updateEntitiesWithHistory\(.*?, 'Update Column X'\);\s*\}\}",
    r"onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column X', (e) => ({ ...e, geometry: { ...e.geometry, x: val } }))}",
    content, flags=re.DOTALL
)

# Column Y
content = re.sub(
    r"onApply=\{\(val\) => \{(?:\s*const newEntities.*?;)?\s*updateEntitiesWithHistory\(.*?, 'Update Column Y'\);\s*\}\}",
    r"onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column Y', (e) => ({ ...e, geometry: { ...e.geometry, y: val } }))}",
    content, flags=re.DOTALL
)

# Door Width
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Door Width'\)\}",
    r"onApply={(val) => updateEntityProperty<DoorEntity>(selectedEntity.id, 'Update Door Width', (e) => ({ ...e, geometry: { ...e.geometry, width: val } }))}",
    content, flags=re.DOTALL
)

# Door Height
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Door Height'\)\}",
    r"onApply={(val) => updateEntityProperty<DoorEntity>(selectedEntity.id, 'Update Door Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}",
    content, flags=re.DOTALL
)

# Door Frame
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Door Frame'\)\}",
    r"onApply={(val) => updateEntityProperty<DoorEntity>(selectedEntity.id, 'Update Door Frame', (e) => ({ ...e, properties: { ...e.properties, frameThickness: val } }))}",
    content, flags=re.DOTALL
)

# Window Width
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Window Width'\)\}",
    r"onApply={(val) => updateEntityProperty<WindowEntity>(selectedEntity.id, 'Update Window Width', (e) => ({ ...e, geometry: { ...e.geometry, width: val } }))}",
    content, flags=re.DOTALL
)

# Window Height
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Window Height'\)\}",
    r"onApply={(val) => updateEntityProperty<WindowEntity>(selectedEntity.id, 'Update Window Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}",
    content, flags=re.DOTALL
)

# Rack Type
content = re.sub(
    r"updateEntitiesWithHistory\(entities\.map\(.*?, 'Change Rack Type'\);",
    r"updateEntityProperty<RackEntity>(selectedEntity.id, 'Change Rack Type', (e) => ({ ...e, properties: { ...e.properties, rackType: val } }));",
    content, flags=re.DOTALL
)

# Rack Length
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Rack Length'\)\}",
    r"onApply={(val) => updateEntityProperty<RackEntity>(selectedEntity.id, 'Update Rack Length', (e) => ({ ...e, geometry: { ...e.geometry, width: val } }))}",
    content, flags=re.DOTALL
)

# Rack Depth
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Rack Depth'\)\}",
    r"onApply={(val) => updateEntityProperty<RackEntity>(selectedEntity.id, 'Update Rack Depth', (e) => ({ ...e, geometry: { ...e.geometry, depth: val } }))}",
    content, flags=re.DOTALL
)

# Rack Height
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Rack Height'\)\}",
    r"onApply={(val) => updateEntityProperty<RackEntity>(selectedEntity.id, 'Update Rack Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}",
    content, flags=re.DOTALL
)

# Shutter / Glass Gate Width
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Width'\)\}",
    r"onApply={(val) => updateEntityProperty<any>(selectedEntity.id, 'Update Width', (e) => ({ ...e, geometry: { ...e.geometry, width: val } }))}",
    content, flags=re.DOTALL
)

# Shutter / Glass Gate Height
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Height'\)\}",
    r"onApply={(val) => updateEntityProperty<any>(selectedEntity.id, 'Update Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}",
    content, flags=re.DOTALL
)

# Partition Thickness
content = re.sub(
    r"onApply=\{\(val\) => updateEntitiesWithHistory\(.*?, 'Update Partition Thickness'\)\}",
    r"onApply={(val) => updateEntityProperty<PartitionEntity>(selectedEntity.id, 'Update Partition Thickness', (e) => ({ ...e, properties: { ...e.properties, thickness: val } }))}",
    content, flags=re.DOTALL
)

# Partition Length
content = re.sub(
    r"onApply=\{\(val\) => \{\s*const geom = \(selectedEntity as PartitionEntity\)\.geometry;.*?updateEntitiesWithHistory\(.*?, 'Update Partition Length'\);\s*\}\}",
    r"""onApply={(val) => updateEntityProperty<PartitionEntity>(selectedEntity.id, 'Update Partition Length', (e) => {
                        const len = distance({x: e.geometry.x1, y: e.geometry.y1}, {x: e.geometry.x2, y: e.geometry.y2});
                        if (len === 0) return e;
                        const scale = val / len;
                        const newX2 = e.geometry.x1 + (e.geometry.x2 - e.geometry.x1) * scale;
                        const newY2 = e.geometry.y1 + (e.geometry.y2 - e.geometry.y1) * scale;
                        return { ...e, geometry: { ...e.geometry, x2: newX2, y2: newY2 } };
                      })}""",
    content, flags=re.DOTALL
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Updated properties panel in CADEditor.")
