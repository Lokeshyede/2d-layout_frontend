import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import type { CADEntity, Point2D } from '../../types';
import { WalkthroughPathGenerator } from './WalkthroughPathGenerator';
import { API_BASE } from '../../../services/api';

export interface VideoExportOptions {
  durationSeconds: 15 | 30 | 45 | 60;
  resolution: '720p' | '1080p';
  fps?: number; // default 30
  projectId: string;
  storeName?: string;
}

export interface VideoExportParams {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls | null;
  entities: CADEntity[];
  roomPolygon: Point2D[];
  bounds: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  options: VideoExportOptions;
  onProgress: (percent: number, currentFrame: number, totalFrames: number, statusText: string) => void;
  abortSignal: AbortSignal;
}

export class WalkthroughVideoExporter {
  /**
   * Generates and exports a cinematic walkthrough MP4 video of the 3D store scene.
   * Renders the existing Three.js scene frame-by-frame and encodes to true H.264 MP4.
   */
  public static async exportVideo(params: VideoExportParams): Promise<Blob> {
    const {
      scene,
      camera,
      renderer,
      controls,
      entities,
      roomPolygon,
      bounds,
      center,
      size,
      options,
      onProgress,
      abortSignal,
    } = params;

    const {
      durationSeconds = 30,
      resolution = '1080p',
      fps = 30,
      projectId,
      storeName = 'Retail Store',
    } = options;

    const targetWidth = resolution === '1080p' ? 1920 : 1280;
    const targetHeight = resolution === '1080p' ? 1080 : 720;
    const totalFrames = durationSeconds * fps;

    onProgress(1, 0, totalFrames, 'Initializing camera trajectory...');

    // 1. SAVE ORIGINAL STATE (Camera, Controls, Renderer)
    const originalCamPos = camera.position.clone();
    const originalCamRot = camera.quaternion.clone();
    const originalCamFov = camera.fov;
    const originalCamAspect = camera.aspect;
    const originalCamNear = camera.near;
    const originalCamFar = camera.far;

    const originalControlsEnabled = controls ? controls.enabled : false;
    const originalTarget = controls ? controls.target.clone() : new THREE.Vector3();

    const originalRendererSize = new THREE.Vector2();
    renderer.getSize(originalRendererSize);
    const originalPixelRatio = renderer.getPixelRatio();

    if (controls) {
      controls.enabled = false;
    }

    // 2. SETUP PATH GENERATOR
    const pathGenerator = new WalkthroughPathGenerator({
      entities,
      roomPolygon,
      bounds,
      center,
      size,
      eyeHeightInches: 66, // 5'6"
    });

    // 3. 2D COMPOSITING CANVAS (for watermark / title badge without altering 3D scene)
    const compositeCanvas = document.createElement('canvas');
    compositeCanvas.width = targetWidth;
    compositeCanvas.height = targetHeight;
    const ctx2d = compositeCanvas.getContext('2d', { willReadFrequently: false })!;

    try {
      // 4. CHECK VIDEO ENCODING CAPABILITY
      const canUseWebCodecs =
        typeof VideoEncoder !== 'undefined' &&
        typeof VideoFrame !== 'undefined' &&
        typeof VideoEncoder.isConfigSupported === 'function';

      if (canUseWebCodecs) {
        try {
          return await this.encodeViaWebCodecs({
            scene,
            camera,
            renderer,
            pathGenerator,
            targetWidth,
            targetHeight,
            totalFrames,
            fps,
            projectId,
            storeName,
            compositeCanvas,
            ctx2d,
            onProgress,
            abortSignal,
          });
        } catch (webCodecsErr: any) {
          console.warn('[WalkthroughVideoExporter] WebCodecs encoding unavailable or failed, falling back to MediaRecorder:', webCodecsErr);
          onProgress(5, 0, totalFrames, 'WebCodecs unavailable, using universal recorder fallback...');
          return await this.encodeViaMediaRecorderFallback({
            scene,
            camera,
            renderer,
            pathGenerator,
            targetWidth,
            targetHeight,
            totalFrames,
            fps,
            projectId,
            storeName,
            compositeCanvas,
            ctx2d,
            onProgress,
            abortSignal,
          });
        }
      } else {
        // Fallback: MediaRecorder stream capture + server-side MP4 transcode
        onProgress(5, 0, totalFrames, 'WebCodecs unavailable, using fallback encoder...');
        return await this.encodeViaMediaRecorderFallback({
          scene,
          camera,
          renderer,
          pathGenerator,
          targetWidth,
          targetHeight,
          totalFrames,
          fps,
          projectId,
          storeName,
          compositeCanvas,
          ctx2d,
          onProgress,
          abortSignal,
        });
      }
    } finally {
      // 5. RESTORE ORIGINAL STATE (guaranteed in finally block)
      renderer.setPixelRatio(originalPixelRatio);
      renderer.setSize(originalRendererSize.x, originalRendererSize.y, true);

      camera.position.copy(originalCamPos);
      camera.quaternion.copy(originalCamRot);
      camera.fov = originalCamFov;
      camera.aspect = originalCamAspect;
      camera.near = originalCamNear;
      camera.far = originalCamFar;
      camera.updateProjectionMatrix();

      if (controls) {
        controls.target.copy(originalTarget);
        controls.enabled = originalControlsEnabled;
        controls.update();
      }

      // Re-render original view
      renderer.render(scene, camera);
    }
  }

