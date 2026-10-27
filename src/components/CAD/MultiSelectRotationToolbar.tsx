import React, { useState, useCallback } from 'react';
import { RefreshCw, ChevronDown, ChevronRight, ArrowRight, RotateCw, RotateCcw, AlertTriangle } from 'lucide-react';

export type BatchRotationMode = 'in_place' | 'group';
/** Computed from the current rotation values of selected racks */
export type DirectionState = 'horizontal' | 'vertical' | 'mixed';

interface MultiSelectRotationToolbarProps {
  selectionCount: number;
  /** Detected direction of the current selection */
  directionState: DirectionState;
  /** Collision/overlap warning — set to non-empty string when a toggled rack would collide */
  collisionWarning?: string;
  /** Primary group direction-toggle action (rigid group rotation around shared pivot) */
  onToggleDirection: () => void;
  /** Make ALL racks horizontal (abs rotation = 0 deg) */
  onMakeAllHorizontal: () => void;
  /** Make ALL racks vertical (abs rotation = 90 deg) */
  onMakeAllVertical: () => void;
  /** Rotate entire group 90° clockwise around shared pivot */
  onRotateGroupCW?: () => void;
  /** Rotate entire group 90° counterclockwise around shared pivot */
  onRotateGroupCCW?: () => void;
  /** Free-angle delta rotation (in_place or group) */
  onRotateDelta: (angleDeg: number, mode: BatchRotationMode) => void;
  /** Set absolute rotation on all selected */
  onSetAbsolute: (angleDeg: number) => void;
  /** Reset to 0 deg */
  onResetRotation: () => void;
  /** Dismiss warning without applying */
  onDismissWarning?: () => void;
  /** Clear selection */
  onClearSelection: () => void;
}

const QUICK_ANGLES = [0, 45, 90, 135, 180, 270];
const PRESET_DELTAS = [
  { label: '-90\u00b0', value: -90 },
  { label: '-45\u00b0', value: -45 },
  { label: '+45\u00b0', value: 45 },
  { label: '+90\u00b0', value: 90 },
];

