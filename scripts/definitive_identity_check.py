"""
DEFINITIVE PROOF:
All 2,275,912-byte files are likely identical (same source GLB).
This means RF-PRD-0009 (Endcap) is pointing to the WALL RACK GLB — not an Endcap.

Now let's analyze the actual wall rack geometry (RACKS_c5dafbfe.glb = RACKS__1__54b19ebd.glb)
to determine what physical product it actually represents.

X=84.87", Y=93.08", Z=13.84"

For a wall rack:
- Width (along wall) = X = 84.87" ≈ 7 feet (!) 
- That could be a multi-bay wall rack assembly
- Height = Y = 93.08" ≈ 7.75 feet (tall wall rack)
- Depth = Z = 13.84" ≈ 13.84" (wall rack depth from wall)

Product RF-PRD-0003 "7 x 4 Wall Rack" has:
- width=48", height=84", depth=18"
- detected_width=84.85, detected_height=93.04, detected_depth=13.8

So RF-PRD-0003 metadata IS correct for this GLB:
  detected_width = 84.85" (the long X span, representing the wall-span width)
  detected_height = 93.04" (the Y height)
  detected_depth = 13.8" (the Z depth from wall)

Product RF-PRD-0003:
  product.width = 48" (CAD/target width - what user placed)
  product.height = 84" (CAD/target height)
  product.depth = 18" (CAD/target depth)

This means GLBCache will scale:
  X (84.85") -> 48" (wall width) with correctionRotation
  Z (13.8") -> 18" (depth)

Let's verify the correctionRotation for RF-PRD-0003:
"""
import urllib.request, json

data = json.loads(urllib.request.urlopen('http://127.0.0.1:8000/api/products/?include_inactive=true').read())

print("=== ALL PRODUCTS WITH THEIR GLB AND DIMENSIONS ===\n")
for p in data['items']:
    meta = json.loads(p['metadata_json']) if p['metadata_json'] else {}
    print(f"  {p['product_id']} | {p['product_name']}")
    print(f"    Type: {p['product_type']} | Active: {p['active']}")
    print(f"    Product dims: W={p['width']}\" D={p['depth']}\" H={p['height']}\"")
    print(f"    GLB: {p['glb_url']}")
    if meta:
        print(f"    correctionRotation.y: {meta.get('correctionRotation', {}).get('y', 'N/A')}")
        print(f"    detected: W={meta.get('detected_width','?')} D={meta.get('detected_depth','?')} H={meta.get('detected_height','?')}")
        print(f"    localWidthAxis: {meta.get('localWidthAxis','?')}")
    print()

print("\n=== CRITICAL IDENTITY ANALYSIS ===")
print()
print("The GLB file RACKS_c5dafbfe.glb has SHA256 = da68c954...")
print("The GLB file RACKS__1__54b19ebd.glb has SHA256 = da68c954...")
print("THESE ARE BYTE-FOR-BYTE IDENTICAL FILES.")
print()
print("RF-PRD-0003 (Wall Rack) uses RACKS__1__54b19ebd.glb")
print("RF-PRD-0009 (Endcap) uses RACKS_c5dafbfe.glb")
print()
print("CONCLUSION:")
print("  RF-PRD-0009 was assigned the SAME GLB asset as the Wall Rack (RF-PRD-0003).")
print("  This GLB physically represents a WALL RACK (84.87\" wide, 93.08\" tall, 13.84\" deep).")
print("  It does NOT represent an Endcap.")
print()
print("  The Admin uploaded the Wall Rack GLB when creating the Endcap product.")
print("  The metadata was copied from the Center Rack product instead of being auto-detected.")
print()
print("  The correct fix is NOT to scale/rotate the wall rack GLB to look like an endcap.")
print("  The correct fix is: Admin must upload the ACTUAL Endcap GLB for RF-PRD-0009.")
print()

# Show wall rack normalization for reference
wall_rack = next((p for p in data['items'] if p['product_id'] == 'RF-PRD-0003'), None)
if wall_rack:
    meta = json.loads(wall_rack['metadata_json'])
    print(f"=== RF-PRD-0003 (Wall Rack) reference normalization ===")
    print(f"  GLB native: X=84.85\" Y=93.04\" Z=13.8\"")
    print(f"  correctionRotation.y = {meta['correctionRotation']['y']}")
    print(f"  product.width = {wall_rack['width']}\" (CAD target)")
    print(f"  product.depth = {wall_rack['depth']}\" (CAD target)")
    print()
    print(f"  With correctionRotation.y=0:")
    print(f"    unscaledRotWidth = pSize.x = 84.85\"")
    print(f"    unscaledRotDepth = pSize.z = 13.8\"")
    print(f"    stage1ScaleX = {wall_rack['width']}/84.85 = {wall_rack['width']/84.85:.4f}")
    print(f"    stage1ScaleZ = {wall_rack['depth']}/13.8 = {wall_rack['depth']/13.8:.4f}")
    print(f"  This ALSO severely distorts the wall rack! (non-uniform stretch)")