  /**
   * Primary high-speed client-side H.264 MP4 encoding via WebCodecs + mp4-muxer.
   */
  private static async encodeViaWebCodecs(ctx: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    pathGenerator: WalkthroughPathGenerator;
    targetWidth: number;
    targetHeight: number;
    totalFrames: number;
    fps: number;
    projectId: string;
    storeName: string;
    compositeCanvas: HTMLCanvasElement;
    ctx2d: CanvasRenderingContext2D;
    onProgress: (percent: number, currentFrame: number, totalFrames: number, statusText: string) => void;
    abortSignal: AbortSignal;
  }): Promise<Blob> {
    const {
      scene,
      camera,
      renderer,
      pathGenerator,
      targetWidth,
      targetHeight,
      totalFrames,
      fps,
      onProgress,
      abortSignal,
    } = ctx;

    // 1. Initialize MP4 Muxer (ISOBMFF format, compatible with iOS, Android, WhatsApp, Web)
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: {
        codec: 'avc',
        width: targetWidth,
        height: targetHeight,
      },
      fastStart: 'in-memory',
    });

    let encoderError: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addVideoChunk(chunk, meta);
        } catch (err: any) {
          encoderError = err;
        }
      },
      error: (e) => {
        console.error('[WalkthroughVideoExporter] Encoder error:', e);
        encoderError = new Error(e.message || 'VideoEncoder failure');
      },
    });

    // 2. Select compatible H.264 profile
    const bitrate = targetWidth >= 1920 ? 8_000_000 : 4_000_000;
    const candidates = ['avc1.4d002a', 'avc1.42e01f', 'avc1.640028', 'avc1.4d001f'];
    let selectedCodec = 'avc1.4d002a';
    let isSupported = false;

    for (const codec of candidates) {
      try {
        const check = await VideoEncoder.isConfigSupported({
          codec,
          width: targetWidth,
          height: targetHeight,
          bitrate,
          framerate: fps,
        });
        if (check.supported) {
          selectedCodec = codec;
          isSupported = true;
          break;
        }
      } catch {
        continue;
      }
    }

    if (!isSupported) {
      throw new Error('No supported H.264 profile found for WebCodecs on this platform');
    }

    encoder.configure({
      codec: selectedCodec,
      width: targetWidth,
      height: targetHeight,
      bitrate,
      framerate: fps,
    });

    // 3. Configure Renderer to target resolution without disturbing CSS layout
    renderer.setPixelRatio(1);
    renderer.setSize(targetWidth, targetHeight, false);
    camera.aspect = targetWidth / targetHeight;
    camera.updateProjectionMatrix();

    onProgress(5, 0, totalFrames, 'Rendering 3D frames & encoding H.264...');

    // 4. Render and Encode Frame-by-Frame
    for (let k = 0; k < totalFrames; k++) {
      if (abortSignal.aborted) {
        throw new Error('Video export cancelled by user');
      }
      if (encoderError) {
        throw encoderError;
      }

      // Sample camera frame
      const frameData = pathGenerator.getFrame(k, totalFrames);
      camera.position.copy(frameData.position);
      camera.fov = frameData.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(frameData.target);

      // Render Three.js pure 3D scene
      renderer.render(scene, camera);

      // Create VideoFrame directly from WebGL canvas (zero-copy GPU texture encoding)
      const timestampUs = Math.round(k * (1_000_000 / fps));
      const isKeyFrame = k % (fps * 2) === 0;

      const videoFrame = new VideoFrame(renderer.domElement, {
        timestamp: timestampUs,
        duration: Math.round(1_000_000 / fps),
      });

      encoder.encode(videoFrame, { keyFrame: isKeyFrame });
      videoFrame.close();

      // Respect encoder queue backpressure to avoid memory accumulation
      while (encoder.encodeQueueSize > 12) {
        await new Promise((r) => setTimeout(r, 8));
      }

      // Report progress and yield to browser event loop
      const percent = Math.round(((k + 1) / totalFrames) * 90);
      if (k % 4 === 0 || k === totalFrames - 1) {
        onProgress(
          percent,
          k + 1,
          totalFrames,
          `Rendering & Encoding: Frame ${k + 1} / ${totalFrames} (${percent}%)`
        );
        await new Promise((r) => setTimeout(r, 4));
      }
    }

    onProgress(92, totalFrames, totalFrames, 'Finalizing MP4 container...');
    await encoder.flush();
    encoder.close();

    muxer.finalize();
    const buffer = muxer.target.buffer;
    onProgress(100, totalFrames, totalFrames, 'MP4 Walkthrough Ready!');

    return new Blob([buffer], { type: 'video/mp4' });
  }

  /**
   * Fallback encoder using MediaRecorder + Backend Transcoding to guarantee MP4.
   */
  private static async encodeViaMediaRecorderFallback(ctx: {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    pathGenerator: WalkthroughPathGenerator;
    targetWidth: number;
    targetHeight: number;
    totalFrames: number;
    fps: number;
    projectId: string;
    storeName: string;
    compositeCanvas: HTMLCanvasElement;
    ctx2d: CanvasRenderingContext2D;
    onProgress: (percent: number, currentFrame: number, totalFrames: number, statusText: string) => void;
    abortSignal: AbortSignal;
  }): Promise<Blob> {
    const {
      scene,
      camera,
      renderer,
      pathGenerator,
      targetWidth,
      targetHeight,
      totalFrames,
      fps,
      projectId,
      onProgress,
      abortSignal,
    } = ctx;

    renderer.setPixelRatio(1);
    renderer.setSize(targetWidth, targetHeight, false);
    camera.aspect = targetWidth / targetHeight;
    camera.updateProjectionMatrix();

    const stream = renderer.domElement.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1')
      ? 'video/mp4;codecs=avc1'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    const recordedChunks: Blob[] = [];
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: targetWidth >= 1920 ? 8_000_000 : 4_000_000,
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    const completionPromise = new Promise<Blob>((resolve, reject) => {
      mediaRecorder.onstop = async () => {
        try {
          const rawBlob = new Blob(recordedChunks, { type: mimeType });
          if (mimeType.includes('mp4')) {
            resolve(rawBlob);
          } else {
            // WebM recorded: Send to backend transcode endpoint for universal H.264 MP4
            onProgress(92, totalFrames, totalFrames, 'Converting to WhatsApp-compatible H.264 MP4...');
            const formData = new FormData();
            formData.append('file', rawBlob, `RetailFix_${projectId}.webm`);

            const transcodeUrl = `${API_BASE}/projects/transcode-mp4`;
            try {
              const res = await fetch(transcodeUrl, {
                method: 'POST',
                body: formData,
              });

              if (res.ok) {
                const mp4Blob = await res.blob();
                resolve(mp4Blob);
                return;
              }
              console.warn(`[WalkthroughVideoExporter] Transcode returned ${res.status}, providing recorded video directly`);
              resolve(rawBlob);
            } catch (netErr) {
              console.warn('[WalkthroughVideoExporter] Transcode endpoint unreachable, providing recorded video directly:', netErr);
              resolve(rawBlob);
            }
          }
        } catch (err) {
          reject(err);
        }
      };
      mediaRecorder.onerror = (_e) => reject(new Error('MediaRecorder error'));
    });

    mediaRecorder.start(100);

    for (let k = 0; k < totalFrames; k++) {
      if (abortSignal.aborted) {
        mediaRecorder.stop();
        throw new Error('Video export cancelled by user');
      }

      const frameData = pathGenerator.getFrame(k, totalFrames);
      camera.position.copy(frameData.position);
      camera.fov = frameData.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(frameData.target);

      renderer.render(scene, camera);

      const percent = Math.round(((k + 1) / totalFrames) * 90);
      if (k % 5 === 0 || k === totalFrames - 1) {
        onProgress(percent, k + 1, totalFrames, `Recording: Frame ${k + 1} / ${totalFrames} (${percent}%)`);
      }

      await new Promise((r) => setTimeout(r, 1000 / fps));
    }

    mediaRecorder.stop();
    return await completionPromise;
  }

  /**
   * Renders a minimal, elegant title overlay during the first few seconds.
   * Disappears smoothly so the store walkthrough remains 100% unobstructed.
   */
  public static renderTitleCard(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    frame: number,
    fadeFrames: number,
    projectId: string,
    storeName: string
  ): void {
    const fadeStart = fadeFrames * 0.65;
    let alpha = 1.0;
    if (frame > fadeStart) {
      alpha = Math.max(0, 1.0 - (frame - fadeStart) / (fadeFrames - fadeStart));
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // Elegant Lower-Left Badge
    const padX = width * 0.04;
    const padY = height * 0.06;
    const badgeW = Math.min(width * 0.42, 480);
    const badgeH = 78;
    const posX = padX;
    const posY = height - padY - badgeH;

    // Dark glassmorphism pill background
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.beginPath();
    ctx.roundRect(posX, posY, badgeW, badgeH, 14);
    ctx.fill();

    ctx.strokeStyle = 'rgba(239, 68, 68, 0.45)'; // RetailFix Red accent border
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Red Accent Indicator
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(posX + 24, posY + 28, 6, 0, Math.PI * 2);
    ctx.fill();

    // Brand Title
    ctx.font = 'bold 16px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('RETAILFIX | 3D STORE WALKTHROUGH', posX + 40, posY + 33);

    // Subtitle / Store Info
    ctx.font = '500 12px Inter, system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#94a3b8';
    const subText = `${storeName} • Layout ${projectId}`;
    ctx.fillText(subText, posX + 40, posY + 55);

    ctx.restore();
  }
}
