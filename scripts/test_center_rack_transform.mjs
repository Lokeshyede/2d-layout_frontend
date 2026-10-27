globalThis.self = globalThis;
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import fs from 'fs';

const glbPath = 'backend/uploads/models/center_rack_43898c26.glb';
const buf = fs.readFileSync(glbPath);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new GLTFLoader();
loader.parse(ab, '', (gltf) => {
    const originalScene = gltf.scene;
    originalScene.updateMatrixWorld(true);

    const productBox = new THREE.Box3().setFromObject(originalScene);
    const pSize = new THREE.Vector3();
    productBox.getSize(pSize);
    const pCenter = new THREE.Vector3();
    productBox.getCenter(pCenter);

    const nativeUnitScale = 39.37007874; // meters to inches

    console.log('=== CENTER RACK NATIVE ANALYSIS ===');
    console.log(`Raw Size (meters): [${pSize.x.toFixed(4)}, ${pSize.y.toFixed(4)}, ${pSize.z.toFixed(4)}]`);
    console.log(`Raw Size (inches): [${(pSize.x * nativeUnitScale).toFixed(2)}", ${(pSize.y * nativeUnitScale).toFixed(2)}", ${(pSize.z * nativeUnitScale).toFixed(2)}"]`);
    console.log(`Raw Center: [${pCenter.x.toFixed(4)}, ${pCenter.y.toFixed(4)}, ${pCenter.z.toFixed(4)}]`);
    console.log(`Raw Min Y (Floor): ${productBox.min.y.toFixed(4)}m`);

    // Target CAD dimensions (rectangular 48" W x 24" D to test aspect ratio)
    const targetW = 48.0; // inches
    const targetH = 60.0; // inches
    const targetD = 24.0; // inches

    // For Center Rack:
    // Native Z (37.75") is Width
    // Native X (38.99") is Depth
    // Native Y (58.47") is Height
    // Rotation +90 deg around Y maps native Z to CAD X (Width) and native -X to CAD +Z (Depth)
    const rotDegY = 90;

    function buildCenterRackInstance(cadRotationDeg, cadX = 120, cadZ = 120) {
        const uploadedGLB = originalScene.clone(true);
        uploadedGLB.position.set(-pCenter.x, -productBox.min.y, -pCenter.z);

        const modelAnchor = new THREE.Group();
        modelAnchor.name = 'ModelAnchor';
        modelAnchor.rotation.y = (rotDegY * Math.PI) / 180;
        modelAnchor.add(uploadedGLB);

        const modelRoot = new THREE.Group();
        modelRoot.name = 'ModelRoot';
        modelRoot.add(modelAnchor);

        // When rotated by 90 deg:
        // Width is along native Z
        // Depth is along native X
        // Height is along native Y
        const unscaledRotWidth = pSize.z;
        const unscaledRotHeight = pSize.y;
        const unscaledRotDepth = pSize.x;

        const nativeInchesW = unscaledRotWidth * nativeUnitScale;
        const nativeInchesH = unscaledRotHeight * nativeUnitScale;
        const nativeInchesD = unscaledRotDepth * nativeUnitScale;

        const stage1ScaleX = (targetW / nativeInchesW) * nativeUnitScale;
        const stage1ScaleY = (targetH / nativeInchesH) * nativeUnitScale;
        const stage1ScaleZ = (targetD / nativeInchesD) * nativeUnitScale;

        modelRoot.scale.set(stage1ScaleX, stage1ScaleY, stage1ScaleZ);

        const rackInstance = new THREE.Group();
        rackInstance.name = 'RackInstance';
        rackInstance.add(modelRoot);

        // CAD world transform:
        // Position at (cadX, 0, cadZ)
        // Rotation around Y: -cadRotationDeg in radians (standard 2D CAD -> Three.js)
        const cadRotRad = (-cadRotationDeg * Math.PI) / 180;
        rackInstance.position.set(cadX, 0, cadZ);
        rackInstance.rotation.y = cadRotRad;

        rackInstance.updateMatrixWorld(true);

        const worldBox = new THREE.Box3().setFromObject(rackInstance);
        const worldSize = new THREE.Vector3();
        worldBox.getSize(worldSize);
        const worldCenter = new THREE.Vector3();
        worldBox.getCenter(worldCenter);

        return {
            cadRotationDeg,
            worldBox,
            worldSize,
            worldCenter,
            minY: worldBox.min.y,
            maxY: worldBox.max.y,
            stage1Scale: [stage1ScaleX, stage1ScaleY, stage1ScaleZ],
        };
    }

    console.log('\n=== TESTING CENTER RACK ROTATIONS: 0°, 90°, 180°, 270° ===');
    [0, 90, 180, 270].forEach(deg => {
        const res = buildCenterRackInstance(deg);
        console.log(`\nRotation: ${deg}°`);
        console.log(`  World Center: [${res.worldCenter.x.toFixed(2)}, ${res.worldCenter.y.toFixed(2)}, ${res.worldCenter.z.toFixed(2)}] (Expected: [120.00, 30.00, 120.00])`);
        console.log(`  World Size:   [${res.worldSize.x.toFixed(2)}", ${res.worldSize.y.toFixed(2)}", ${res.worldSize.z.toFixed(2)}"]`);
        console.log(`  Floor Y:      minY = ${res.minY.toFixed(4)}" (Expected: 0.0000"), maxY = ${res.maxY.toFixed(2)}" (Expected: 60.00")`);
        
        const centerError = Math.hypot(res.worldCenter.x - 120, res.worldCenter.z - 120);
        console.log(`  Center Translation Drift: ${centerError.toFixed(4)}" ${centerError < 0.01 ? '[PASS]' : '[FAIL]'}`);
        console.log(`  Floor Contact: ${Math.abs(res.minY) < 0.01 ? '[PASS: sits exactly on floor]' : '[FAIL]'}`);
        console.log(`  Height: ${Math.abs(res.maxY - targetH) < 0.01 ? '[PASS: 60 inches]' : '[FAIL]'}`);
    });
});
