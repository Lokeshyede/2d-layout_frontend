import sys
import re

file_path = r'e:\2d alyout\frontend\src\components\CAD\CADEditor.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("computeDimensions", "generateDimensions")
content = content.replace(
    "const [wallThickness, setWallThickness] = useState(9);",
    "const [wallThickness] = useState(9);"
)
content = content.replace(
    "const [selectedRackType, setSelectedRackType] = useState<'Wall Rack' | 'Center Gondola' | 'Corner Rack'>('Center Gondola');",
    "const [selectedRackType] = useState<'Wall Rack' | 'Center Gondola' | 'Corner Rack'>('Center Gondola');"
)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)


file_path2 = r'e:\2d alyout\frontend\src\cad\rendering\CADRenderer.ts'
with open(file_path2, 'r', encoding='utf-8') as f:
    content2 = f.read()

content2 = content2.replace("const rot = Math.atan2(lineEnd.y - lineStart.y, lineEnd.x - lineStart.x);", "const lineRot = Math.atan2(lineEnd.y - lineStart.y, lineEnd.x - lineStart.x);")
content2 = content2.replace("Math.cos(rot - arrowAngle)", "Math.cos(lineRot - arrowAngle)")
content2 = content2.replace("Math.sin(rot - arrowAngle)", "Math.sin(lineRot - arrowAngle)")
content2 = content2.replace("Math.cos(rot + arrowAngle)", "Math.cos(lineRot + arrowAngle)")
content2 = content2.replace("Math.sin(rot + arrowAngle)", "Math.sin(lineRot + arrowAngle)")

with open(file_path2, 'w', encoding='utf-8') as f:
    f.write(content2)

print('Replaced more errors successfully.')
