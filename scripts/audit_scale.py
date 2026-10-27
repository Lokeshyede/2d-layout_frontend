import json

# Actual Endcap Product metadata from DB
endcap_meta = json.loads('{"localWidthAxis":"X","localHeightAxis":"Y","localDepthAxis":"Z","correctionRotation":{"x":0,"y":0,"z":0},"supportsParametricShelves":true,"shelfCount":4,"shelfThickness":1,"shelfSpacing":"Auto","minShelves":1,"maxShelves":10,"detected_width":38.22,"detected_height":85.04,"detected_depth":21.23,"mesh_count":41}')

# Endcap GLB actual raw accessor size (MM units - max dim > 150)
endcap_glb_raw_size = {'X': 2155.594, 'Y': 2364.160, 'Z': 351.438}

# GLBCache unit detection: maxDim = 2364.16 > 150 -> nativeUnitScale = 1.0/25.4 (mm to inches)
nativeUnitScale = 1.0/25.4

pSize_x = endcap_glb_raw_size['X']  # 2155.594 mm
pSize_y = endcap_glb_raw_size['Y']  # 2364.160 mm
pSize_z = endcap_glb_raw_size['Z']  # 351.438 mm

inches_x = pSize_x * nativeUnitScale  # ~84.9"
inches_y = pSize_y * nativeUnitScale  # ~93.1"
inches_z = pSize_z * nativeUnitScale  # ~13.8"

print("=== ENDCAP GLB NATIVE DIMENSIONS (MM -> Inches) ===")
print("  X: %.2f inches" % inches_x)
print("  Y: %.2f inches (Height - vertical)" % inches_y)
print("  Z: %.2f inches" % inches_z)

print("\n=== GLBCache defaultRotationDeg detection ===")
print("  rawSize.z = %.3f, rawSize.x = %.3f" % (pSize_z, pSize_x))
if pSize_z >= pSize_x:
    print("  rawSize.z >= rawSize.x -> defaultRotationDeg = 90")
else:
    print("  rawSize.z < rawSize.x -> defaultRotationDeg = 0  <-- THIS IS THE RESULT")
    print("  nativeAxis = {x: Width, y: Height, z: Depth}")

print("\n=== Endcap correctionRotation from DB metadata ===")
print("  correctionRotation.y = %d" % endcap_meta['correctionRotation']['y'])
print("  -> rotDegY will be 0 (DB overrides defaultRotationDeg)")

print("\n=== With rotDegY = 0, anchor branch selection in GLBCache ===")
print("  Falls into ELSE branch (0 degrees):")
print("  unscaledRotWidth = pSize.x = %.3f mm = %.2f in" % (pSize_x, inches_x))
print("  unscaledRotDepth = pSize.z = %.3f mm = %.2f in" % (pSize_z, inches_z))

print("\n=== Product Model dimensions ===")
print("  product.width = 18.0 in (baseW)")
print("  product.depth = 36.0 in (baseD)")
print("  product.height = 60.0 in (baseH)")

baseW = 18.0
baseD = 36.0
baseH = 60.0

stage1ScaleX = baseW / inches_x
stage1ScaleZ = baseD / inches_z

print("\n=== Two-Stage Scaling Result ===")
print("  stage1ScaleX = baseW / unscaledRotWidth = %.1f / %.2f = %.4f" % (baseW, inches_x, stage1ScaleX))
print("  stage1ScaleZ = baseD / unscaledRotDepth = %.1f / %.2f = %.4f" % (baseD, inches_z, stage1ScaleZ))
print()
print("  PHYSICAL MEANING:")
print("  GLB native X (84.9 in, the WIDE face) gets compressed to 18 in (%.1f%%)" % (100*stage1ScaleX))
print("  GLB native Z (13.8 in, the THIN face) gets stretched to 36 in (%.1f%%)" % (100*stage1ScaleZ))
print()
print("  RESULT: The Endcap GLB becomes visually INVERTED and SEVERELY DISTORTED.")
print("  What should be 84.9in-wide is crushed to 18in.")
print("  What should be 13.8in-deep is stretched to 36in.")
print()

print("=== CRITICAL: DB metadata dimensions vs actual GLB ===")
print("  DB detected_width = 38.22 in  (WRONG - this is the Center Rack width)")
print("  DB detected_height = 85.04 in")
print("  DB detected_depth = 21.23 in  (WRONG - this is the Center Rack depth)")
print()
print("  Actual GLB X = %.2f in (84.9 in = true width of gondola shelf span)" % inches_x)
print("  Actual GLB Y = %.2f in (93.1 in = true height)" % inches_y)
print("  Actual GLB Z = %.2f in (13.8 in = true depth)" % inches_z)
print()
print("  The detected_width/detected_depth metadata in DB was copied from the CENTER RACK metadata!")
print("  It does NOT match the actual RACKS_c5dafbfe.glb dimensions.")
print()

print("=== PARAMETRIC SYSTEM CHECK ===")
print("  DB metadata: supportsParametricShelves = True")
print("  Entity3DRegistry line 246: supportsParametricShelves: isEndcap ? false : ...")
print("  -> Entity3DRegistry OVERRIDES the DB value to FALSE for Endcaps. PROTECTED.")
print()

print("=== SUMMARY OF ROOT CAUSES ===")
print("ROOT CAUSE 1 (CRITICAL):")
print("  DB metadata correctionRotation.y = 0")
print("  But actual GLB's X axis = 84.9in (wide face) and Z axis = 13.8in (thin face)")
print("  With rotDegY=0: GLBCache treats X=Width, Z=Depth")
print("  -> 84.9in width mapped to 18in = 78.8% COMPRESSION")
print("  -> 13.8in depth mapped to 36in = 260% STRETCH")
print("  The Endcap appears as an extremely wide, thin, distorted slab.")
print()
print("ROOT CAUSE 2 (CRITICAL):")
print("  DB metadata detected_width=38.22, detected_depth=21.23 are Center Rack values")
print("  These were copy-pasted from the Center Rack product during Admin upload.")
print("  They do not represent RACKS_c5dafbfe.glb actual dimensions.")
print()
print("ROOT CAUSE 3 (HIGH):")
print("  Product Model product.width=18, product.depth=36 do not match any logical mapping")
print("  of the actual GLB native axes (X=84.9, Z=13.8)")
print()
print("FIRST FAILURE POINT: GLB normalization in GLBCache")
print("  -> correctionRotation.y=0 combined with wrong product dimensions creates")
print("  -> extreme non-uniform distortion of the uploaded GLB")
