import sys
import re

file_path = r'e:\2d alyout\frontend\src\cad\dimensions\DimensionManager.ts'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("id: dim_seg__,", "id: 'dim_seg_' + Math.random().toString(),")
content = content.replace("id: dim_obj_w_,", "id: 'dim_obj_w_' + obj.id,")
content = content.replace("id: dim_part_,", "id: 'dim_part_' + p.id,")
content = content.replace("id: dim_col_w_,", "id: 'dim_col_w_' + col.id,")
content = content.replace("id: dim_col_proj_,", "id: 'dim_col_proj_' + col.id,")
content = content.replace("id: dim_free_col_w_,", "id: 'dim_free_col_w_' + col.id,")
content = content.replace("id: dim_free_col_d_,", "id: 'dim_free_col_d_' + col.id,")
content = content.replace("id: dim_free_ref_l_,", "id: 'dim_free_ref_l_' + col.id,")
content = content.replace("id: dim_free_ref_r_,", "id: 'dim_free_ref_r_' + col.id,")
content = content.replace("id: dim_free_ref_t_,", "id: 'dim_free_ref_t_' + col.id,")
content = content.replace("id: dim_free_ref_b_,", "id: 'dim_free_ref_b_' + col.id,")
content = content.replace("id: dim_rack_w_,", "id: 'dim_rack_w_' + rack.id,")
content = content.replace("id: dim_rack_d_,", "id: 'dim_rack_d_' + rack.id,")
content = content.replace("attachedWallId: snap.targetEntityId", "attachedWallId: snap.targetEntityId || undefined")


with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Replaced id variables in DimensionManager.ts successfully.')
