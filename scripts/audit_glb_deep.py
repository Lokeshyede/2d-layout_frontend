import struct, json
import numpy as np

def read_u32(f): return struct.unpack('<I', f.read(4))[0]
def read_f32(data, offset): return struct.unpack_from('<f', data, offset)[0]

def inspect_glb_deep(path):
    with open(path, 'rb') as f:
        magic = f.read(4)
        version = read_u32(f)
        total_length = read_u32(f)
        
        chunk0_len = read_u32(f)
        chunk0_type = f.read(4)
        json_bytes = f.read(chunk0_len)
        gltf = json.loads(json_bytes)
        
        chunk1_len = read_u32(f)
        chunk1_type = f.read(4)
        bin_data = f.read(chunk1_len)
    
    accessors = gltf.get('accessors', [])
    buffer_views = gltf.get('bufferViews', [])
    meshes = gltf.get('meshes', [])
    nodes = gltf.get('nodes', [])
    
    # Find POSITION accessor ranges to get overall bounding box
    all_mins = []
    all_maxs = []
    for acc in accessors:
        if 'min' in acc and 'max' in acc and len(acc['min']) == 3:
            all_mins.append(acc['min'])
            all_maxs.append(acc['max'])
    
    if all_mins:
        overall_min = [min(m[i] for m in all_mins) for i in range(3)]
        overall_max = [max(m[i] for m in all_maxs) for i in range(3)]
        size = [overall_max[i] - overall_min[i] for i in range(3)]
        print(f"\n  BBox min: X={overall_min[0]:.3f} Y={overall_min[1]:.3f} Z={overall_min[2]:.3f}")
        print(f"  BBox max: X={overall_max[0]:.3f} Y={overall_max[1]:.3f} Z={overall_max[2]:.3f}")
        print(f"  Size:     X={size[0]:.3f} Y={size[1]:.3f} Z={size[2]:.3f}")
        
        # Check unit scale. Standard glTF is meters.
        # If max dim < 10, could be meters or small.
        max_dim = max(size)
        if max_dim < 10:
            unit_scale = 39.37  # meters -> inches
            print(f"  Likely METERS. Max dim = {max_dim:.3f}m")
            print(f"  In inches: W={size[0]*unit_scale:.1f}\" H={size[1]*unit_scale:.1f}\" D={size[2]*unit_scale:.1f}\"")
        elif max_dim > 150:
            unit_scale = 1.0/25.4  # mm -> inches
            print(f"  Likely MM. Max dim = {max_dim:.3f}mm")
            print(f"  In inches: W={size[0]*unit_scale:.1f}\" H={size[1]*unit_scale:.1f}\" D={size[2]*unit_scale:.1f}\"")
        else:
            print(f"  Likely already INCHES. Max dim = {max_dim:.3f}\"")
    
    # Active View node (auxiliary room node that inflates bounding box)
    av_nodes = [n for n in nodes if 'Active View' in n.get('name','') or 'active_view' in n.get('name','').lower()]
    print(f"\n  Auxiliary 'Active View' nodes found: {len(av_nodes)}")
    if av_nodes:
        print(f"  This means analyzeSceneProductBounds() must filter them out!")
        for av in av_nodes:
            print(f"    - {av.get('name')} mesh={av.get('mesh')}")

print("=== RACKS_c5dafbfe.glb (Endcap) ===")
inspect_glb_deep(r'e:/2d alyout/backend/uploads/models/RACKS_c5dafbfe.glb')
print("\n=== center_rack_258cd0d6.glb (Center Rack) ===")
inspect_glb_deep(r'e:/2d alyout/backend/uploads/models/center_rack_258cd0d6.glb')
