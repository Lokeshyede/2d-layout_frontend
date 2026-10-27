"""
Simulate the FIXED analyzeSceneProductBounds logic and verify the productBox is now correct.
"""
import struct, json, math

def load_glb(path):
    with open(path,'rb') as f:
        f.read(4); f.read(4); f.read(4)
        c0l = struct.unpack('<I', f.read(4))[0]; f.read(4)
        gltf = json.loads(f.read(c0l))
        f.read(4); f.read(4)
        bin_data = f.read()
    return gltf, bin_data

gltf, _ = load_glb(r'e:/2d alyout/backend/uploads/models/RACKS_c5dafbfe.glb')

# Step 1: Pre-scan to find preScanMaxDim
preScanMaxDim = 0
all_boxes = []
for i, mesh in enumerate(gltf.get('meshes', [])):
    for prim in mesh.get('primitives', []):
        pos_idx = prim.get('attributes', {}).get('POSITION')
        if pos_idx is None: continue
        acc = gltf['accessors'][pos_idx]
        mn = acc.get('min'); mx = acc.get('max')
        if mn is None or mx is None: continue
        size = [mx[j]-mn[j] for j in range(3)]
        max_dim = max(size)
        preScanMaxDim = max(preScanMaxDim, max_dim)
        all_boxes.append((i, mn, mx, size, max_dim))

print(f"preScanMaxDim = {preScanMaxDim:.4f}")

# Step 2: Determine estimatedNativeUnitScale
if preScanMaxDim > 150:
    estimatedNativeUnitScale = 1/25.4
    unit = "MM"
elif preScanMaxDim > 10:
    estimatedNativeUnitScale = 1.0
    unit = "inches"
else:
    estimatedNativeUnitScale = 39.37
    unit = "meters"

print(f"estimatedNativeUnitScale = {estimatedNativeUnitScale:.6f} ({unit})")

# Step 3: Compute auxThresholdNative
AUX_THRESHOLD_INCHES = 6.0 * 39.37  # 236.22 inches
auxThresholdNative = AUX_THRESHOLD_INCHES / estimatedNativeUnitScale
print(f"AUX_THRESHOLD_INCHES = {AUX_THRESHOLD_INCHES:.2f}\"")
print(f"auxThresholdNative = {auxThresholdNative:.2f} {unit}")
print()

# Step 4: Filter
productMeshCount = 0
filteredMeshCount = 0
prod_min = [float('inf')]*3
prod_max = [float('-inf')]*3

for i, mn, mx, size, max_dim in all_boxes:
    if max_dim <= auxThresholdNative:
        productMeshCount += 1
        for j in range(3):
            prod_min[j] = min(prod_min[j], mn[j])
            prod_max[j] = max(prod_max[j], mx[j])
    else:
        filteredMeshCount += 1

print(f"Product meshes (pass): {productMeshCount}")
print(f"Filtered meshes:       {filteredMeshCount}")
print()

prod_size = [prod_max[j]-prod_min[j] for j in range(3)]
max_prod_dim = max(prod_size)

# Recompute nativeUnitScale from product box (as loadModel does)
if max_prod_dim > 150:
    final_scale = 1/25.4
    final_unit = "MM"
elif max_prod_dim > 10 and max_prod_dim <= 150:
    final_scale = 1.0
    final_unit = "inches"
else:
    final_scale = 39.37
    final_unit = "meters"

print(f"Product box size: ({prod_size[0]:.3f}, {prod_size[1]:.3f}, {prod_size[2]:.3f}) {unit}")
print(f"maxDim of product box: {max_prod_dim:.3f}")
print(f"Final nativeUnitScale: {final_scale:.6f} ({final_unit})")
print()
print(f"Product dimensions in inches:")
print(f"  Width  (X): {prod_size[0]*final_scale:.2f}\"")
print(f"  Height (Y): {prod_size[1]*final_scale:.2f}\"")
print(f"  Depth  (Z): {prod_size[2]*final_scale:.2f}\"")
print()

targetH = 60.0
nativeHeightInches = prod_size[1] * final_scale
uniformScale = targetH / nativeHeightInches if nativeHeightInches > 0 else 1.0
print(f"Endcap uniform scale = {targetH} / {nativeHeightInches:.2f} = {uniformScale:.4f}")
print(f"Final displayed dims:")
print(f"  W = {prod_size[0]*final_scale*uniformScale:.2f}\"")
print(f"  H = {prod_size[1]*final_scale*uniformScale:.2f}\"  (== targetH {targetH}\")")
print(f"  D = {prod_size[2]*final_scale*uniformScale:.2f}\"")
print()
print("=== VERDICT ===")
if productMeshCount == len(all_boxes):
    print("ALL MESHES PASS (including room shells if any) - consider if room shells should be filtered")
elif filteredMeshCount > 0 and filteredMeshCount < len(all_boxes):
    print(f"PARTIAL FILTER: {filteredMeshCount} meshes excluded (genuine room shells)")
    print(f"Rack structure ({productMeshCount} meshes) correctly included")
else:
    print("ALL MESHES PASS")

if prod_size[1]*final_scale > 50:
    print(f"Product height {prod_size[1]*final_scale:.1f}\" is realistic for a rack - CORRECT")
else:
    print("WARNING: Product height too small - filter may still be wrong")
