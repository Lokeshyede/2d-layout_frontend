// Test wall attachment transform calculation for all walls and angles
function testWallRackTransform(wallAngleDeg, wallSide, inwardNormal) {
    const thickness = 9; // inches
    const epsilon = 0.08; // rendering clearance
    const halfThick = thickness / 2 + epsilon;

    let nx = inwardNormal ? inwardNormal.x : 0;
    let ny = inwardNormal ? inwardNormal.y : 0;

    if (!inwardNormal) {
        if (wallSide === 'top') { nx = 0; ny = 1; }
        else if (wallSide === 'bottom') { nx = 0; ny = -1; }
        else if (wallSide === 'left') { nx = 1; ny = 0; }
        else if (wallSide === 'right') { nx = -1; ny = 0; }
        else {
            const rad = wallAngleDeg * Math.PI / 180;
            nx = -Math.sin(rad);
            ny = Math.cos(rad);
        }
    }

    const rotY = Math.atan2(nx, ny);

    // Wall centerline anchor
    const cx = 100;
    const cy = 100;

    // Interior face attachment point
    const posX = cx + nx * halfThick;
    const posZ = cy + ny * halfThick;

    // Check where the rack's forward vector (+Z, length = 21") points:
    const forwardX = Math.sin(rotY) * 21;
    const forwardZ = Math.cos(rotY) * 21;

    console.log(`\nWall ${wallSide || wallAngleDeg + '°'}:`);
    console.log(`  Centerline: (${cx}, ${cy})`);
    console.log(`  Interior Face: (${posX.toFixed(2)}, ${posZ.toFixed(2)}) [offset +${halfThick.toFixed(2)}" along (${nx.toFixed(2)}, ${ny.toFixed(2)})]`);
    console.log(`  Rotation Y: ${(rotY * 180 / Math.PI).toFixed(1)}°`);
    console.log(`  Front of rack reaches: (${(posX + forwardX).toFixed(2)}, ${(posZ + forwardZ).toFixed(2)})`);
}

testWallRackTransform(0, 'top');
testWallRackTransform(0, 'bottom');
testWallRackTransform(90, 'left');
testWallRackTransform(90, 'right');
testWallRackTransform(42, null, { x: -Math.sin(42 * Math.PI / 180), y: Math.cos(42 * Math.PI / 180) });