export const MultiSelectRotationToolbar: React.FC<MultiSelectRotationToolbarProps> = ({
  selectionCount,
  directionState,
  collisionWarning,
  onToggleDirection,
  onMakeAllHorizontal,
  onMakeAllVertical,
  onRotateGroupCW,
  onRotateGroupCCW,
  onRotateDelta,
  onSetAbsolute,
  onResetRotation,
  onDismissWarning,
  onClearSelection,
}) => {
  const [mode, setMode] = useState<BatchRotationMode>('group');
  const [customAngle, setCustomAngle] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showQuick, setShowQuick] = useState(false);

  const disabled = selectionCount === 0;

  const handleCustomApply = useCallback(() => {
    const val = parseFloat(customAngle);
    if (!isNaN(val)) {
      onRotateDelta(val, mode);
      setCustomAngle('');
    }
  }, [customAngle, mode, onRotateDelta]);

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleCustomApply();
    if (e.key === 'Escape') { setCustomAngle(''); }
  };

  const handleGroupCW = useCallback(() => {
    if (onRotateGroupCW) {
      onRotateGroupCW();
    } else {
      onRotateDelta(90, 'group');
    }
  }, [onRotateGroupCW, onRotateDelta]);

  const handleGroupCCW = useCallback(() => {
    if (onRotateGroupCCW) {
      onRotateGroupCCW();
    } else {
      onRotateDelta(-90, 'group');
    }
  }, [onRotateGroupCCW, onRotateDelta]);

  if (selectionCount === 0) return null;

  /* ---- Derive primary button text ---- */
  const primaryLabel =
    directionState === 'horizontal' ? 'Turn Vertical (Group)' :
    directionState === 'vertical'   ? 'Turn Horizontal (Group)' :
    null; // mixed — show both explicit buttons instead

  /* ---- Direction icons ---- */
  const HorizIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="2" y="8" width="20" height="8" rx="1.5"/>
      <line x1="12" y1="8" x2="12" y2="16"/>
    </svg>
  );
  const VertIcon = () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="8" y="2" width="8" height="20" rx="1.5"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  );

  return (
    <div className="flex items-center gap-1.5 bg-slate-900/98 border border-indigo-500/50 backdrop-blur-sm rounded-xl px-2.5 py-1.5 shadow-2xl shadow-indigo-900/40 text-xs select-none">

      {/* ── Selection badge ── */}
      <div className="flex items-center gap-1 mr-0.5">
        <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">
          {selectionCount}
        </span>
        <span className="text-indigo-300 font-semibold text-[11px] hidden md:inline leading-none">
          rack{selectionCount !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="h-4 w-px bg-slate-700" />

      {/* ── Collision warning banner ── */}
      {collisionWarning && (
        <div className="flex items-center gap-1.5 bg-amber-500/15 border border-amber-500/40 rounded-lg px-2 py-1 text-amber-300 text-[10px] font-semibold">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
          <span className="max-w-[200px] truncate" title={collisionWarning}>{collisionWarning}</span>
          {onDismissWarning && (
            <button
              onClick={onDismissWarning}
              className="ml-1 text-amber-400/70 hover:text-amber-300 text-[10px] font-bold transition-colors"
              title="Dismiss warning"
            >
              ✕
            </button>
          )}
        </div>
      )}
      {collisionWarning && <div className="h-4 w-px bg-slate-700" />}

      {/* ── PRIMARY: Group transformation action (Rigid rotation around shared pivot) ── */}
      {primaryLabel ? (
        <button
          onClick={onToggleDirection}
          disabled={disabled}
          title={
            directionState === 'horizontal'
              ? 'Rotate entire selected group 90° clockwise around shared bounding-box pivot to make it vertical'
              : 'Rotate entire selected group 90° clockwise around shared bounding-box pivot to make it horizontal'
          }
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow shadow-indigo-900/50"
        >
          {directionState === 'horizontal' ? <VertIcon /> : <HorizIcon />}
          <span>{primaryLabel}</span>
        </button>
      ) : (
        /* Mixed selection — show both explicit buttons */
        <div className="flex items-center gap-1">
          <span className="text-slate-500 text-[10px] font-semibold pr-0.5">Mixed:</span>
          <button
            onClick={onMakeAllHorizontal}
            disabled={disabled}
            title="Make all selected racks horizontal (rotation = 0°)"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700 hover:bg-indigo-600 text-slate-200 hover:text-white font-semibold text-[11px] disabled:opacity-40 transition-all"
          >
            <HorizIcon />
            <span>All Horiz</span>
          </button>
          <ArrowRight className="w-3 h-3 text-slate-600" />
          <button
            onClick={onMakeAllVertical}
            disabled={disabled}
            title="Make all selected racks vertical (rotation = 90°)"
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-700 hover:bg-indigo-600 text-slate-200 hover:text-white font-semibold text-[11px] disabled:opacity-40 transition-all"
          >
            <VertIcon />
            <span>All Vert</span>
          </button>
        </div>
      )}

      {/* ── DEDICATED GROUP ROTATION BUTTONS ── */}
      <div className="flex items-center gap-1 bg-slate-800/80 border border-slate-700/80 rounded-lg p-0.5">
        <button
          onClick={handleGroupCCW}
          disabled={disabled}
          title="Rotate entire group 90° counterclockwise (-90°) around shared bounding-box pivot"
          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-violet-600 text-slate-200 hover:text-white text-[11px] font-semibold disabled:opacity-40 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5 text-violet-400 group-hover:text-white" />
          <span>Group -90°</span>
        </button>
        <button
          onClick={handleGroupCW}
          disabled={disabled}
          title="Rotate entire group 90° clockwise (+90°) around shared bounding-box pivot"
          className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-violet-600 text-slate-200 hover:text-white text-[11px] font-semibold disabled:opacity-40 transition-all"
        >
          <RotateCw className="w-3.5 h-3.5 text-violet-400 group-hover:text-white" />
          <span>Group +90°</span>
        </button>
      </div>

      <div className="h-4 w-px bg-slate-700" />

      {/* ── ADVANCED / INDIVIDUAL IN-PLACE CONTROLS (collapsible) ── */}
      <button
        onClick={() => setShowAdvanced(v => !v)}
        title="Show / hide advanced angle controls (Group vs In Place)"
        className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors text-[10px] font-semibold"
      >
        {showAdvanced ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span className="hidden sm:inline">Advanced</span>
      </button>

      {showAdvanced && (
        <>
          {/* Mode toggle: Group vs In Place */}
          <div className="flex items-center gap-0.5 bg-slate-800 border border-slate-700 p-0.5 rounded-lg">
            <button
              onClick={() => setMode('group')}
              title="Rotate entire group around shared bounding-box pivot"
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                mode === 'group' ? 'bg-violet-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Group Pivot
            </button>
            <button
              onClick={() => setMode('in_place')}
              title="Rotate each rack individually around its own center"
              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-all ${
                mode === 'in_place' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              In Place
            </button>
          </div>

          {/* Preset delta buttons */}
          {PRESET_DELTAS.map((p) => (
            <button
              key={p.value}
              onClick={() => onRotateDelta(p.value, mode)}
              disabled={disabled}
              title={`${mode === 'in_place' ? 'Rotate each rack in place' : 'Rotate group around shared pivot'} by ${p.label}`}
              className="px-1.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-mono text-[11px] font-semibold"
            >
              {p.label}
            </button>
          ))}

          {/* Custom angle + Quick set */}
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={customAngle}
              onChange={(e) => setCustomAngle(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              placeholder="°"
              min={-360}
              max={360}
              step={1}
              className="w-12 bg-slate-800 border border-slate-700 rounded px-1 py-0.5 text-[11px] text-white font-mono focus:outline-none focus:border-indigo-500 text-center"
              title={`Custom delta angle in degrees (${mode === 'group' ? 'Group' : 'In Place'}, Enter to apply)`}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={handleCustomApply}
              disabled={disabled || customAngle === ''}
              className="px-1.5 py-1 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white text-[10px] font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Apply
            </button>
          </div>

          {/* Quick set dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowQuick(v => !v)}
              title="Quick-set absolute rotation"
              className="px-1.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors flex items-center gap-0.5"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
            {showQuick && (
              <div className="absolute right-0 top-full mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden min-w-[100px]">
                <div className="px-2 py-1 text-[9px] text-slate-500 uppercase tracking-wider border-b border-slate-700">
                  Set Absolute
                </div>
                {QUICK_ANGLES.map((a) => (
                  <button
                    key={a}
                    onClick={() => { onSetAbsolute(a); setShowQuick(false); }}
                    className="w-full px-3 py-1.5 text-left text-[11px] text-slate-200 hover:bg-slate-700 hover:text-white transition-colors font-mono"
                  >
                    {a}°
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reset */}
          <button
            onClick={onResetRotation}
            disabled={disabled}
            title="Reset all selected racks to 0°"
            className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-amber-400 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </>
      )}

      <div className="h-4 w-px bg-slate-700" />

      {/* ── Clear selection ── */}
      <button
        onClick={onClearSelection}
        title="Clear selection (Escape)"
        className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors text-[10px] font-bold leading-none"
      >
        ✕
      </button>
    </div>
  );
};
