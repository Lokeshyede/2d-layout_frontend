"""
Deep semantic inspection of RACKS_c5dafbfe.glb
Goal: Determine physical structure independent of product metadata
"""
import struct, json, math

def read_u32(f): return struct.unpack('<I', f.read(4))[0]
def read_f32_arr(data, offset, count):
    return [struct.unpack_from('<f', data, offset + i*4)[0] for i in range(count)]

def load_glb(path):
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
    return gltf, bin_data

def get_accessor_data(gltf, bin_data, accessor_idx):
    """Get raw float data from a GLTF accessor"""
    acc = gltf['accessors'][accessor_idx]
    bv_idx = acc.get('bufferView')
    if bv_idx is None:
        return None, acc
    bv = gltf['bufferViews'][bv_idx]
    offset = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    count = acc['count']
    component_type = acc['componentType']  # 5126 = float
    type_str = acc['type']
    num_components = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}.get(type_str, 1)
    
    if component_type == 5126:  # float
        data = []
        stride = bv.get('byteStride', num_components * 4)
        for i in range(count):
            item_offset = offset + i * stride
            vals = read_f32_arr(bin_data, item_offset, num_components)
            data.append(vals)
        return data, acc
    return None, acc

def analyze_mesh_positions(gltf, bin_data):
    """Get bounding box of each mesh primitive"""
    mesh_boxes = []
    
    for mesh_idx, mesh in enumerate(gltf.get('meshes', [])):
        mesh_name = mesh.get('name', f'mesh_{mesh_idx}')
        for prim in mesh.get('primitives', []):
            attrs = prim.get('attributes', {})
            if 'POSITION' not in attrs:
                continue
            pos_idx = attrs['POSITION']
            acc = gltf['accessors'][pos_idx]
            if 'min' in acc and 'max' in acc:
                mn = acc['min']
                mx = acc['max']
                size = [mx[i]-mn[i] for i in range(3)]
                center = [(mn[i]+mx[i])/2 for i in range(3)]
                mesh_boxes.append({
                    'name': mesh_name,
                    'min': mn,
                    'max': mx,
                    'size': size,
                    'center': center
                })
    
    return mesh_boxes

def analyze_scene(path, label):
    print(f"\n{'='*60}")
    print(f"ANALYSIS: {label}")
    print(f"File: {path}")
    print('='*60)
    
    gltf, bin_data = load_glb(path)
    
    nodes = gltf.get('nodes', [])
    meshes = gltf.get('meshes', [])
    accessors = gltf.get('accessors', [])
    
    print(f"\nStructure:")
    print(f"  Nodes: {len(nodes)}")
    print(f"  Meshes: {len(meshes)}")
    print(f"  Accessors: {len(accessors)}")
    
    # Get all POSITION accessor bounds (excluding trivially small/large)
    print(f"\nPOSITION accessor min/max ranges:")
    all_pos_mins = []
    all_pos_maxs = []
    
    for i, acc in enumerate(accessors):
        if acc.get('type') == 'VEC3' and 'min' in acc and 'max' in acc:
            mn = acc['min']
            mx = acc['max']
            size = [mx[j]-mn[j] for j in range(3)]
            max_dim = max(size)
            
            # Skip the -1 to -1 accessors (normals, etc.) and very tiny ones
            if max_dim < 0.001:
                continue
            if mn == [-1.0, -1.0, -1.0] and mx == [-1.0, -1.0, -1.0]:
                continue
            if all(abs(v) <= 1.0 and abs(v) >= 0.9 for v in mn+mx):
                continue  # Normals
                
            all_pos_mins.append(mn)
            all_pos_maxs.append(mx)
    
    if all_pos_mins:
        overall_min = [min(m[i] for m in all_pos_mins) for i in range(3)]
        overall_max = [max(m[i] for m in all_pos_maxs) for i in range(3)]
        overall_size = [overall_max[i]-overall_min[i] for i in range(3)]
        
        max_dim = max(overall_size)
        print(f"\n  Overall bounding box:")
        print(f"    Min: X={overall_min[0]:.3f} Y={overall_min[1]:.3f} Z={overall_min[2]:.3f}")
        print(f"    Max: X={overall_max[0]:.3f} Y={overall_max[1]:.3f} Z={overall_max[2]:.3f}")
        print(f"    Size: X={overall_size[0]:.3f} Y={overall_size[1]:.3f} Z={overall_size[2]:.3f}")
        
        if max_dim > 150:
            scale = 1.0/25.4
            unit = "mm"
        elif max_dim > 10:
            scale = 1.0
            unit = "inches"
        else:
            scale = 39.37
            unit = "meters"
        
        print(f"\n  Detected unit: {unit} (scale to inches: {scale:.5f})")
        print(f"  In inches: X={overall_size[0]*scale:.2f}\"  Y={overall_size[1]*scale:.2f}\"  Z={overall_size[2]*scale:.2f}\"")
        
        # Determine orientation
        sizes_in = [overall_size[i]*scale for i in range(3)]
        print(f"\n  Semantic analysis (by magnitude):")
        sorted_axes = sorted(enumerate(sizes_in), key=lambda x: -x[1])
        for rank, (axis_idx, val) in enumerate(sorted_axes):
            axis_name = ['X','Y','Z'][axis_idx]
            print(f"    Rank {rank+1}: {axis_name}-axis = {val:.2f}\"  -> ", end="")
            if rank == 0:
                print("LARGEST dimension")
            elif rank == 1:
                print("MIDDLE dimension")
            else:
                print("SMALLEST dimension")
        
        # For retail fixture, Y is usually height (vertical)
        y_in = sizes_in[1]
        xz_in = sorted([(sizes_in[0], 'X'), (sizes_in[2], 'Z')], key=lambda x: -x[0])
        
        print(f"\n  Retail fixture interpretation:")
        print(f"    Y-axis ({y_in:.2f}\"): Vertical height")
        print(f"    {xz_in[0][1]}-axis ({xz_in[0][0]:.2f}\"): Wider horizontal dimension")
        print(f"    {xz_in[1][1]}-axis ({xz_in[1][0]:.2f}\"): Narrower horizontal dimension")
        
        # Key semantic question for endcap
        print(f"\n  For an ENDCAP attached to a Center Rack run:")
        wider = xz_in[0][0]
        narrower = xz_in[1][0]
        print(f"    The NARROWER horizontal ({narrower:.2f}\") should = shelf depth toward aisle")
        print(f"    The WIDER horizontal ({wider:.2f}\") should = display face width OR gondola run length")
        print(f"    Typical endcap: display-face ~36\", depth ~18-24\"")
        
        if wider > 60:
            print(f"    WARNING: {wider:.2f}\" is LARGER than a typical single endcap width (36-48\")")
            print(f"    This may represent a gondola section or assembly rather than one endcap unit")
        
        return overall_size, scale, unit
    
    return None, None, None

# Run analysis
analyze_scene(
    r'e:/2d alyout/backend/uploads/models/RACKS_c5dafbfe.glb',
    'Endcap Product RF-PRD-0009'
)
analyze_scene(
    r'e:/2d alyout/backend/uploads/models/center_rack_258cd0d6.glb',
    'Center Rack Product RF-PRD-0007'
)
analyze_scene(
    r'e:/2d alyout/backend/uploads/models/RACKS__1__54b19ebd.glb',
    'Wall Rack Product RF-PRD-0003'
)
