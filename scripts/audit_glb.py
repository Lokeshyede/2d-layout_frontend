import os, struct, json

def read_u32(f): return struct.unpack('<I', f.read(4))[0]

def inspect_glb(path):
    with open(path, 'rb') as f:
        magic = f.read(4)
        version = read_u32(f)
        length = read_u32(f)
        chunk0_len = read_u32(f)
        chunk0_type = f.read(4)
        json_data = json.loads(f.read(chunk0_len))
        
        meshes = json_data.get('meshes', [])
        nodes = json_data.get('nodes', [])
        materials = json_data.get('materials', [])
        scenes = json_data.get('scenes', [])
        accessors = json_data.get('accessors', [])
        
        print("GLB:", os.path.basename(path))
        print("Mesh count:", len(meshes))
        print("Node count:", len(nodes))
        print("Material count:", len(materials))
        print("Scene count:", len(scenes))
        node_names = [n.get("name", "(unnamed)") for n in nodes[:20]]
        print("First 20 node names:", node_names)
        mat_names = [m.get("name", "(unnamed)") for m in materials[:10]]
        print("Material names:", mat_names)
        
        # Check accessors for min/max bounds
        for i, acc in enumerate(accessors[:5]):
            if "min" in acc and "max" in acc:
                print(f"Accessor[{i}] min={acc['min']} max={acc['max']}")

inspect_glb(r'e:/2d alyout/backend/uploads/models/RACKS_c5dafbfe.glb')
print()
inspect_glb(r'e:/2d alyout/backend/uploads/models/center_rack_258cd0d6.glb')
