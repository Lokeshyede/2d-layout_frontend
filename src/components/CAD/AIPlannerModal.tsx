import React, { useState, useCallback } from "react";
import type { CADEntity, RackEntity, DimensionItem } from "../../cad/types";
import {
  RackPlannerEngine,
  DEFAULT_PLANNER_OPTIONS,
  type RackPlannerOptions,
  type RackPlannerStats,
  type PlanningStrategy,
} from "../../cad/ai/RackPlannerEngine";
import { formatFeetInches } from "../../cad/geometry/FeetInches";
import { X, Sparkles, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface AIPlannerModalProps {
  entities: CADEntity[];
  /** Called when Generate completes — shows racks + dims as canvas preview (not committed) */
  onApply: (racks: RackEntity[], dims: DimensionItem[]) => void;
  /** Called when user clicks Apply Layout — commits to CAD history */
  onApplyFinal: (racks: RackEntity[]) => void;
  onClose: () => void;
  roomShapeMode?: 'AUTO' | 'MANUAL';
}

type ModalState = "options" | "generating" | "preview" | "empty";

export const AIPlannerModal: React.FC<AIPlannerModalProps> = ({
  entities, onApply, onApplyFinal, onClose, roomShapeMode = 'AUTO'
}) => {
  const [modalState, setModalState] = useState<ModalState>("options");
  const [options, setOptions] = useState<RackPlannerOptions>({ ...DEFAULT_PLANNER_OPTIONS });
  const [suggestedRacks, setSuggestedRacks] = useState<RackEntity[]>([]);
  const [, setSuggestedDims] = useState<DimensionItem[]>([]);
  const [stats, setStats] = useState<RackPlannerStats | null>(null);
  const [emptyMessage, setEmptyMessage] = useState<string>("");

  const [aisleFt, setAisleFt] = useState(4);
  const [aisleIn, setAisleIn] = useState(0);
  const [clearFt, setClearFt] = useState(1);
  const [clearIn, setClearIn] = useState(0);

  const handleGenerate = useCallback(() => {
    const hasWalls = entities.some((e) => e.type === "wall");
    if (!hasWalls) {
      setEmptyMessage("Draw the store walls before using Auto Layout AI.");
      setModalState("empty");
      return;
    }

    setModalState("generating");
    const finalOptions: RackPlannerOptions = {
      ...options,
      minAisleInches: aisleFt * 12 + aisleIn,
      wallClearanceInches: clearFt * 12 + clearIn,
      roomShapeMode,
    };

    setTimeout(() => {
      try {
        const engine = new RackPlannerEngine(entities, finalOptions);
        const result = engine.run();
        if (result.racks.length === 0) {
          setEmptyMessage(result.message || "No valid layout could be generated.");
          onApply([], []);
          setModalState("empty");
        } else {
          setSuggestedRacks(result.racks);
          setSuggestedDims(result.aiDimensions);
          setStats(result.stats);
          onApply(result.racks, result.aiDimensions);
          setModalState("preview");
        }
      } catch (err) {
        console.error("[AI Planner]", err);
        setEmptyMessage("An error occurred during planning. Please check the console.");
        onApply([], []);
        setModalState("empty");
      }
    }, 80);
  }, [entities, options, aisleFt, aisleIn, clearFt, clearIn, onApply]);

  const handleApply = () => {
    onApplyFinal(suggestedRacks);
    setSuggestedDims([]);
  };

  const handleBack = () => {
    setSuggestedRacks([]);
    setSuggestedDims([]);
    setStats(null);
    onApply([], []);
    setModalState("options");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 bg-gradient-to-r from-violet-950/80 to-indigo-950/60 border-b border-slate-800">
          <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center shadow">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="font-extrabold text-sm text-white tracking-wide">AI RACK PLANNER</div>
            <div className="text-[10px] text-violet-300 font-mono">Professional Rack Layout Engine</div>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 overflow-y-auto max-h-[80vh]">

          {/* OPTIONS */}
          {(modalState === "options" || modalState === "generating") && (<>
            <section>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Rack Types</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "includeWallRacks",   label: "Wall Racks",    sub: "7'×3' / 7'×4' (continuous run)" },
                  { key: "includeCenterRacks", label: "Center Racks",  sub: "5'×3' gondola" },
                  { key: "includeEndcaps",     label: "Endcaps",       sub: "5'×3' row ends" },
                  { key: "includeCornerRacks", label: "Corner Racks",  sub: "2'×2'×2'" },
                ].map((item) => (
                  <label key={item.key} className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    (options as any)[item.key] ? "bg-violet-950/60 border-violet-600/60" : "bg-slate-800/60 border-slate-700/60"
                  }`}>
                    <input type="checkbox" checked={(options as any)[item.key]}
                      onChange={(e) => setOptions((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                      className="mt-0.5 accent-violet-500 w-3.5 h-3.5" />
                    <div>
                      <div className="text-xs font-semibold text-slate-200">{item.label}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{item.sub}</div>
                    </div>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Spacing Settings</div>
              <div className="space-y-3">
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                  <div className="text-xs text-slate-300 font-medium mb-2">Minimum Aisle Width</div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <input type="number" min={2} max={20} value={aisleFt} onChange={(e) => setAisleFt(Math.max(2, parseInt(e.target.value) || 2))}
                        className="w-14 bg-slate-900 border border-slate-600 rounded-lg p-1.5 text-xs text-center text-white font-mono" />
                      <span className="text-slate-400 text-xs">ft</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} max={11} value={aisleIn} onChange={(e) => setAisleIn(Math.min(11, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-14 bg-slate-900 border border-slate-600 rounded-lg p-1.5 text-xs text-center text-white font-mono" />
                      <span className="text-slate-400 text-xs">in</span>
                    </div>
                    <span className="text-[10px] text-violet-400 font-mono ml-auto">= {formatFeetInches(aisleFt * 12 + aisleIn)}</span>
                  </div>
                </div>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3">
                  <div className="text-xs text-slate-300 font-medium mb-2">Door / Column Clearance</div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} max={10} value={clearFt} onChange={(e) => setClearFt(Math.max(0, parseInt(e.target.value) || 0))}
                        className="w-14 bg-slate-900 border border-slate-600 rounded-lg p-1.5 text-xs text-center text-white font-mono" />
                      <span className="text-slate-400 text-xs">ft</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} max={11} value={clearIn} onChange={(e) => setClearIn(Math.min(11, Math.max(0, parseInt(e.target.value) || 0)))}
                        className="w-14 bg-slate-900 border border-slate-600 rounded-lg p-1.5 text-xs text-center text-white font-mono" />
                      <span className="text-slate-400 text-xs">in</span>
                    </div>
                    <span className="text-[10px] text-violet-400 font-mono ml-auto">= {formatFeetInches(clearFt * 12 + clearIn)}</span>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Planning Strategy</div>
              <select value={options.strategy}
                onChange={(e) => setOptions((prev) => ({ ...prev, strategy: e.target.value as PlanningStrategy }))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-sm text-white">
                <option value="balanced">⚖️ Balanced</option>
                <option value="max_wall">🧱 Maximum Wall Utilization</option>
                <option value="max_floor">🏪 Maximum Floor Utilization</option>
                <option value="spacious">🚶 Spacious / Easy Navigation</option>
              </select>
              <div className="mt-1.5 text-[10px] text-slate-500">
                {options.strategy === "balanced" && "Balances wall racks and center aisles."}
                {options.strategy === "max_wall" && "Prefers wider 7×4 racks to maximize wall coverage."}
                {options.strategy === "max_floor" && "Maximizes center rack rows per aisle."}
                {options.strategy === "spacious" && "Extra spacing between racks for easy navigation."}
              </div>
            </section>

            <div className="bg-indigo-950/40 border border-indigo-700/40 rounded-xl px-3 py-2.5 text-[11px] text-indigo-300">
              <span className="font-bold">Geometry-first engine:</span> 7×3 racks placed first (priority), then 7×4 in remaining space. Zero gap between adjacent racks. Remaining wall space + aisles shown with dimension lines.
            </div>

            <button onClick={handleGenerate} disabled={modalState === "generating"}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-violet-900/40 flex items-center justify-center gap-2 transition-all disabled:opacity-60 disabled:cursor-not-allowed">
              {modalState === "generating" ? (<><Loader2 className="w-4 h-4 animate-spin" />Calculating Layout…</>) : (<><Sparkles className="w-4 h-4" />Generate Rack Layout</>)}
            </button>
          </>)}

          {/* EMPTY */}
          {modalState === "empty" && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <AlertCircle className="w-10 h-10 text-amber-400" />
                <div className="text-sm font-semibold text-white">No Layout Generated</div>
                <div className="text-xs text-slate-400 max-w-xs">{emptyMessage}</div>
              </div>
              <button onClick={handleBack} className="w-full py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors">← Adjust Settings</button>
            </div>
          )}

          {/* PREVIEW */}
          {modalState === "preview" && stats && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 px-3 py-2 bg-emerald-950/60 border border-emerald-700/50 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="text-xs text-emerald-300 font-medium">
                  {stats.totalRacks} racks planned — preview on canvas
                </span>
              </div>

              {/* Per-wall breakdown */}
              {stats.wallRuns.length > 0 && (
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-700/60">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Wall Rack Runs</span>
                  </div>
                  {stats.wallRuns.map((run, i) => (
                    <div key={i} className="px-3 py-2.5 border-b border-slate-700/30 last:border-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">{run.side} Wall</span>
                        {run.remainingInches >= 6 && (
                          <span className="text-[10px] font-mono text-amber-400 bg-amber-950/40 px-1.5 py-0.5 rounded">
                            {formatFeetInches(run.remainingInches)} rem.
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {run.cornerRackCount > 0 && <WallTag label={`CRN 2×2 ×${run.cornerRackCount}`} color="text-emerald-400" />}
                        {run.wallRack7x3Count > 0 && <WallTag label={`W-RACK 7×3 ×${run.wallRack7x3Count}`} color="text-amber-400" />}
                        {run.wallRack7x4Count > 0 && <WallTag label={`W-RACK 7×4 ×${run.wallRack7x4Count}`} color="text-orange-400" />}
                        {(run.wallRack7x3Count + run.wallRack7x4Count) === 0 && run.cornerRackCount === 0 &&
                          <span className="text-[10px] text-slate-500 italic">No racks placed</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Totals */}
              <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
                <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">All Racks</span>
                </div>
                {stats.wallRack7x3Count > 0 && <RackRow label="Wall Rack 7'×3'" count={stats.wallRack7x3Count} color="text-amber-400" />}
                {stats.wallRack7x4Count > 0 && <RackRow label="Wall Rack 7'×4'" count={stats.wallRack7x4Count} color="text-orange-400" />}
                {stats.centerRackCount > 0  && <RackRow label="Center Rack 5'×3'" count={stats.centerRackCount} color="text-blue-400" />}
                {stats.endcapCount > 0      && <RackRow label="Endcap 5'×3'" count={stats.endcapCount} color="text-purple-400" />}
                {stats.cornerRackCount > 0  && <RackRow label="Corner Rack 2'×2'×2'" count={stats.cornerRackCount} color="text-emerald-400" />}
                <div className="flex items-center justify-between px-3 py-2.5 bg-slate-900/40">
                  <span className="text-xs font-bold text-white">Total</span>
                  <span className="text-sm font-extrabold text-violet-400 font-mono">{stats.totalRacks}</span>
                </div>
              </div>

              {/* Aisles */}
              {stats.aisles && stats.aisles.length > 0 && (
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden">
                  <div className="px-3 py-2 bg-slate-900/60 border-b border-slate-700/60">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Aisles</span>
                  </div>
                  {stats.aisles.map((aisle, i) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-slate-700/30 last:border-0">
                      <span className="text-xs text-slate-400">Aisle {i + 1}</span>
                      <span className="text-xs font-bold font-mono text-cyan-400">{aisle.label}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <StatCard label="Wall Used" value={`${stats.wallUtilizationPct}%`} />
                <StatCard label="Floor Used" value={`${stats.floorUtilizationPct}%`} />
                <StatCard label="Min Aisle" value={formatFeetInches(stats.minAisleInches)} />
              </div>

              <div className="px-3 py-2.5 bg-indigo-950/40 border border-indigo-700/40 rounded-xl text-[11px] text-indigo-300">
                <span className="font-bold">Preview mode:</span> Racks shown as dashed overlays. Remaining-space + aisle dimensions shown in <span className="text-violet-300 font-bold">violet</span>. Click <span className="font-bold">Apply Layout</span> to commit.
              </div>

              <div className="flex gap-2">
                <button onClick={handleBack} className="flex-1 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-medium transition-colors">← Back</button>
                <button onClick={handleApply} className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-900/30 transition-all">✓ Apply Layout</button>
              </div>
              <button onClick={onClose} className="w-full py-2 text-xs text-slate-500 hover:text-slate-300 transition-colors">Cancel</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const WallTag: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <span className={`text-[10px] font-mono font-bold ${color} bg-slate-900/60 px-1.5 py-0.5 rounded`}>{label}</span>
);

const RackRow: React.FC<{ label: string; count: number; color: string }> = ({ label, count, color }) => (
  <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/30 last:border-0">
    <span className="text-xs text-slate-300">{label}</span>
    <span className={`text-sm font-bold font-mono ${color}`}>× {count}</span>
  </div>
);

const StatCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl px-2 py-2.5 text-center">
    <div className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</div>
    <div className="text-xs font-bold text-white font-mono">{value}</div>
  </div>
);
