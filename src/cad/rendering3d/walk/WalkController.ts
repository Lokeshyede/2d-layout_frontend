import * as THREE from 'three';
import { WalkCollisionEngine } from './WalkCollisionEngine';
import type { CADEntity, Point2D } from '../../types';
import {
  DEFAULT_WALK_EYE_HEIGHT,
  DEFAULT_WALK_SPEED,
  DEFAULT_RUN_SPEED,
  DEFAULT_TOTAL_COLLIDER_RADIUS,
} from '../PhysicalScale';

export interface WalkControllerOptions {
  camera: THREE.PerspectiveCamera;
  domElement: HTMLElement;
  entities: CADEntity[];
  roomPolygon: Point2D[];
  racksGroup?: THREE.Group;
  eyeHeight?: number; // inches, default 66 (5'6")
  walkSpeed?: number; // inches per second, default 54 (4.5 ft/s)
  runSpeed?: number;  // inches per second, default 96 (8.0 ft/s)
  fov?: number;       // default 60 deg
  mouseSensitivity?: number;
  onPointerLockChange?: (isLocked: boolean) => void;
}

export interface WalkDiagnostics {
  position: { x: number; y: number; z: number };
  eyeHeight: number;
  speed: number;
  isSprinting: boolean;
  isPointerLocked: boolean;
  yawDeg: number;
  pitchDeg: number;
  collisionObstaclesCount: number;
  isMoving: boolean;
}

export class WalkController {
  private camera: THREE.PerspectiveCamera;
  private domElement: HTMLElement;
  public collisionEngine: WalkCollisionEngine;

  // Authoritative physical walk settings
  public eyeHeight = DEFAULT_WALK_EYE_HEIGHT; // 66.0" (5'6")
  public walkSpeed = DEFAULT_WALK_SPEED;       // 54.0 in/s (4.5 ft/s)
  public runSpeed = DEFAULT_RUN_SPEED;         // 96.0 in/s (8.0 ft/s)
  public walkFov = 60.0;                       // Human natural field of view
  public mouseSensitivity = 0.0022;

  private yaw = 0; // horizontal rotation in radians
  private pitch = 0; // vertical rotation in radians

  private keysPressed: Set<string> = new Set();
  public isPointerLocked = false;
  private isEnabled = false;
  private isMoving = false;

  // Touch virtual inputs
  private touchMoveVector = { x: 0, y: 0 }; // x: strafe (-1 to 1), y: forward/back (-1 to 1)

  // Bound listeners
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundKeyUp: (e: KeyboardEvent) => void;
  private boundMouseMove: (e: MouseEvent) => void;
  private boundPointerLockChange: () => void;
  private boundCanvasClick: () => void;
  private onPointerLockCallback?: (isLocked: boolean) => void;

  constructor(options: WalkControllerOptions) {
    this.camera = options.camera;
    this.domElement = options.domElement;
    this.eyeHeight = options.eyeHeight ?? DEFAULT_WALK_EYE_HEIGHT;
    this.walkSpeed = options.walkSpeed ?? DEFAULT_WALK_SPEED;
    this.runSpeed = options.runSpeed ?? DEFAULT_RUN_SPEED;
    this.walkFov = options.fov ?? 60.0;
    this.mouseSensitivity = options.mouseSensitivity ?? 0.0022;
    this.onPointerLockCallback = options.onPointerLockChange;

    this.collisionEngine = new WalkCollisionEngine(
      options.entities,
      options.roomPolygon,
      options.racksGroup,
      DEFAULT_TOTAL_COLLIDER_RADIUS
    );

    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundPointerLockChange = this.handlePointerLockChange.bind(this);
    this.boundCanvasClick = this.handleCanvasClick.bind(this);
  }

