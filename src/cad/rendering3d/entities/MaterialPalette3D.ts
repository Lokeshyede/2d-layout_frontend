import * as THREE from 'three';

/**
 * Centralized, high-performance PBR material palette for 3D store architectural elements.
 * Materials are cached singletons to minimize draw calls and WebGL state changes.
 */
export class MaterialPalette3D {
  // Architectural Wall Plaster (Clean modern off-white retail plaster)
  public static readonly wallMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9, // slate-100
    roughness: 0.88,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  // Structural Column (Durable matte architectural concrete/slate)
  public static readonly columnMaterial = new THREE.MeshStandardMaterial({
    color: 0x94a3b8, // slate-400
    roughness: 0.7,
    metalness: 0.1,
  });

  // Column Accent (Subtle dark base plinth and cap)
  public static readonly columnAccentMaterial = new THREE.MeshStandardMaterial({
    color: 0x64748b, // slate-500
    roughness: 0.6,
    metalness: 0.2,
  });

  // Door Frame (Architectural dark slate powder-coated aluminum)
  public static readonly doorFrameMaterial = new THREE.MeshStandardMaterial({
    color: 0x334155, // slate-700
    roughness: 0.45,
    metalness: 0.4,
  });

  // Door Leaf (Warm modern commercial composite/wood door panel)
  public static readonly doorLeafMaterial = new THREE.MeshStandardMaterial({
    color: 0x475569, // slate-600
    roughness: 0.5,
    metalness: 0.2,
  });

  // Door Hardware (Brushed stainless steel lever and strike)
  public static readonly metalHardwareMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0, // slate-200
    roughness: 0.2,
    metalness: 0.9,
  });

  // Window Frame (Clean architectural white/silver anodized aluminum)
  public static readonly windowFrameMaterial = new THREE.MeshStandardMaterial({
    color: 0x475569, // slate-600
    roughness: 0.4,
    metalness: 0.5,
  });

  // Window Sill (Interior architectural stone/corian sill ledge)
  public static readonly windowSillMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0, // slate-200
    roughness: 0.75,
    metalness: 0.1,
  });

  // Window Glass (Realistic architectural tinted glass with transmission & physical refraction)
  public static readonly windowGlassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8, // sky-400
    transparent: true,
    opacity: 0.35,
    roughness: 0.05,
    transmission: 0.9,
    ior: 1.52,
    thickness: 0.5,
  });

  // Rolling Shutter Housing Box & Guides (Durable industrial galvanized steel)
  public static readonly shutterHousingMaterial = new THREE.MeshStandardMaterial({
    color: 0x475569, // slate-600
    roughness: 0.45,
    metalness: 0.6,
  });

  // Rolling Shutter Slat Curtain (Horizontal ribbed metal curtain)
  public static readonly shutterCurtainMaterial = new THREE.MeshStandardMaterial({
    color: 0x64748b, // slate-500
    roughness: 0.4,
    metalness: 0.7,
  });

  // Shutter Bottom Lock Bar (Sturdy grounding beam)
  public static readonly shutterLockBarMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // slate-800
    roughness: 0.5,
    metalness: 0.5,
  });

  // Security Gate Posts & Framework (Dark commercial security steel)
  public static readonly gateFrameMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // slate-800
    roughness: 0.4,
    metalness: 0.7,
  });

  // Security Gate Grille Bars (Brushed metallic security bars)
  public static readonly gateBarsMaterial = new THREE.MeshStandardMaterial({
    color: 0x94a3b8, // slate-400
    roughness: 0.3,
    metalness: 0.8,
  });

  // Glass Gate Stanchion / Pivot Posts (Mirror-polished chrome / stainless steel)
  public static readonly glassGateStanchionMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc, // slate-50
    roughness: 0.12,
    metalness: 0.95,
  });

  // Glass Gate Frameless Tempered Glass Leaf
  public static readonly glassGateLeafMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0ea5e9, // ocean sky
    transparent: true,
    opacity: 0.3,
    roughness: 0.02,
    transmission: 0.95,
    ior: 1.52,
    thickness: 0.75,
  });

  // Glass Gate Indicator / Accent (Subtle blue-violet access led ring)
  public static readonly glassGateLedMaterial = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
  });

  // Partition Drywall (Interior partition plasterboard)
  public static readonly partitionDrywallMaterial = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0, // slate-200
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  // Partition Wood (Warm architectural wood panel partition)
  public static readonly partitionWoodMaterial = new THREE.MeshStandardMaterial({
    color: 0xd97706, // amber-600
    roughness: 0.65,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });

  // Partition Glass Frame (Slim anodized frame)
  public static readonly partitionFrameMaterial = new THREE.MeshStandardMaterial({
    color: 0x334155, // slate-700
    roughness: 0.4,
    metalness: 0.6,
  });

  // Store Floor (High-traffic commercial light terrazzo / resin floor)
  public static readonly floorMaterial = new THREE.MeshStandardMaterial({
    color: 0xf8fafc, // slate-50
    roughness: 0.75,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });

  // Store Ceiling (Flat architectural acoustic plasterboard)
  public static readonly ceilingMaterial = new THREE.MeshStandardMaterial({
    color: 0xf1f5f9, // slate-100
    roughness: 0.92,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
}
