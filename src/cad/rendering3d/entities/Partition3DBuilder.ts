import * as THREE from 'three';
import type { PartitionEntity } from '../../types';
import { MaterialPalette3D } from './MaterialPalette3D';

export class Partition3DBuilder {
  public static buildPartition(partition: PartitionEntity): THREE.Group {
    const group = new THREE.Group();
    group.name = `Partition_${partition.id}`;

    const { x1, y1, x2, y2 } = partition.geometry;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);

    if (length < 0.1) return group;

    const angle2D = Math.atan2(dy, dx);
    const midX = (x1 + x2) / 2;
    const midZ = (y1 + y2) / 2;

    const thickness = partition.properties.thickness || 4; // Standard 4" partition
    const height = partition.properties.height || 96; // Standard 8' partition height
    const matType = partition.properties.material || 'drywall';

    group.position.set(midX, 0, midZ);
    group.rotation.y = -angle2D;

    if (matType === 'glass') {
      // Framed architectural glass partition
      const frameTrim = 2.0;
      const glassThick = 0.5;

      // Outer metal frame
      const frameGeom = new THREE.BoxGeometry(length, height, thickness);
      const frameMesh = new THREE.Mesh(frameGeom, MaterialPalette3D.partitionFrameMaterial);
      frameMesh.position.set(0, height / 2, 0);
      frameMesh.castShadow = true;
      group.add(frameMesh);

      // Glass inner pane
      const innerW = Math.max(1, length - frameTrim * 2);
      const innerH = Math.max(1, height - frameTrim * 2);
      const glassGeom = new THREE.BoxGeometry(innerW, innerH, glassThick);
      const glassMesh = new THREE.Mesh(glassGeom, MaterialPalette3D.windowGlassMaterial);
      glassMesh.position.set(0, height / 2, 0);
      group.add(glassMesh);
    } else {
      // Solid Drywall or Wood panel partition
      const geom = new THREE.BoxGeometry(length, height, thickness);
      const mat =
        matType === 'wood'
          ? MaterialPalette3D.partitionWoodMaterial
          : MaterialPalette3D.partitionDrywallMaterial;

      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(0, height / 2, 0);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }

    group.userData = {
      entityId: partition.id,
      type: 'partition',
      length,
      height,
      thickness,
    };

    return group;
  }
}
