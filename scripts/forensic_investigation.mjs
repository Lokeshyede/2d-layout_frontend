globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';
import crypto from 'crypto';

const glbPath = 'backend/uploads/models/RACKS_a9a323ad.glb';
const buf = fs.readFileSync(glbPath);
const sha256 = crypto.createHash('sha256').update(buf).digest('hex');

console.log('=== PHASE 1: ASSET VERIFICATION ===');
console.log('File:', glbPath);
console.log('Size:', buf.length, 'bytes');
console.log('SHA-256:', sha256);

// GLB binary parsing for primitives, materials, accessors
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));

console.log('\n=== PHASE 2 & 8: RAW GLB FORENSIC INSPECTION ===');
console.log('Scenes count:', gltf.scenes?.length || 0);
console.log('Nodes count:', gltf.nodes?.length || 0);
console.log('Meshes count:', gltf.meshes?.length || 0);
console.log('Materials count:', gltf.materials?.length || 0);
console.log('Accessors count:', gltf.accessors?.length || 0);

let totalPrimitives = 0;
gltf.meshes.forEach(m => totalPrimitives += m.primitives.length);
console.log('Total Primitives:', totalPrimitives);

const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const loader = new GLTFLoader();

loader.parse(ab, '', (gltfScene) => {
    const scene = gltfScene.scene;
    scene.updateMatrixWorld(true);

    const entireBox = new THREE.Box3().setFromObject(scene);
    const entireSize = new THREE.Vector3();
    entireBox.getSize(entireSize);
    const entireSphere = new THREE.Sphere();
    entireBox.getBoundingSphere(entireSphere);

    console.log('Entire GLB Raw Bounding Box (min/max):', 
        `[${entireBox.min.x.toFixed(3)}, ${entireBox.min.y.toFixed(3)}, ${entireBox.min.z.toFixed(3)}] to [${entireBox.max.x.toFixed(3)}, ${entireBox.max.y.toFixed(3)}, ${entireBox.max.z.toFixed(3)}]`);
    console.log(`Entire GLB Extents: X=${entireSize.x.toFixed(3)}m, Y=${entireSize.y.toFixed(3)}m, Z=${entireSize.z.toFixed(3)}m`);
    console.log(`Entire GLB Bounding Sphere: center=[${entireSphere.center.x.toFixed(3)}, ${entireSphere.center.y.toFixed(3)}, ${entireSphere.center.z.toFixed(3)}], radius=${entireSphere.radius.toFixed(3)}m`);

    // Major Nodes
    console.log('\n--- MAJOR NODES ---');
    scene.children.forEach((c, idx) => {
        const box = new THREE.Box3().setFromObject(c);
        const sz = new THREE.Vector3();
        box.getSize(sz);
        console.log(`Node child ${idx} '${c.name}': pos=[${c.position.x.toFixed(2)}, ${c.position.y.toFixed(2)}, ${c.position.z.toFixed(2)}], scale=[${c.scale.x.toFixed(4)}, ${c.scale.y.toFixed(4)}, ${c.scale.z.toFixed(4)}], size=[${sz.x.toFixed(2)}, ${sz.y.toFixed(2)}, ${sz.z.toFixed(2)}]`);
        
        c.children.forEach((gc, gidx) => {
            const gbox = new THREE.Box3().setFromObject(gc);
            const gsz = new THREE.Vector3();
            gbox.getSize(gsz);
            console.log(`  Subchild ${gidx} '${gc.name}': children=${gc.children.length}, pos=[${gc.position.x.toFixed(2)}, ${gc.position.y.toFixed(2)}, ${gc.position.z.toFixed(2)}], scale=[${gc.scale.x.toFixed(4)}, ${gc.scale.y.toFixed(4)}, ${gc.scale.z.toFixed(4)}], size=[${gsz.x.toFixed(2)}, ${gsz.y.toFixed(2)}, ${gsz.z.toFixed(2)}]`);
        });
    });

    console.log('\n=== PHASE 3: EVERY MESH INSPECTION ===');
    const meshes = [];
    scene.traverse((obj) => {
        if (obj.isMesh) {
            const m = obj;
            const geom = m.geometry;
            const posAttr = geom.getAttribute('position');
            const vertCount = posAttr ? posAttr.count : 0;
            const indexAttr = geom.getIndex();
            const triCount = indexAttr ? indexAttr.count / 3 : vertCount / 3;
            
            const wBox = new THREE.Box3().setFromObject(m);
            const wSize = new THREE.Vector3();
            wBox.getSize(wSize);

            const mat = m.material;
            const matName = mat ? (Array.isArray(mat) ? mat.map(x=>x.name).join(',') : mat.name) : 'none';
            const matSide = mat ? (Array.isArray(mat) ? mat[0].side : mat.side) : 0;
            const sideStr = matSide === THREE.FrontSide ? 'FrontSide' : matSide === THREE.DoubleSide ? 'DoubleSide' : 'BackSide';
            const transparent = mat ? (Array.isArray(mat) ? mat.some(x=>x.transparent) : mat.transparent) : false;
            const opacity = mat ? (Array.isArray(mat) ? mat[0].opacity : mat.opacity) : 1;

            meshes.push({
                name: m.name || 'unnamed',
                vertCount,
                triCount: Math.round(triCount),
                visible: m.visible,
                frustumCulled: m.frustumCulled,
                pos: [m.position.x, m.position.y, m.position.z],
                rot: [m.rotation.x, m.rotation.y, m.rotation.z],
                scale: [m.scale.x, m.scale.y, m.scale.z],
                wBoxSize: [wSize.x, wSize.y, wSize.z],
                maxDim: Math.max(wSize.x, wSize.y, wSize.z),
                matName,
                sideStr,
                transparent,
                opacity,
                castShadow: m.castShadow,
                receiveShadow: m.receiveShadow,
            });
        }
    });

    console.log(`Total Meshes found: ${meshes.length}`);
    console.log('\nMesh Listing (sample of 45 meshes):');
    meshes.forEach((m, idx) => {
        console.log(`[#${idx.toString().padStart(2, '0')}] ${m.name.padEnd(12)} | Verts: ${m.vertCount.toString().padStart(5)} | Tris: ${m.triCount.toString().padStart(5)} | Vis: ${m.visible} | Side: ${m.sideStr} | Size: [${m.wBoxSize.map(v=>v.toFixed(2)).join(', ')}] | Mat: ${m.matName}`);
    });

    // Check shelf, upright, bracket presence
    const functionalRackMeshes = meshes.filter(m => m.maxDim <= 5.0);
    const auxMeshes = meshes.filter(m => m.maxDim > 5.0);
    console.log(`\nFunctional Rack Meshes: ${functionalRackMeshes.length}`);
    console.log(`Auxiliary Meshes: ${auxMeshes.length}`);

    let totalRackTris = 0;
    functionalRackMeshes.forEach(m => totalRackTris += m.triCount);
    console.log(`Total Functional Rack Triangles: ${totalRackTris}`);

    console.log('\n=== PHASE 5: AXIS MAPPING DIAGNOSTIC ===');
    // Rack bounding box alone:
    const rackBox = new THREE.Box3();
    scene.traverse((obj) => {
        if (obj.isMesh) {
            const b = new THREE.Box3().setFromObject(obj);
            const sz = new THREE.Vector3();
            b.getSize(sz);
            if (Math.max(sz.x, sz.y, sz.z) <= 5.0) {
                rackBox.union(b);
            }
        }
    });
    const rackSize = new THREE.Vector3();
    rackBox.getSize(rackSize);
    console.log(`Raw Rack Bounding Box in glTF (meters): X=${rackSize.x.toFixed(4)}m, Y=${rackSize.y.toFixed(4)}m, Z=${rackSize.z.toFixed(4)}m`);
    console.log(`Raw Rack Bounding Box in Inches:      X=${(rackSize.x * 39.3701).toFixed(2)}", Y=${(rackSize.y * 39.3701).toFixed(2)}", Z=${(rackSize.z * 39.3701).toFixed(2)}"`);
    console.log(`Notice:
    Raw X (0.539m = 21.23") = Rack DEPTH (shelves depth is ~18-22 inches)
    Raw Y (2.160m = 85.04") = Rack HEIGHT (standard 7ft = 84" rack)
    Raw Z (0.971m = 38.22") = Rack WIDTH (standard 3ft = 36" shelf span)
    
    Axis Mapping Table:
    Raw X (21.23") -> CAD Depth  (CAD Z)
    Raw Y (85.04") -> CAD Height (CAD Y)
    Raw Z (38.22") -> CAD Width  (CAD X)
    
    Rotation required to map Raw Z to CAD X and -Raw X to CAD Z: +90° rotation around Y!`);

    console.log('\n=== PHASE 9: MATERIAL INSPECTION ===');
    const materialsSummary = {};
    scene.traverse((obj) => {
        if (obj.isMesh && obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(mat => {
                if (!materialsSummary[mat.name || 'unnamed']) {
                    materialsSummary[mat.name || 'unnamed'] = {
                        side: mat.side === THREE.DoubleSide ? 'DoubleSide' : mat.side === THREE.FrontSide ? 'FrontSide' : 'BackSide',
                        transparent: mat.transparent,
                        opacity: mat.opacity,
                        depthWrite: mat.depthWrite,
                        color: mat.color ? '#' + mat.color.getHexString() : 'none',
                        roughness: mat.roughness,
                        metalness: mat.metalness,
                    };
                }
            });
        }
    });
    console.log('Materials in scene:', JSON.stringify(materialsSummary, null, 2));

    console.log('\n=== PHASE 10: SCALE COMPARISON ===');
    console.log('Raw GLB Dimensions:');
    console.log(`  Rack alone: W=${(rackSize.z*39.3701).toFixed(2)}" × H=${(rackSize.y*39.3701).toFixed(2)}" × D=${(rackSize.x*39.3701).toFixed(2)}"`);
    console.log(`  Entire GLB (with 28m building walls): W=${(entireSize.x*39.3701).toFixed(2)}" × H=${(entireSize.y*39.3701).toFixed(2)}" × D=${(entireSize.z*39.3701).toFixed(2)}"`);
    console.log('Database Dimensions: W=36.00" × H=84.00" × D=18.00"');
    console.log('Scaling factors if correctly filtered to Rack alone:');
    console.log(`  Scale X (Width):  36.00 / 38.22 = ${(36.00 / (rackSize.z*39.3701)).toFixed(4)}`);
    console.log(`  Scale Y (Height): 84.00 / 85.04 = ${(84.00 / (rackSize.y*39.3701)).toFixed(4)}`);
    console.log(`  Scale Z (Depth):  18.00 / 21.23 = ${(18.00 / (rackSize.x*39.3701)).toFixed(4)}`);
    console.log('Scaling factors if UNFILTERED (the bug):');
    console.log(`  Scale X: 36.00 / ${(entireSize.x*39.3701).toFixed(2)} = ${(36.00 / (entireSize.x*39.3701)).toFixed(6)}`);
    console.log(`  Scale Y: 84.00 / ${(entireSize.y*39.3701).toFixed(2)} = ${(84.00 / (entireSize.y*39.3701)).toFixed(6)}`);
    console.log(`  Scale Z: 18.00 / ${(entireSize.z*39.3701).toFixed(2)} = ${(18.00 / (entireSize.z*39.3701)).toFixed(6)}`);
    console.log('  -> This compresses the 28-meter building wall into 36" x 84" x 0.19" (a thin rectangular slab!) and shrinks the actual rack to a 1-inch microscopic speck!');
});