  /**
   * Initializes player position inside the room and starts listening to inputs.
   *
   * SECTION 5 & 6: WALK START POSITION & ORIENTATION
   * Preserves horizontal viewing direction from Orbit camera where possible,
   * avoiding facing directly into a solid wall.
   */
  public enable(
    entities: CADEntity[],
    preferredPosition?: Point2D,
    preferredYaw?: number
  ): void {
    if (this.isEnabled) return;
    this.isEnabled = true;

    // Find valid interior spawn point (checks entrance first, then safe interior clearance)
    const spawn = this.collisionEngine.findWalkStartPosition(entities, preferredPosition, preferredYaw);
    this.camera.position.set(spawn.position.x, this.eyeHeight, spawn.position.y);
    this.yaw = spawn.initialYawRad;
    this.pitch = 0; // horizontal gaze
    this.updateCameraRotation();

    // Adjust camera perspective for first-person human vision
    this.camera.fov = this.walkFov;
    this.camera.near = 1.0;
    this.camera.far = 50000;
    this.camera.updateProjectionMatrix();

    // Attach event listeners
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.boundKeyDown);
      window.addEventListener('keyup', this.boundKeyUp);
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('mousemove', this.boundMouseMove);
      document.addEventListener('pointerlockchange', this.boundPointerLockChange);
    }
    this.domElement?.addEventListener?.('click', this.boundCanvasClick);
  }

  /**
   * Stops listening to inputs and releases pointer lock.
   */
  public disable(): void {
    if (!this.isEnabled) return;
    this.isEnabled = false;

    this.exitPointerLock();
    this.keysPressed.clear();
    this.touchMoveVector = { x: 0, y: 0 };
    this.isMoving = false;

    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.boundKeyDown);
      window.removeEventListener('keyup', this.boundKeyUp);
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('mousemove', this.boundMouseMove);
      document.removeEventListener('pointerlockchange', this.boundPointerLockChange);
    }
    this.domElement?.removeEventListener?.('click', this.boundCanvasClick);
  }

  public requestPointerLock(): void {
    try {
      this.domElement?.requestPointerLock?.();
    } catch (err) {
      console.warn('[WalkController] PointerLock request error:', err);
    }
  }

  public exitPointerLock(): void {
    if (typeof document !== 'undefined' && document.pointerLockElement === this.domElement) {
      document.exitPointerLock();
    }
  }

  private handleCanvasClick(): void {
    if (this.isEnabled && !this.isPointerLocked) {
      this.requestPointerLock();
    }
  }

  private handlePointerLockChange(): void {
    this.isPointerLocked = typeof document !== 'undefined' && document.pointerLockElement === this.domElement;
    if (this.onPointerLockCallback) {
      this.onPointerLockCallback(this.isPointerLocked);
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.isEnabled) return;
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd' || key === 'shift' || key === 'control') {
      this.keysPressed.add(key);
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    if (!this.isEnabled) return;
    const key = e.key.toLowerCase();
    this.keysPressed.delete(key);
  }

  /**
   * SECTION 28: LOOK CONTROLS
   * Horizontal mouse movement: yaw
   * Vertical mouse movement: pitch
   * Pitch clamped between -85° and +85° to prevent upside-down camera flipping.
   */
  private handleMouseMove(e: MouseEvent): void {
    if (!this.isEnabled) return;
    // Allow look if pointer is locked OR if mouse is dragged on canvas
    if (!this.isPointerLocked && (e.buttons & 1) === 0) return;

    const dx = e.movementX || 0;
    const dy = e.movementY || 0;

    this.yaw -= dx * this.mouseSensitivity;
    this.pitch -= dy * this.mouseSensitivity;

    // Pitch limit: -85 deg to +85 deg
    const maxPitch = (85 * Math.PI) / 180;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    this.updateCameraRotation();
  }

  /**
   * Virtual touch look swipe (e.g. from right-side touch area on mobile)
   */
  public addTouchLook(deltaX: number, deltaY: number): void {
    if (!this.isEnabled) return;
    const touchSensitivity = this.mouseSensitivity * 1.5;
    this.yaw -= deltaX * touchSensitivity;
    this.pitch -= deltaY * touchSensitivity;

    const maxPitch = (85 * Math.PI) / 180;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));

    this.updateCameraRotation();
  }

  /**
   * Virtual touch joystick vector (-1 to 1)
   */
  public setTouchMovement(x: number, y: number): void {
    this.touchMoveVector.x = Math.max(-1, Math.min(1, x));
    this.touchMoveVector.y = Math.max(-1, Math.min(1, y));
  }

  private updateCameraRotation(): void {
    const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
    const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), this.pitch);
    this.camera.quaternion.copy(qYaw.multiply(qPitch));
  }

  /**
   * Main per-frame update loop. Calculates collision-safe walking movement using delta time.
   *
   * SECTION 11: FRAME RATE INDEPENDENCE
   * Uses movementSpeed * deltaTime so movement speed is identical across 30, 60, and 120 FPS.
   */
  public update(deltaTime: number): void {
    if (!this.isEnabled) return;

    // Clamp delta time to avoid large jumps when tab is inactive or frame drops
    const dt = Math.min(deltaTime, 0.1);

    // 1. Determine local movement input
    let inputForward = 0;
    let inputStrafe = 0;

    if (this.keysPressed.has('w')) inputForward += 1;
    if (this.keysPressed.has('s')) inputForward -= 1;
    if (this.keysPressed.has('d')) inputStrafe += 1;
    if (this.keysPressed.has('a')) inputStrafe -= 1;

    // Merge touch joystick
    inputForward += this.touchMoveVector.y;
    inputStrafe += this.touchMoveVector.x;

    // Normalize diagonal movement
    const len = Math.hypot(inputForward, inputStrafe);
    if (len > 1) {
      inputForward /= len;
      inputStrafe /= len;
    }

    if (len < 0.001) {
      this.isMoving = false;
      this.camera.position.y = this.eyeHeight;
      return;
    }

    this.isMoving = true;

    // Movement speed scaling (Walk vs Run vs Slow)
    const isRunning = this.keysPressed.has('shift');
    const isSlow = this.keysPressed.has('control');
    let speed = this.walkSpeed;
    if (isRunning) speed = this.runSpeed;
    else if (isSlow) speed = this.walkSpeed * 0.5;

    const distanceStep = speed * dt;

    // 2. Rotate local movement vector by horizontal yaw
    // In Three.js: Forward is along -Z in local camera space.
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);

    const worldDx = (inputStrafe * cosY - inputForward * sinY) * distanceStep;
    const worldDz = (inputStrafe * sinY + inputForward * cosY) * distanceStep;

    const currentPos = { x: this.camera.position.x, y: this.camera.position.z };
    const desiredPos = { x: currentPos.x + worldDx, y: currentPos.y + worldDz };

    // 3. Resolve collision against 2D CAD obstacles with smooth sliding
    const safePos = this.collisionEngine.resolvePosition(currentPos, desiredPos);

    this.camera.position.x = safePos.x;
    this.camera.position.z = safePos.y;
    this.camera.position.y = this.eyeHeight; // Strictly locked to floor height + human eye level
  }

  /**
   * SECTION 38: DEBUG INFORMATION
   * Returns current walk diagnostics for development HUD.
   */
  public getDiagnostics(): WalkDiagnostics {
    const isRunning = this.keysPressed.has('shift');
    const currentSpeed = this.isMoving ? (isRunning ? this.runSpeed : this.walkSpeed) : 0;

    return {
      position: {
        x: Math.round(this.camera.position.x * 10) / 10,
        y: Math.round(this.camera.position.y * 10) / 10,
        z: Math.round(this.camera.position.z * 10) / 10,
      },
      eyeHeight: this.eyeHeight,
      speed: Math.round(currentSpeed * 10) / 10,
      isSprinting: isRunning,
      isPointerLocked: this.isPointerLocked,
      yawDeg: Math.round(((this.yaw * 180) / Math.PI) * 10) / 10,
      pitchDeg: Math.round(((this.pitch * 180) / Math.PI) * 10) / 10,
      collisionObstaclesCount: this.collisionEngine.getObstacles().length,
      isMoving: this.isMoving,
    };
  }
}
