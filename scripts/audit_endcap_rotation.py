"""
ENDCAP ROTATION AUDIT
Proving exactly why the Endcap projects INSIDE the Center Rack and the minimal fix.

Three.js Y-axis rotation math:
  rotation.y = θ applies this world transform to local vectors:
    local +X → world: (cos θ,  0, -sin θ)
    local +Y → world: (0,      1,  0    )
    local +Z → world: (sin θ,  0,  cos θ)

CAD → 3D coordinate mapping:
    2D X  →  3D X
    2D Y  →  3D Z    (note: CAD Y = 3D Z!)

GLBCache anchor for Endcap with rotDegY=0:
    uploadedGLB.position.z = -pBox.min.z    → back face anchored at local Z=0
    The GLB's LOCAL +Z direction = physical "display/front" direction
    The GLB's LOCAL -Z direction = physical "connection/back" direction
"""
import math

def rotate_y(theta, lx, ly, lz):
    """Three.js rotateY: maps local (lx,ly,lz) → world (wx,wy,wz)"""
    wx = math.cos(theta)*lx + math.sin(theta)*lz
    wy = ly
    wz = -math.sin(theta)*lx + math.cos(theta)*lz
    return (wx, wy, wz)

def atan2_2d_to_rotY(vx, vy):
    """EndcapEngine formula: atan2(v.x, v.y) → Three.js rotation.y"""
    return math.atan2(vx, vy)

print("=" * 65)
print("AUDIT: Horizontal run (rightVec = {x:1, y:0})")
print("=" * 65)

rightVec = (1.0, 0.0)

print("\n--- RIGHT TERMINAL ---")
terminalNormal_R = (rightVec[0], rightVec[1])          # outward = +rightVec
targetConnNormal_R = (-terminalNormal_R[0], -terminalNormal_R[1])  # = (-1, 0)
displayNormal_R = (-targetConnNormal_R[0], -targetConnNormal_R[1]) # = (1, 0)

print(f"  rightVec           = {rightVec}")
print(f"  terminalNormal     = {terminalNormal_R}  (outward from right end)")
print(f"  targetConnNormal   = {targetConnNormal_R}  (must face INTO center rack)")
print(f"  displayNormal      = {displayNormal_R}  (must face AWAY from center rack)")
print()

# CURRENT CODE uses targetConnectionNormal in atan2
rotY_current_R = atan2_2d_to_rotY(targetConnNormal_R[0], targetConnNormal_R[1])
print(f"  CURRENT rotationY  = atan2({targetConnNormal_R[0]}, {targetConnNormal_R[1]}) = {rotY_current_R:.4f} rad = {math.degrees(rotY_current_R):.1f}°")

# What does local +Z map to in world space?
local_z_world_current = rotate_y(rotY_current_R, 0, 0, 1)
print(f"  CURRENT: local +Z → world {local_z_world_current}  = GLB display direction in world")
print(f"  CURRENT display is toward: {'INWARD (WRONG!)' if local_z_world_current[0] < 0 else 'OUTWARD (correct)'}")
print()

# PROPOSED FIX uses displayNormal (= terminalNormal) in atan2
rotY_fixed_R = atan2_2d_to_rotY(terminalNormal_R[0], terminalNormal_R[1])
print(f"  FIXED  rotationY   = atan2({terminalNormal_R[0]}, {terminalNormal_R[1]}) = {rotY_fixed_R:.4f} rad = {math.degrees(rotY_fixed_R):.1f}°")

local_z_world_fixed = rotate_y(rotY_fixed_R, 0, 0, 1)
print(f"  FIXED: local +Z → world {local_z_world_fixed}  = GLB display direction in world")
print(f"  FIXED display is toward: {'INWARD (WRONG!)' if local_z_world_fixed[0] < 0 else 'OUTWARD (correct)'}")

print()
print("--- LEFT TERMINAL ---")
terminalNormal_L = (-rightVec[0], -rightVec[1])        # outward = -rightVec
targetConnNormal_L = (-terminalNormal_L[0], -terminalNormal_L[1])  # = (1, 0)
displayNormal_L = (-targetConnNormal_L[0], -targetConnNormal_L[1]) # = (-1, 0)

print(f"  terminalNormal     = {terminalNormal_L}  (outward from left end)")
print(f"  targetConnNormal   = {targetConnNormal_L}")
print(f"  displayNormal      = {displayNormal_L}")
print()

rotY_current_L = atan2_2d_to_rotY(targetConnNormal_L[0], targetConnNormal_L[1])
print(f"  CURRENT rotationY  = atan2({targetConnNormal_L[0]}, {targetConnNormal_L[1]}) = {rotY_current_L:.4f} rad = {math.degrees(rotY_current_L):.1f}°")

