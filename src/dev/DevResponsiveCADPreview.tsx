import { useState } from 'react';
import { Smartphone, Tablet, Monitor, Laptop, RotateCcw } from 'lucide-react';

interface ViewportOption {
  id: string;
  label: string;
  width: number;
  height: number;
  category: 'mobile' | 'tablet' | 'desktop';
  icon: any;
}

const VIEWPORT_OPTIONS: ViewportOption[] = [
  { id: '320x568', label: '320 × 568 (Small Mobile)', width: 320, height: 568, category: 'mobile', icon: Smartphone },
  { id: '375x812', label: '375 × 812 (Standard Mobile)', width: 375, height: 812, category: 'mobile', icon: Smartphone },
  { id: '430x932', label: '430 × 932 (Large Mobile)', width: 430, height: 932, category: 'mobile', icon: Smartphone },
  { id: '600x960', label: '600 × 960 (Small Tablet)', width: 600, height: 960, category: 'tablet', icon: Tablet },
  { id: '768x1024', label: '768 × 1024 (Tablet Portrait)', width: 768, height: 1024, category: 'tablet', icon: Tablet },
  { id: '1024x768', label: '1024 × 768 (Tablet Landscape)', width: 1024, height: 768, category: 'tablet', icon: Tablet },
  { id: '1280x720', label: '1280 × 720 (Laptop)', width: 1280, height: 720, category: 'desktop', icon: Laptop },
  { id: '1440x900', label: '1440 × 900 (Desktop)', width: 1440, height: 900, category: 'desktop', icon: Monitor },
];

export const DevResponsiveCADPreview = () => {
  const [selectedViewport, setSelectedViewport] = useState<ViewportOption>(VIEWPORT_OPTIONS[1]); // Default 375x812
  const [surveyId, setSurveyId] = useState('RF-SUR-2026-0027');
  const [iframeKey, setIframeKey] = useState(0);
  const [zoomScale, setZoomScale] = useState<number>(0.75);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 select-none overflow-hidden font-sans">
      {/* Top Test Controller Header */}
      <header className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-sm text-white flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-retailfix-red-500 animate-pulse" />
            RetailFix CAD Responsive Test Bench
          </span>
          <div className="h-4 w-px bg-slate-700" />
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span>Survey:</span>
            <input
              type="text"
              value={surveyId}
              onChange={(e) => setSurveyId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white font-mono text-xs w-36"
            />
          </div>
        </div>

        {/* Viewport Selector Buttons */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
          {VIEWPORT_OPTIONS.map((vp) => {
            const Icon = vp.icon;
            const isSelected = selectedViewport.id === vp.id;
            return (
              <button
                key={vp.id}
                id={`btn-vp-${vp.id}`}
                onClick={() => {
                  setSelectedViewport(vp);
                  // Automatically adjust preview zoom scale for tablet and desktop
                  if (vp.width >= 1200) setZoomScale(0.5);
                  else if (vp.width >= 768) setZoomScale(0.65);
                  else setZoomScale(1.0);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  isSelected
                    ? 'bg-retailfix-red-600 text-white shadow-md shadow-red-900/40'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700/60'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{vp.label}</span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIframeKey((k) => k + 1)}
            title="Reload Frame"
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reload
          </button>
        </div>
      </header>

      {/* Frame Container */}
      <main className="flex-1 overflow-auto bg-slate-900/50 p-6 flex flex-col items-center justify-start">
        <div className="mb-3 flex items-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <span>Target Viewport:</span>
            <strong className="text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
              {selectedViewport.width}px × {selectedViewport.height}px
            </strong>
            <span>({selectedViewport.category.toUpperCase()})</span>
          </div>

          {/* Scale selector */}
          <div className="flex items-center gap-1 bg-slate-800 p-0.5 rounded-lg border border-slate-700">
            <span className="text-slate-400 px-1 text-[11px] font-sans">Scale:</span>
            {[0.5, 0.65, 0.8, 1.0].map((s) => (
              <button
                key={s}
                onClick={() => setZoomScale(s)}
                className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                  zoomScale === s ? 'bg-retailfix-red-600 text-white' : 'text-slate-300 hover:text-white'
                }`}
              >
                {Math.round(s * 100)}%
              </button>
            ))}
          </div>
        </div>

        {/* Viewport Frame with zoom scale wrapper */}
        <div
          style={{
            width: `${selectedViewport.width * zoomScale}px`,
            height: `${selectedViewport.height * zoomScale}px`,
          }}
          className="relative transition-all"
        >
          <div
            className="bg-white rounded-xl shadow-2xl overflow-hidden border-4 border-slate-700 transition-all origin-top-left"
            style={{
              width: `${selectedViewport.width}px`,
              height: `${selectedViewport.height}px`,
              transform: `scale(${zoomScale})`,
            }}
          >
            <iframe
              key={`${selectedViewport.id}_${surveyId}_${iframeKey}`}
              id="responsive-cad-frame"
              src={`/cad/${surveyId}`}
              title="CAD Responsive Viewport Test"
              className="w-full h-full border-none block"
              style={{
                width: `${selectedViewport.width}px`,
                height: `${selectedViewport.height}px`,
              }}
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default DevResponsiveCADPreview;
