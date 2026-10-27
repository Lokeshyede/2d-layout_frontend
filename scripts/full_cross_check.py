"""
Complete cross-check:
1. All 2,275,912-byte files are the same Wall Rack GLB
2. Determine which ones are correctly configured vs incorrectly configured
3. Determine what the CORRECT configuration for this GLB as a Wall Rack looks like
"""
import hashlib, os, json, struct

def file_hash(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while True:
            chunk = f.read(65536)
            if not chunk: break
            h.update(chunk)
    return h.hexdigest()

WALL_RACK_HASH = 'da68c95457285e4e2fe5ef523ab71ff0b84c3a86105c9db3fc875efa1ac3aef5'
CENTER_RACK_HASH = '6d40fa4652ea1144759d6d341381dfb58d3473e8b741a5504590591bd33e0baf'

glb_dir = r'e:/2d alyout/backend/uploads/models'
files = [f for f in os.listdir(glb_dir) if f.endswith('.glb')]

print("=== ALL GLBs BY HASH ===\n")
by_hash = {}
for fname in sorted(files):
    fpath = os.path.join(glb_dir, fname)
    h = file_hash(fpath)
    if h not in by_hash:
        by_hash[h] = []
    by_hash[h].append(fname)

for h, fnames in by_hash.items():
    label = "WALL RACK GLB" if h == WALL_RACK_HASH else ("CENTER RACK GLB" if h == CENTER_RACK_HASH else "CORNER RACK GLB")
    print(f"  [{label}] (SHA256: {h[:16]}...)")
    for f in fnames:
        print(f"    - {f}")
    print()

# Now test: when RF-PRD-0003 (Wall Rack) uses the same GLB with its OWN metadata,
# does it normalize correctly?
# RF-PRD-0003 metadata_json does NOT have correctionRotation (from API output)
# But it does have detected_width=84.85, detected_depth=13.8
# GLB: X=84.85", Y=93.04", Z=13.8" (MM, so nativeUnitScale=1/25.4)

# GLBCache logic for RF-PRD-0003:
# maxDim = 93.04 (in inches after conversion) > 10 and < 150 -> nativeUnitScale=1.0 ??? No wait
# raw sizes are in MM: X=2155, Y=2364, Z=351
# maxDim = max(2155, 2364, 351) = 2364 > 150 -> nativeUnitScale = 1.0/25.4

# Then Z(351) < X(2155) -> defaultRotationDeg = 0
# RF-PRD-0003 has no correctionRotation in metadata -> options.correctionRotation = undefined
# rotDegY = options.correctionRotation?.y ?? entry.defaultRotationDeg = 0 ?? 0 = 0

# With rotDegY=0:
# unscaledRotWidth = pSize.x = 2155.6mm = 84.87"
# unscaledRotDepth = pSize.z = 351.4mm = 13.84"

# product.width = 48", baseW = 48"
# product.depth = 18", baseD = 18"

w_native = 84.87  # inches
d_native = 13.84  # inches
h_native = 93.08  # inches

products_using_wall_rack = [
    {'id': 'RF-PRD-0001', 'name': '7x3 Rack', 'type': 'Wall Rack', 'width': 36, 'depth': 24, 'height': 84},
    {'id': 'RF-PRD-0003', 'name': '7x4 Wall Rack', 'type': 'Wall Rack', 'width': 48, 'depth': 18, 'height': 84},
    {'id': 'RF-PRD-0009', 'name': '5x3 end cap rack', 'type': 'Endcap', 'width': 18, 'depth': 36, 'height': 60},
]

print("\n=== SCALE DISTORTION FOR ALL PRODUCTS USING THE WALL RACK GLB ===\n")
print(f"  Wall Rack GLB native: X={w_native}\"  Y={h_native}\"  Z={d_native}\"")
print(f"  Axis mapping with rotDegY=0: X=Width, Y=Height, Z=Depth")
print()

for p in products_using_wall_rack:
    s1x = p['width'] / w_native
    s1y = p['height'] / h_native
    s1z = p['depth'] / d_native
    print(f"  {p['id']} ({p['type']}: {p['name']})")
    print(f"    Target: W={p['width']}\" D={p['depth']}\" H={p['height']}\"")
    print(f"    stage1ScaleX = {p['width']}/{w_native:.1f} = {s1x:.4f}  ({100*s1x:.1f}%)")
    print(f"    stage1ScaleY = {p['height']}/{h_native:.1f} = {s1y:.4f}  ({100*s1y:.1f}%)")
    print(f"    stage1ScaleZ = {p['depth']}/{d_native:.1f} = {s1z:.4f}  ({100*s1z:.1f}%)")
    ratio_xz = s1x / s1z if s1z != 0 else float('inf')
    print(f"    X/Z scale ratio = {ratio_xz:.3f}  (1.0 = uniform, >>1 = Z over-stretched)")
    if ratio_xz < 0.5 or ratio_xz > 2.0:
        print(f"    *** SEVERE NON-UNIFORM DISTORTION ***")
    print()

# What SHOULD the wall rack normalization be?
# A 7x4 wall rack (48" wide, 18" deep, 84" tall):
# The GLB native X=84.87" is the FULL WALL SPAN
# That's wider than one rack module
# The correctionRotation metadata says nothing -> uses rotDegY=0
# So X gets compressed from 84.87 to 48" -> 0.566 scale
# And Z gets stretched from 13.84 to 18" -> 1.301 scale
# That's not terrible (1.3 to 1.5 ratio), but not clean either

print("\n=== WHAT DOES 84.87\" REPRESENT IN THE WALL RACK GLB? ===")
print()
print("  Wall rack: 7 shelves x 4 shelves deep")
print("  Typical 7x4 rack: 84\" tall (7 feet), 48\" wide (4 feet)")
print("  The GLB X dimension is 84.87\" -- this is the HEIGHT in typical rack notation!")
print("  The GLB Y dimension is 93.08\" -- this is taller than the X dimension")
print()
print("  POSSIBLE EXPLANATION:")
print("  The GLB may be LYING ON ITS SIDE in the file.")
print("  If the rack was modeled with its length along X and height along Y:")
print("  GLB X = 84.87\" = what should be Height (7x series = 84\")")  
print("  GLB Y = 93.08\" = ??? (could be total model height including base)")
print("  GLB Z = 13.84\" = Depth (13.84\" wall rack depth)")
print()
print("  OR:")
print("  GLB X = 84.87\" = Width of full 7x shelf row (84.85\" = 7 x 12.12\" per shelf unit)")
print("  This could be a gondola of 7 shelf bays connected, each ~12\" wide")
print()
print("  BOTTOM LINE:")
print("  The GLB at RACKS_c5dafbfe.glb / RACKS__1__54b19ebd.glb is the WALL RACK asset.")
print("  RF-PRD-0009 (Endcap) should NOT use this GLB.")
print("  The Admin needs to upload a REAL Endcap GLB for RF-PRD-0009.")
print()
print("=== RECOMMENDED ACTIONS ===")
print()
print("  1. IMMEDIATE: Update RF-PRD-0009 metadata to correctly represent the Wall Rack GLB")
print("     (so it renders correctly as a wall rack even while wrong)")
print("  2. REQUIRED: Admin uploads the actual Endcap GLB file")
print("  3. THEN: Update RF-PRD-0009 metadata_json with auto-detected correct values")
print()
print("  For RF-PRD-0003 (Wall Rack) to render correctly:")
print(f"    correctionRotation.y = 0 (X is already the wide span)")
print(f"    product.width should be set to {w_native:.0f} or less (CAD target)")
print(f"    The detected_width=84.85 in metadata IS the native GLB X span")
