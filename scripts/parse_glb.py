import json
import struct
import sys
import os

def parse_glb(file_path):
    with open(file_path, 'rb') as f:
        magic = f.read(4)
        if magic != b'glTF':
            print("Not a GLB file")
            return
        version = struct.unpack('<I', f.read(4))[0]
        length = struct.unpack('<I', f.read(4))[0]
        
        json_len = struct.unpack('<I', f.read(4))[0]
        json_type = f.read(4)
        if json_type != b'JSON':
            print("No JSON chunk")
            return
            
        json_data = f.read(json_len).decode('utf-8')
        gltf = json.loads(json_data)
        
        print(f"GLB filename: {os.path.basename(file_path)}")
        print(f"native mesh count: {len(gltf.get('meshes', []))}")
        print(f"geometry count: {sum(len(m.get('primitives', [])) for m in gltf.get('meshes', []))}")
        print(f"material count: {len(gltf.get('materials', []))}")
        print(f"scene count: {len(gltf.get('scenes', []))}")
        print(f"node count: {len(gltf.get('nodes', []))}")
        
        print("\nNodes:")
        for i, node in enumerate(gltf.get('nodes', [])):
            print(f"Node {i}: {node.get('name', 'unnamed')} (Mesh: {node.get('mesh', 'none')})")

        print("\nMeshes:")
        for i, mesh in enumerate(gltf.get('meshes', [])):
            print(f"Mesh {i}: {mesh.get('name', 'unnamed')}")
            
        # Get bounding box from accessors of first mesh (or all meshes)
        min_bounds = [float('inf'), float('inf'), float('inf')]
        max_bounds = [float('-inf'), float('-inf'), float('-inf')]
        
        accessors = gltf.get('accessors', [])
        for mesh in gltf.get('meshes', []):
            for prim in mesh.get('primitives', []):
                if 'POSITION' in prim.get('attributes', {}):
                    acc_idx = prim['attributes']['POSITION']
                    if acc_idx < len(accessors):
                        acc = accessors[acc_idx]
                        if 'min' in acc and 'max' in acc:
                            min_bounds = [min(min_bounds[i], acc['min'][i]) for i in range(3)]
                            max_bounds = [max(max_bounds[i], acc['max'][i]) for i in range(3)]
        
        print("\nNative Dimensions (meters):")
        print(f"Native X extent: min={min_bounds[0]:.3f}, max={max_bounds[0]:.3f}, span={(max_bounds[0]-min_bounds[0]):.3f}")
        print(f"Native Y extent: min={min_bounds[1]:.3f}, max={max_bounds[1]:.3f}, span={(max_bounds[1]-min_bounds[1]):.3f}")
        print(f"Native Z extent: min={min_bounds[2]:.3f}, max={max_bounds[2]:.3f}, span={(max_bounds[2]-min_bounds[2]):.3f}")
        
        span_x = max_bounds[0]-min_bounds[0]
        span_y = max_bounds[1]-min_bounds[1]
        span_z = max_bounds[2]-min_bounds[2]
        
        print(f"\nNative X span (inches): {span_x * 39.3701:.1f}")
        print(f"Native Y span (inches): {span_y * 39.3701:.1f}")
        print(f"Native Z span (inches): {span_z * 39.3701:.1f}")

if __name__ == "__main__":
    parse_glb(sys.argv[1])