local_z_world_current_L = rotate_y(rotY_current_L, 0, 0, 1)
print(f"  CURRENT: local +Z → world {local_z_world_current_L}")
print(f"  CURRENT display is toward: {'INWARD (WRONG!)' if local_z_world_current_L[0] > 0 else 'OUTWARD (correct)'}")
print()

rotY_fixed_L = atan2_2d_to_rotY(terminalNormal_L[0], terminalNormal_L[1])
print(f"  FIXED  rotationY   = atan2({terminalNormal_L[0]}, {terminalNormal_L[1]}) = {rotY_fixed_L:.4f} rad = {math.degrees(rotY_fixed_L):.1f}°")

local_z_world_fixed_L = rotate_y(rotY_fixed_L, 0, 0, 1)
print(f"  FIXED: local +Z → world {local_z_world_fixed_L}")
print(f"  FIXED display is toward: {'INWARD (WRONG!)' if local_z_world_fixed_L[0] > 0 else 'OUTWARD (correct)'}")

print()
print("=" * 65)
print("ROOT CAUSE")
print("=" * 65)
print("""
The current code at EndcapEngine.ts line 99 and line 177:

    const rotationY = Math.atan2(targetConnectionNormal.x, targetConnectionNormal.y);

This formula was intended to rotate the GLB's canonical local
connection-back normal (+Z) to align with targetConnectionNormal.

BUT:
  - The GLB's back face is at local Z=0 (anchored by GLBCache)
  - The GLB's DISPLAY face is in the local +Z direction
  - targetConnectionNormal points TOWARD the Center Rack (inward)
  - This rotation makes local +Z point INWARD → Endcap projects INTO rack

THE FIX:
  Use terminalNormal (= displayNormal = outward direction) instead of
  targetConnectionNormal in the atan2 call.

    const rotationY = Math.atan2(terminalNormal.x, terminalNormal.y);

RIGHT terminal: rotationY = atan2(1,0)  = +π/2  → local+Z → world+X ✓
LEFT  terminal: rotationY = atan2(-1,0) = -π/2  → local+Z → world-X ✓
""")

print("=" * 65)
print("SCOPE OF CHANGE")
print("=" * 65)
print("""
File: src/cad/engine/EndcapEngine.ts
Lines: 99 and 177

TWO identical one-line changes (left and right terminal cases):

BEFORE:
  const rotationY = Math.atan2(targetConnectionNormal.x, targetConnectionNormal.y);

AFTER:
  // Align GLB local +Z (display face) to point OUTWARD from the terminal.
  // terminalNormal points outward = the display direction the aisle faces.
  const rotationY = Math.atan2(terminalNormal.x, terminalNormal.y);

No other files need changing.
No GLB changes.
No GLBCache changes.
No CenterGondolaEngine changes.
No product model changes.
""")

print("=" * 65)
print("ROTATION TEST MATRIX (all four run orientations)")
print("=" * 65)
angles = [0, 90, 180, 270]
for deg in angles:
    rad = math.radians(deg)
    rv = (math.cos(rad), math.sin(rad))
    
    # Right terminal
    tn_r = (rv[0], rv[1])
    rot_r = math.atan2(tn_r[0], tn_r[1])
    world_display_r = rotate_y(rot_r, 0, 0, 1)
    
    # Left terminal
    tn_l = (-rv[0], -rv[1])
    rot_l = math.atan2(tn_l[0], tn_l[1])
    world_display_l = rotate_y(rot_l, 0, 0, 1)
    
    print(f"\n  Run rotation {deg}°: rightVec=({rv[0]:.3f}, {rv[1]:.3f})")
    print(f"    RIGHT terminal: rotY={math.degrees(rot_r):+.1f}° → display world=({world_display_r[0]:.2f},{world_display_r[2]:.2f}) [outward=({rv[0]:.2f},{rv[1]:.2f})] {'✓' if abs(world_display_r[0]-rv[0])<0.01 and abs(world_display_r[2]-rv[1])<0.01 else 'FAIL'}")
    print(f"    LEFT  terminal: rotY={math.degrees(rot_l):+.1f}° → display world=({world_display_l[0]:.2f},{world_display_l[2]:.2f}) [outward=({-rv[0]:.2f},{-rv[1]:.2f})] {'✓' if abs(world_display_l[0]+rv[0])<0.01 and abs(world_display_l[2]+rv[1])<0.01 else 'FAIL'}")
