import re

file_path = r'e:\2d alyout\frontend\src\components\CAD\CADEditor.tsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Helper block for position along wall
position_along_wall_jsx = """
                    {(() => {
                      const attachedWall = entities.find((e) => e.id === (selectedEntity as any).properties?.attachedWallId) as any;
                      if (attachedWall) {
                        const dist = Math.hypot((selectedEntity as any).geometry.x - attachedWall.geometry.x1, (selectedEntity as any).geometry.y - attachedWall.geometry.y1);
                        return (
                          <DimensionInput
                            label="Position Along Wall"
                            valueInches={dist}
                            onApply={(val) => {
                              const wallLen = Math.hypot(attachedWall.geometry.x2 - attachedWall.geometry.x1, attachedWall.geometry.y2 - attachedWall.geometry.y1);
                              if (wallLen === 0) return;
                              const ratio = val / wallLen;
                              const newX = attachedWall.geometry.x1 + (attachedWall.geometry.x2 - attachedWall.geometry.x1) * ratio;
                              const newY = attachedWall.geometry.y1 + (attachedWall.geometry.y2 - attachedWall.geometry.y1) * ratio;
                              updateEntityProperty<any>(selectedEntity.id, 'Update Position Along Wall', (e) => ({ ...e, geometry: { ...e.geometry, x: newX, y: newY } }));
                            }}
                          />
                        );
                      }
                      return null;
                    })()}
"""

xy_position_jsx = """
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <DimensionInput
                          label="X Position"
                          valueInches={(selectedEntity as any).geometry.x}
                          onApply={(val) => updateEntityProperty<any>(selectedEntity.id, 'Update X', (e) => ({ ...e, geometry: { ...e.geometry, x: val } }))}
                        />
                        <DimensionInput
                          label="Y Position"
                          valueInches={(selectedEntity as any).geometry.y}
                          onApply={(val) => updateEntityProperty<any>(selectedEntity.id, 'Update Y', (e) => ({ ...e, geometry: { ...e.geometry, y: val } }))}
                        />
                      </div>
"""

# 1. Door: Add Position Along Wall
content = content.replace(
    """<DimensionInput
                      label="Frame Thickness\"""",
    position_along_wall_jsx + """
                    <DimensionInput
                      label="Frame Thickness\""""
)

# 2. Window: Add Position Along Wall
content = content.replace(
    """onApply={(val) => updateEntityProperty<WindowEntity>(selectedEntity.id, 'Update Window Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                    />
                  </div>
                )}

                {selectedEntity.type === 'rack'""",
    """onApply={(val) => updateEntityProperty<WindowEntity>(selectedEntity.id, 'Update Window Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                    />
""" + position_along_wall_jsx + """
                  </div>
                )}

                {selectedEntity.type === 'rack'"""
)

# 3. Wall Column: Add Position Along Wall
content = content.replace(
    """{(selectedEntity as ColumnEntity).properties.columnType === 'wall' && (
                      <DimensionInput
                        label="Under/Inward Projection\"""",
    """{(selectedEntity as ColumnEntity).properties.columnType === 'wall' && (
                      <>
                      <DimensionInput
                        label="Under/Inward Projection\""""
)
content = content.replace(
    """onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column Projection', (e) => ({ ...e, properties: { ...e.properties, inwardProjection: val } }))}
                      />
                    )}
                    {(selectedEntity as ColumnEntity).properties.columnType === 'free' && (""",
    """onApply={(val) => updateEntityProperty<ColumnEntity>(selectedEntity.id, 'Update Column Projection', (e) => ({ ...e, properties: { ...e.properties, inwardProjection: val } }))}
                      />
""" + position_along_wall_jsx + """
                      </>
                    )}
                    {(selectedEntity as ColumnEntity).properties.columnType === 'free' && ("""
)

# 4. Racks: Add X and Y
content = content.replace(
    """onApply={(val) => updateEntityProperty<RackEntity>(selectedEntity.id, 'Update Rack Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                    />
                  </div>
                )}

                {(selectedEntity.type === 'shutter'""",
    """onApply={(val) => updateEntityProperty<RackEntity>(selectedEntity.id, 'Update Rack Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                    />
""" + xy_position_jsx + """
                  </div>
                )}

                {(selectedEntity.type === 'shutter'"""
)

# 5. Shutter / Glass Gate: Add Position Along Wall AND XY if missing
shutter_repl = """
                    {((selectedEntity.type === 'shutter' || selectedEntity.type === 'glass_gate') && (selectedEntity as any).properties?.attachedWallId) ? (
                      PAW_JSX
                    ) : (
                      XY_JSX
                    )}
""".replace("PAW_JSX", position_along_wall_jsx).replace("XY_JSX", xy_position_jsx)

content = content.replace(
    """onApply={(val) => updateEntityProperty<any>(selectedEntity.id, 'Update Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                    />
                  </div>
                )}

                {selectedEntity.type === 'partition'""",
    """onApply={(val) => updateEntityProperty<any>(selectedEntity.id, 'Update Height', (e) => ({ ...e, geometry: { ...e.geometry, height: val } }))}
                    />
""" + shutter_repl + """
                  </div>
                )}

                {selectedEntity.type === 'partition'"""
)

# 6. Partition: Add Height
content = content.replace(
    """<DimensionInput
                      label="Thickness\"""",
    """<DimensionInput
                      label="Height"
                      valueInches={(selectedEntity as PartitionEntity).properties.height || 108}
                      onApply={(val) => updateEntityProperty<PartitionEntity>(selectedEntity.id, 'Update Partition Height', (e) => ({ ...e, properties: { ...e.properties, height: val } }))}
                    />
                    <DimensionInput
                      label="Thickness\""""
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Success')
