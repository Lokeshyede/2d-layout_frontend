native_x = 84.87
native_y = 93.08
native_z = 13.84
target_h = 60.0

uniform = target_h / native_y

sx_before = 18.0 / native_x
sz_before = 36.0 / native_z
ratio_before = sx_before / sz_before

print("=== ENDCAP SCALE BEFORE FIX ===")
print(f"  scaleX = 18/{native_x:.2f} = {sx_before:.4f}  (78% COMPRESSION of native X)")
print(f"  scaleZ = 36/{native_z:.2f} = {sz_before:.4f}  (260% STRETCH of native Z)")
print(f"  X/Z scale ratio = {ratio_before:.4f}  (far from 1.0 -> SEVERE distortion)")
print()
print("=== ENDCAP SCALE AFTER FIX (UNIFORM HEIGHT) ===")
print(f"  nativeH      = {native_y}\"")
print(f"  targetH      = {target_h}\"")
print(f"  uniformScale = {target_h}/{native_y:.2f} = {uniform:.4f}")
print()
final_w = native_x * uniform
final_h = native_y * uniform
final_d = native_z * uniform
print(f"  Final W = {native_x:.2f} x {uniform:.4f} = {final_w:.2f}\"  (native X preserved)")
print(f"  Final H = {native_y:.2f} x {uniform:.4f} = {final_h:.2f}\"  (== targetH exactly)")
print(f"  Final D = {native_z:.2f} x {uniform:.4f} = {final_d:.2f}\"  (native Z preserved)")
print()
print("  XZ proportions: PRESERVED -- uploaded GLB appears exactly as modeled")
print(f"  X/Z scale ratio AFTER: {uniform}/{uniform} = 1.0000  (UNIFORM, no distortion)")
print()
print("=== VISUAL IMPACT ===")
print(f"  BEFORE: native {native_x}\" wide shelf span compressed to {18.0:.1f}\" -- looks crushed")
print(f"  BEFORE: native {native_z}\" depth stretched to {36.0:.1f}\" -- looks like a slab")
print(f"  AFTER : native {native_x}\" wide span shows as {final_w:.1f}\" -- exact uploaded model")
print(f"  AFTER : native {native_z}\" depth shows as {final_d:.1f}\" -- exact uploaded model")
