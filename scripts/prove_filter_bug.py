"""
Determine actual GLB units and safe filter threshold.
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

gltf, bin_data = load_glb(r'e:/2d alyout/backend/uploads/models/RACKS_c5dafbfe.glb')

# Get raw min/max from POSITION accessor for each mesh
print("=== RAW ACCESSOR POSITION MIN/MAX PER MESH ===")
all_maxdims = []

for i, mesh in enumerate(gltf.get('meshes', [])):
    mesh_name = mesh.get('name', f'mesh_{i}')
    for prim in mesh.get('primitives', []):
        pos_idx = prim.get('attributes', {}).get('POSITION')
        if pos_idx is None: continue
        acc = gltf['accessors'][pos_idx]
        mn = acc.get('min')
        mx = acc.get('max')
        if mn is None or mx is None: continue
        size = [mx[j]-mn[j] for j in range(3)]
        max_dim = max(size)
        all_maxdims.append(max_dim)
        print(f"  mesh_{i:02d} {mesh_name[:35]:35s} min=({mn[0]:.3f},{mn[1]:.3f},{mn[2]:.3f}) max=({mx[0]:.3f},{mx[1]:.3f},{mx[2]:.3f}) maxDim={max_dim:.4f}")

print()
overall_max = max(all_maxdims)
print(f"Largest single-mesh maxDim: {overall_max:.4f}")
print()

# Determine unit scale using GLBCache logic
if overall_max > 150:
    unit = "MM"; scale = 1/25.4
elif overall_max > 10 and overall_max <= 150:
    unit = "inches"; scale = 1.0
else:
    unit = "meters"; scale = 39.37
print(f"GLBCache would detect: {unit} (nativeUnitScale={scale:.6f})")
print()

# Show what the scene-level bounding box is (full scene, from all accessors)
all_min = [float('inf')]*3
all_max = [float('-inf')]*3
for i, mesh in enumerate(gltf.get('meshes', [])):
    for prim in mesh.get('primitives', []):
        pos_idx = prim.get('attributes', {}).get('POSITION')
        if pos_idx is None: continue
        acc = gltf['accessors'][pos_idx]
        mn = acc.get('min'); mx = acc.get('max')
        if mn is None or mx is None: continue
        for j in range(3):
            all_min[j] = min(all_min[j], mn[j])
            all_max[j] = max(all_max[j], mx[j])

scene_size = [all_max[j]-all_min[j] for j in range(3)]
print(f"Full scene bounding box size: ({scene_size[0]:.3f}, {scene_size[1]:.3f}, {scene_size[2]:.3f}) {unit}")
print(f"Full scene in inches: ({scene_size[0]*scale:.2f}, {scene_size[1]*scale:.2f}, {scene_size[2]*scale:.2f})")
print()

# Histogram of maxDim values
print("=== HISTOGRAM OF MESH maxDim VALUES ===")
buckets = {}
for d in all_maxdims:
    if d <= 2: b = "<=2 (tiny fasteners/bolts)"
    elif d <= 10: b = "2-10 (small parts)"
    elif d <= 50: b = "10-50 (shelves/uprights)"
    elif d <= 200: b = "50-200 (panels/frames)"
    elif d <= 2000: b = "200-2000 (large panels)"
    else: b = ">2000 (room-scale geometry)"
    buckets[b] = buckets.get(b, 0) + 1

for k,v in sorted(buckets.items()):
    print(f"  {k}: {v} meshes")

print()
print("=== SAFE THRESHOLD ANALYSIS ===")
# What is the smallest maxDim of a "real rack component"?
# And what is the maxDim of "room shell" meshes?
real_rack = sorted([d for d in all_maxdims if d > 2 and d < 2000])
room_shell = sorted([d for d in all_maxdims if d >= 2000])

print(f"Real rack mesh maxDims: {[round(d,2) for d in real_rack]}")
print(f"Room-shell maxDims: {[round(d,2) for d in room_shell]}")

if real_rack:
    print(f"Largest real rack mesh: {max(real_rack):.3f} {unit}")
if room_shell:
    print(f"Smallest room-shell mesh: {min(room_shell):.3f} {unit}")
    print(f"Safe threshold: {min(room_shell)*0.8:.1f} {unit}")
else:
    print("No room-shell meshes found (>2000). Current threshold 6.0 is wrongly filtering rack meshes!")
    print(f"Recommended threshold: {max(real_rack) * 1.5:.1f} {unit} to pass all rack meshes")
    print(f"Current code threshold: 6.0")
    print(f"RACK MESHES ARE BEING FILTERED AS IF THEY ARE ROOM SHELLS")
