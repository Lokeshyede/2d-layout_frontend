import React, { useState, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { CADEntity, Point2D } from '../../types';
import {
  WalkthroughVideoExporter,
  type VideoExportOptions,
} from './WalkthroughVideoExporter';
import {
  Video,
  X,
  Download,
  Loader2,
  CheckCircle2,
  Film,
  Sparkles,
  AlertCircle,
  Clock,
  Layers,
  Smartphone,
} from 'lucide-react';

interface ExportWalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls | null;
  entities: CADEntity[];
  roomPolygon: Point2D[];
  bounds: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  projectId?: string;
  storeName?: string;
}

type PresetMode = 'quick' | 'hd' | 'custom';

export const ExportWalkthroughModal: React.FC<ExportWalkthroughModalProps> = ({
  isOpen,
  onClose,
  scene,
  camera,
  renderer,
  controls,
  entities,
  roomPolygon,
  bounds,
  center,
  size,
  projectId = 'Store',
  storeName = 'RetailFix Store',
}) => {
  const [preset, setPreset] = useState<PresetMode>('hd');
  const [duration, setDuration] = useState<15 | 30 | 45 | 60>(30);
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');

  // Export State
  const [isExporting, setIsExporting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [downloadBlob, setDownloadBlob] = useState<Blob | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  if (!isOpen) return null;

  const handlePresetSelect = (mode: PresetMode) => {
    setPreset(mode);
    if (mode === 'quick') {
      setDuration(30);
      setResolution('720p');
    } else if (mode === 'hd') {
      setDuration(30);
      setResolution('1080p');
    }
  };

  const handleStartExport = async () => {
    setIsExporting(true);
    setProgressPercent(0);
    setCurrentFrame(0);
    setTotalFrames(duration * 30);
    setStatusText('Preparing 3D scene & camera path...');
    setErrorMessage(null);
    setDownloadBlob(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const options: VideoExportOptions = {
      durationSeconds: duration,
      resolution,
      fps: 30,
      projectId,
      storeName,
    };

    try {
      const blob = await WalkthroughVideoExporter.exportVideo({
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
        onProgress: (percent, curFrame, totFrames, status) => {
          setProgressPercent(percent);
          setCurrentFrame(curFrame);
          setTotalFrames(totFrames);
          setStatusText(status);
        },
        abortSignal: abortController.signal,
      });

      setDownloadBlob(blob);
      const url = URL.createObjectURL(blob);
      setDownloadUrl(url);

      // Auto-trigger download
      triggerDownload(blob, `RetailFix_Store_Walkthrough_${projectId}.mp4`);
    } catch (err: any) {
      if (err.message?.includes('cancelled')) {
        setStatusText('Export cancelled');
      } else {
        console.error('[ExportWalkthroughModal] Export error:', err);
        setErrorMessage(err.message || 'Failed to export walkthrough video');
      }
    } finally {
      setIsExporting(false);
      abortControllerRef.current = null;
    }
  };

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleClose = () => {
    if (isExporting) {
      handleCancel();
    }
    if (downloadUrl) {
      URL.revokeObjectURL(downloadUrl);
      setDownloadUrl(null);
    }
    onClose();
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-retailfix-red-600/20 text-retailfix-red-400 border border-retailfix-red-500/30">
              <Video className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
                Export Walkthrough Video
                <span className="text-[10px] font-mono uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  MP4 / H.264
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Automated cinematic walkthrough rendered directly from the current 3D store
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 space-y-5">
          {/* Preset Selector */}
          {!isExporting && !downloadBlob && (
            <div className="space-y-4">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                Export Mode Presets
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handlePresetSelect('quick')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    preset === 'quick'
                      ? 'border-retailfix-red-500 bg-retailfix-red-600/10 text-white shadow-md'
                      : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs">Quick Video</span>
                    <Smartphone className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <p className="text-[11px] text-slate-400">30 sec • 720p</p>
                  <p className="text-[10px] text-emerald-400 mt-1 font-mono">Fast / WhatsApp (~12 MB)</p>
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetSelect('hd')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    preset === 'hd'
                      ? 'border-retailfix-red-500 bg-retailfix-red-600/10 text-white shadow-md'
                      : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs">HD Presentation</span>
                    <Sparkles className="w-3.5 h-3.5 text-retailfix-red-400" />
                  </div>
                  <p className="text-[11px] text-slate-400">30 sec • 1080p</p>
                  <p className="text-[10px] text-sky-400 mt-1 font-mono">High Quality (~28 MB)</p>
                </button>

                <button
                  type="button"
                  onClick={() => handlePresetSelect('custom')}
                  className={`p-3.5 rounded-xl border text-left transition-all ${
                    preset === 'custom'
                      ? 'border-retailfix-red-500 bg-retailfix-red-600/10 text-white shadow-md'
                      : 'border-slate-800 bg-slate-950/40 text-slate-300 hover:border-slate-700 hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-xs">Custom</span>
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <p className="text-[11px] text-slate-400">Custom specs</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">Adjust duration & res</p>
                </button>
              </div>

              {/* Custom Options Accordion */}
              {preset === 'custom' && (
                <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-4 animate-in fade-in">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        Duration
                      </span>
                      <span className="text-xs font-mono text-retailfix-red-400 font-bold">{duration} Seconds</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      {[15, 30, 45, 60].map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setDuration(sec as any)}
                          className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            duration === sec
                              ? 'bg-retailfix-red-600 text-white border-retailfix-red-500 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {sec}s
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                        <Film className="w-3.5 h-3.5 text-slate-400" />
                        Resolution
                      </span>
                      <span className="text-xs font-mono text-retailfix-red-400 font-bold">
                        {resolution === '1080p' ? '1920 × 1080' : '1280 × 720'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {(['720p', '1080p'] as const).map((res) => (
                        <button
                          key={res}
                          type="button"
                          onClick={() => setResolution(res)}
                          className={`py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                            resolution === res
                              ? 'bg-retailfix-red-600 text-white border-retailfix-red-500 shadow-sm'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {res} ({res === '1080p' ? 'FHD' : 'HD'})
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Information Note */}
              <div className="p-3.5 rounded-xl bg-slate-950/50 border border-slate-800 text-xs text-slate-400 space-y-1">
                <div className="flex items-center gap-2 text-slate-300 font-medium">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Universal MP4 Video (H.264 / 30 FPS)</span>
                </div>
                <p className="text-[11px] pl-6 text-slate-400">
                  Ready to send via WhatsApp, Email, or download to any smartphone or PC without any special software.
                </p>
              </div>
            </div>
          )}

          {/* Exporting Progress */}
          {isExporting && (
            <div className="py-4 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-retailfix-red-400 animate-spin" />
                  Generating 3D Walkthrough...
                </span>
                <span className="font-mono text-retailfix-red-400 font-bold text-sm">
                  {progressPercent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden border border-slate-800 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-retailfix-red-600 via-rose-500 to-emerald-500 rounded-full transition-all duration-150"
                  style={{ width: `${Math.max(2, progressPercent)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span className="font-mono">{statusText}</span>
                {totalFrames > 0 && (
                  <span className="font-mono text-slate-400">
                    {currentFrame} / {totalFrames} frames
                  </span>
                )}
              </div>

              <div className="p-3 bg-slate-950/40 rounded-xl border border-slate-800/80 text-[11px] text-slate-400">
                Rendering pure 3D scene at {resolution} resolution. Original 3D view is completely preserved.
              </div>
            </div>
          )}

          {/* Download Ready State */}
          {downloadBlob && !isExporting && (
            <div className="py-4 space-y-4 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-white">Walkthrough Video Generated Successfully!</h3>
                <p className="text-xs text-slate-400">
                  Size: {(downloadBlob.size / (1024 * 1024)).toFixed(1)} MB • {resolution} • 30 FPS • H.264 MP4
                </p>
              </div>

              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    triggerDownload(downloadBlob, `RetailFix_Store_Walkthrough_${projectId}.mp4`)
                  }
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition-transform hover:scale-[1.02]"
                >
                  <Download className="w-4 h-4" />
                  Download MP4 Video
                </button>
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-800/60 text-xs text-red-300 flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/50">
          {isExporting ? (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
              >
                Cancel Export
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
              >
                {downloadBlob ? 'Close' : 'Cancel'}
              </button>

              {!downloadBlob && (
                <button
                  type="button"
                  onClick={handleStartExport}
                  className="px-5 py-2 bg-retailfix-red-600 hover:bg-retailfix-red-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-900/30 flex items-center gap-2 transition-transform hover:scale-[1.02]"
                >
                  <Video className="w-4 h-4" />
                  Start Video Export
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
