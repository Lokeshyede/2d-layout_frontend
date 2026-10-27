import os
import re

file_path = "src/components/CAD/CADEditor.tsx"

with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# Make sure DimensionInput is imported
if "import { DimensionInput }" not in content:
    content = content.replace(
        "import { DXFExporter }",
        "import { DXFExporter } from '../../cad/export/DXFExporter';\nimport { DimensionInput } from './DimensionInput';"
    )
    # Wait, earlier I replaced DXFExporter import correctly? Let's just do it dynamically
    if "import { DimensionInput }" not in content:
        content = content.replace(
            "import { SheetExporter } from '../../cad/export/SheetExporter';",
            "import { SheetExporter } from '../../cad/export/SheetExporter';\nimport { DimensionInput } from './DimensionInput';"
        )


new_props_block = """            {selectedEntity ? (
              <div className="space-y-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/80">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Type:</span>
                  <span className="font-mono font-bold text-retailfix-red-400 uppercase">{selectedEntity.type}</span>
                </div>

                {selectedEntity.type === 'wall' && (
                  <div className="space-y-3 mt-3">
                    <DimensionInput
                      label="Thickness"
                      valueInches={(selectedEntity as WallEntity).properties.thickness}
                      onApply={(val) => {
                        const newEntities = entities.map(e => e.id === selectedEntity.id ? { ...e, properties: { ...e.properties, thickness: val } } : e);
                        updateEntitiesWithHistory(newEntities, 'Update Wall Thickness');
                      }}
                    />
                    <DimensionInput
                      label="Length"
                      valueInches={distance((selectedEntity as WallEntity).geometry as any, {x: (selectedEntity as WallEntity).geometry.x2, y: (selectedEntity as WallEntity).geometry.y2})}
                      onApply={(val) => {
                        const geom = (selectedEntity as WallEntity).geometry;
                        const len = distance(geom as any, {x: geom.x2, y: geom.y2});
                        if (len === 0) return;
                        const scale = val / len;
                        const newX2 = geom.x1 + (geom.x2 - geom.x1) * scale;
                        const newY2 = geom.y1 + (geom.y2 - geom.y1) * scale;
                        const newEntities = entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...geom, x2: newX2, y2: newY2 } } : e);
                        updateEntitiesWithHistory(newEntities, 'Update Wall Length');
                      }}
                    />
                  </div>
                )}

                {selectedEntity.type === 'column' && (
                  <div className="space-y-3 mt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Type:</span>
                      <strong className="text-slate-200">{(selectedEntity as ColumnEntity).properties.columnType === 'wall' ? 'Wall Column' : 'Free Column'}</strong>
                    </div>
                    <DimensionInput
                      label="Width"
                      valueInches={(selectedEntity as ColumnEntity).geometry.width}
                      onApply={(val) => {
                        const newEntities = entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e);
                        updateEntitiesWithHistory(newEntities, 'Update Column Width');
                      }}
                    />
                    <DimensionInput
                      label="Depth"
                      valueInches={(selectedEntity as ColumnEntity).geometry.height}
                      onApply={(val) => {
                        const newEntities = entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e);
                        updateEntitiesWithHistory(newEntities, 'Update Column Depth');
                      }}
                    />
                    {(selectedEntity as ColumnEntity).properties.columnType === 'wall' && (
                      <DimensionInput
                        label="Under/Inward Projection"
                        valueInches={(selectedEntity as ColumnEntity).properties.inwardProjection}
                        onApply={(val) => {
                          const newEntities = entities.map(e => e.id === selectedEntity.id ? { ...e, properties: { ...e.properties, inwardProjection: val } } : e);
                          updateEntitiesWithHistory(newEntities, 'Update Column Projection');
                        }}
                      />
                    )}
                  </div>
                )}

                {selectedEntity.type === 'door' && (
                  <div className="space-y-3 mt-3">
                    <DimensionInput
                      label="Width"
                      valueInches={(selectedEntity as DoorEntity).geometry.width}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e), 'Update Door Width')}
                    />
                    <DimensionInput
                      label="Height"
                      valueInches={(selectedEntity as DoorEntity).geometry.height || 84}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e), 'Update Door Height')}
                    />
                    <DimensionInput
                      label="Frame Thickness"
                      valueInches={(selectedEntity as DoorEntity).properties.frameThickness || 2}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, properties: { ...e.properties, frameThickness: val } } : e), 'Update Door Frame')}
                    />
                  </div>
                )}

                {selectedEntity.type === 'window' && (
                  <div className="space-y-3 mt-3">
                    <DimensionInput
                      label="Width"
                      valueInches={(selectedEntity as WindowEntity).geometry.width}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e), 'Update Window Width')}
                    />
                    <DimensionInput
                      label="Height"
                      valueInches={(selectedEntity as WindowEntity).geometry.height || 48}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e), 'Update Window Height')}
                    />
                  </div>
                )}

                {selectedEntity.type === 'rack' && (
                  <div className="space-y-3 mt-3">
                    <div>
                      <span className="text-slate-400 block mb-1">Rack Category:</span>
                      <select
                        value={(selectedEntity as RackEntity).properties.rackType}
                        onChange={(e) => {
                          const val = e.target.value as any;
                          updateEntitiesWithHistory(entities.map(item => item.id === selectedEntity.id ? { ...item, properties: { ...item.properties, rackType: val } } : item), 'Change Rack Type');
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-white"
                      >
                        <option value="Center Gondola">Center Gondola</option>
                        <option value="Wall Rack">Wall Rack</option>
                        <option value="Corner Rack">Corner Rack</option>
                      </select>
                    </div>
                    <DimensionInput
                      label="Length"
                      valueInches={(selectedEntity as RackEntity).geometry.width}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e), 'Update Rack Length')}
                    />
                    <DimensionInput
                      label="Depth"
                      valueInches={(selectedEntity as RackEntity).geometry.depth}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, depth: val } } : e), 'Update Rack Depth')}
                    />
                    <DimensionInput
                      label="Height"
                      valueInches={(selectedEntity as RackEntity).geometry.height || 84}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e), 'Update Rack Height')}
                    />
                  </div>
                )}

                {(selectedEntity.type === 'shutter' || selectedEntity.type === 'glass_gate') && (
                  <div className="space-y-3 mt-3">
                    <DimensionInput
                      label="Width"
                      valueInches={(selectedEntity as ShutterEntity).geometry.width}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, width: val } } : e), 'Update Width')}
                    />
                    <DimensionInput
                      label="Height"
                      valueInches={(selectedEntity as ShutterEntity).geometry.height || 96}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...e.geometry, height: val } } : e), 'Update Height')}
                    />
                  </div>
                )}

                {selectedEntity.type === 'partition' && (
                  <div className="space-y-3 mt-3">
                    <DimensionInput
                      label="Thickness"
                      valueInches={(selectedEntity as PartitionEntity).properties.thickness}
                      onApply={(val) => updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, properties: { ...e.properties, thickness: val } } : e), 'Update Partition Thickness')}
                    />
                    <DimensionInput
                      label="Length"
                      valueInches={distance((selectedEntity as PartitionEntity).geometry as any, {x: (selectedEntity as PartitionEntity).geometry.x2, y: (selectedEntity as PartitionEntity).geometry.y2})}
                      onApply={(val) => {
                        const geom = (selectedEntity as PartitionEntity).geometry;
                        const len = distance(geom as any, {x: geom.x2, y: geom.y2});
                        if (len === 0) return;
                        const scale = val / len;
                        const newX2 = geom.x1 + (geom.x2 - geom.x1) * scale;
                        const newY2 = geom.y1 + (geom.y2 - geom.y1) * scale;
                        updateEntitiesWithHistory(entities.map(e => e.id === selectedEntity.id ? { ...e, geometry: { ...geom, x2: newX2, y2: newY2 } } : e), 'Update Partition Length');
                      }}
                    />
                  </div>
                )}

              </div>
            ) : ("""

pattern = re.compile(r"\{selectedEntity \? \([\s\S]*?\) : \(", re.MULTILINE)
content = pattern.sub(new_props_block, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated CADEditor.tsx successfully.")
