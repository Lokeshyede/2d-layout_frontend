"""
CRITICAL FINDING CHECK:
RACKS_c5dafbfe.glb (Endcap RF-PRD-0009) and
RACKS__1__54b19ebd.glb (Wall Rack RF-PRD-0003)

Both report IDENTICAL bounding boxes:
  X=2155.594, Y=2364.160, Z=351.438 (MM)
  = 84.87" x 93.08" x 13.84"

And IDENTICAL mesh/node/accessor counts:
  Nodes=88, Meshes=45, Accessors=137

This means they may be THE SAME FILE or one duplicated from the other.

Let's verify by comparing file hashes and content.
"""
import hashlib

def file_hash(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()

paths = {
    'RACKS_c5dafbfe.glb (Endcap RF-PRD-0009)': r'e:/2d alyout/backend/uploads/models/RACKS_c5dafbfe.glb',
    'RACKS__1__54b19ebd.glb (Wall Rack RF-PRD-0003)': r'e:/2d alyout/backend/uploads/models/RACKS__1__54b19ebd.glb',
    'center_rack_258cd0d6.glb (Center Rack RF-PRD-0007)': r'e:/2d alyout/backend/uploads/models/center_rack_258cd0d6.glb',
}

import os
print("=== FILE SIZE + SHA256 COMPARISON ===\n")
hashes = {}
for label, path in paths.items():
    size = os.path.getsize(path)
    h = file_hash(path)
    hashes[label] = h
    print(f"  {label}")
    print(f"    Size: {size:,} bytes ({size/1024:.1f} KB)")
    print(f"    SHA256: {h}")
    print()

print("=== DUPLICATE DETECTION ===")
hash_to_files = {}
for label, h in hashes.items():
    if h not in hash_to_files:
        hash_to_files[h] = []
    hash_to_files[h].append(label)

for h, files in hash_to_files.items():
    if len(files) > 1:
        print(f"\n!!! DUPLICATE FILES DETECTED !!!")
        for f in files:
            print(f"    -> {f}")
        print(f"    Hash: {h}")
    else:
        print(f"\n  UNIQUE: {files[0]}")

# Also compare the Wall Rack GLB that's linked to RF-PRD-0001
import struct, json

def load_glb_header(path):
    with open(path, 'rb') as f:
        magic = f.read(4)
        version = struct.unpack('<I', f.read(4))[0]
        total_length = struct.unpack('<I', f.read(4))[0]
        chunk0_len = struct.unpack('<I', f.read(4))[0]
        chunk0_type = f.read(4)
        json_bytes = f.read(chunk0_len)
        gltf = json.loads(json_bytes)
    return gltf

print("\n\n=== NODE NAME COMPARISON ===")
for label, path in paths.items():
    gltf = load_glb_header(path)
    nodes = gltf.get('nodes', [])
    names = [n.get('name', '(unnamed)') for n in nodes]
    named = [n for n in names if n != '(unnamed)']
    print(f"\n  {label}")
    print(f"  Named nodes: {named[:10]}")
    meshes = gltf.get('meshes', [])
    mesh_names = [m.get('name', '(unnamed)') for m in meshes[:10]]
    print(f"  First 10 mesh names: {mesh_names}")
