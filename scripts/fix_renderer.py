import sys

file_path = r'e:\2d alyout\frontend\src\cad\rendering\CADRenderer.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "import type { CADEntity, DimensionItem, Point2D, SnapResult, ToolType } from '../types';",
    "import type { CADEntity, DimensionItem, Point2D, SnapResult, ToolType, WallEntity, PartitionEntity, ColumnEntity, DoorEntity, WindowEntity, ShutterEntity, GlassGateEntity, RackEntity, TextEntity } from '../types';"
)

content = content.replace(
    "private drawWall(wall: CADEntity & { geometry: any; properties: any }, isSelected: boolean) {",
    "private drawWall(wall: WallEntity, isSelected: boolean) {"
)

content = content.replace(
    "private drawPartition(part: CADEntity & { geometry: any; properties: any }, isSelected: boolean) {",
    "private drawPartition(part: PartitionEntity, isSelected: boolean) {"
)

content = content.replace(
    "private drawColumn(col: any, isSelected: boolean, entities: CADEntity[]) {",
    "private drawColumn(col: ColumnEntity, isSelected: boolean, entities: CADEntity[]) {"
)

content = content.replace(
    "private drawFreeColumn(col: any, isSelected: boolean) {",
    "private drawFreeColumn(col: ColumnEntity, isSelected: boolean) {"
)

content = content.replace(
    "private drawWallColumn(col: any, isSelected: boolean, entities: CADEntity[]) {",
    "private drawWallColumn(col: ColumnEntity, isSelected: boolean, entities: CADEntity[]) {"
)

content = content.replace(
    "const wall = entities.find(e => e.id === col.properties.attachedWallId) as any;",
    "const wall = entities.find(e => e.id === col.properties.attachedWallId) as WallEntity | undefined;"
)

content = content.replace(
    "const g = (w as any).geometry;",
    "const g = (w as WallEntity | PartitionEntity).geometry;"
)

content = content.replace(
    "private drawDoor(door: CADEntity & { geometry: any; properties: any }, isSelected: boolean) {",
    "private drawDoor(door: DoorEntity, isSelected: boolean) {"
)

content = content.replace(
    "private drawWindow(win: CADEntity & { geometry: any; properties: any }, isSelected: boolean) {",
    "private drawWindow(win: WindowEntity, isSelected: boolean) {"
)

content = content.replace(
    "private drawShutter(shutter: CADEntity & { geometry: any; properties: any }, isSelected: boolean) {",
    "private drawShutter(shutter: ShutterEntity, isSelected: boolean) {"
)

content = content.replace(
    "private drawGlassGate(gate: CADEntity & { geometry: any; properties: any }, isSelected: boolean) {",
    "private drawGlassGate(gate: GlassGateEntity, isSelected: boolean) {"
)

content = content.replace(
    "private drawRack(rack: CADEntity & { geometry: any; properties: any }, isSelected: boolean) {",
    "private drawRack(rack: RackEntity, isSelected: boolean) {"
)

content = content.replace(
    "private drawText(textEnt: CADEntity & { geometry: any; properties: any }, isSelected: boolean) {",
    "private drawText(textEnt: TextEntity, isSelected: boolean) {"
)

content = content.replace("this.drawWall(ent, isSelected);", "this.drawWall(ent as WallEntity, isSelected);")
content = content.replace("this.drawPartition(ent, isSelected);", "this.drawPartition(ent as PartitionEntity, isSelected);")
content = content.replace("this.drawColumn(ent, isSelected, params.entities);", "this.drawColumn(ent as ColumnEntity, isSelected, params.entities);")
content = content.replace("this.drawDoor(ent, isSelected);", "this.drawDoor(ent as DoorEntity, isSelected);")
content = content.replace("this.drawWindow(ent, isSelected);", "this.drawWindow(ent as WindowEntity, isSelected);")
content = content.replace("this.drawShutter(ent, isSelected);", "this.drawShutter(ent as ShutterEntity, isSelected);")
content = content.replace("this.drawGlassGate(ent, isSelected);", "this.drawGlassGate(ent as GlassGateEntity, isSelected);")
content = content.replace("this.drawRack(ent, isSelected);", "this.drawRack(ent as RackEntity, isSelected);")
content = content.replace("this.drawText(ent, isSelected);", "this.drawText(ent as TextEntity, isSelected);")


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Replaced types successfully.')
