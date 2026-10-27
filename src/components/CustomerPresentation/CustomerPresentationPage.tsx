import React, { useEffect, useState } from 'react';
import { api, type CustomerPresentationData } from '../../services/api';
import { Store3DViewer } from '../../cad/rendering3d/Store3DViewer';
import { Customer2DViewer } from './Customer2DViewer';
import {
  Box,
  Footprints,
  Layers,
  FileDown,
  Video,
  Store,
  MapPin,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Grid3X3,
  Maximize2,
  Play,
  Sparkles,
} from 'lucide-react';

interface CustomerPresentationPageProps {
  token: string;
}

type TabMode = '3d' | 'walk' | '2d' | 'video' | 'summary';

export const CustomerPresentationPage: React.FC<CustomerPresentationPageProps> = ({ token }) => {
  const [data, setData] = useState<CustomerPresentationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStep, setLoadingStep] = useState<string>('Loading Store...');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabMode>('3d');
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  useEffect(() => {
    loadPresentation();
  }, [token]);

  const loadPresentation = async () => {
    try {
      setLoading(true);
      setError(null);
      setLoadingStep('Loading Store Layout...');

      const result = await api.getCustomerPresentation(token);
      setLoadingStep('Loading 3D Products & Geometry...');

      // Small delay for smooth visual transition
      await new Promise((r) => setTimeout(r, 200));
      setData(result);
      setLoadingStep('Store Ready');
    } catch (err: any) {
      console.error('Failed to load shared project:', err);
      setError(err.message || 'Project Unavailable: This customer project link is no longer active.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!data) return;
    try {
      setDownloadingPdf(true);
      const url = api.getCustomerPdfUrl(token);
      const res = await fetch(url);
      if (!res.ok) throw new Error('PDF download failed');
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const cleanStore = data.storeName.replace(/[^a-zA-Z0-9_-]/g, '_');
      link.download = `RetailFix_${cleanStore}_Proposal.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Error downloading PDF:', err);
      alert('Unable to download PDF. Please try again.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Error State: Professional revoked/expired card (Section 26)
  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="max-w-md w-full bg-white text-slate-900 rounded-3xl shadow-2xl p-8 text-center space-y-6 border border-slate-100">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-50 text-retailfix-red-600 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>

          <div className="space-y-2">
            <span className="text-xs uppercase font-extrabold tracking-widest text-red-600">RetailFix</span>
            <h1 className="text-2xl font-black text-slate-900">Project Unavailable</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              This customer project link is no longer active or has been revoked. Please contact your RetailFix representative for a new link.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 flex flex-col items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>RetailFix Secure Project Presentation</span>
            </div>
            <a
              href="/"
              className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline pt-2"
            >
              Return to Homepage
            </a>
          </div>
        </div>
      </div>
    );
  }

  // Loading State: Progressive feedback (Section 24)
  if (loading || !data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 font-sans">
        <div className="w-16 h-16 rounded-2xl bg-retailfix-red-600/20 border border-retailfix-red-500/40 text-retailfix-red-500 flex items-center justify-center mb-6 animate-pulse">
          <Store className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-white mb-2">RetailFix Store Presentation</h2>
        <div className="flex items-center gap-2.5 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-red-500" />
          <span>{loadingStep}</span>
        </div>
      </div>
    );
  }

  const { storeName, customerName, location, revision, status, summary, rackBreakdown } = data;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans selection:bg-red-500 selection:text-white">
      {/* 1. Header: Clean RetailFix Customer Presentation Header (Section 12, 13) */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4">
          {/* Logo & Store Info */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-retailfix-red-600 flex items-center justify-center text-white shadow-md shadow-red-600/30 shrink-0 font-black text-lg tracking-wider">
              RF
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-red-600">RETAILFIX</span>
                <span className="text-slate-300">•</span>
                <span className="text-xs text-slate-500 font-medium truncate">Store Layout Proposal</span>
              </div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 truncate tracking-tight">
                {storeName}
              </h1>
            </div>
          </div>

          {/* Status & Store Badges */}
          <div className="hidden md:flex items-center gap-3">
            {location && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{location}</span>
              </div>
            )}
            {summary.roomSize && (
              <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                <Maximize2 className="w-3.5 h-3.5 text-slate-400" />
                <span>{summary.roomSize}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl text-xs font-bold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{status || 'Layout Proposal'}</span>
            </div>
          </div>

          {/* Quick PDF & PNG Downloads */}
          <div className="flex items-center gap-2">
            {data.allowPdfDownload && (
              <button
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                title="Download Architectural PDF Proposal"
                className="flex items-center gap-1.5 px-3.5 py-2 bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white rounded-xl text-xs font-bold shadow-md shadow-red-600/25 transition-all hover:scale-[1.02] shrink-0"
              >
                <FileDown className="w-4 h-4" />
                <span className="hidden sm:inline">{downloadingPdf ? 'Generating...' : 'Download PDF'}</span>
                <span className="sm:hidden">PDF</span>
              </button>
            )}

            {data.allowVideoDownload && (
              <button
                onClick={() => setActiveTab('video')}
                title="Watch or Export 3D Walkthrough Video"
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-black text-white rounded-xl text-xs font-bold shadow-sm transition-all hover:scale-[1.02] shrink-0"
              >
                <Video className="w-4 h-4 text-red-400" />
                <span>Video</span>
              </button>
            )}
          </div>
        </div>

        {/* Navigation Tabs Bar — horizontally scrollable on mobile */}
        <div className="bg-slate-100/80 border-t border-slate-200/80 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto flex items-center justify-between py-1.5 gap-2">
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-xs overflow-x-auto scrollbar-hide shrink-0">
              <button
                id="btn-customer-3d"
                onClick={() => setActiveTab('3d')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === '3d'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                3D View
              </button>

              <button
                id="btn-customer-walk"
                onClick={() => setActiveTab('walk')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'walk'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Footprints className="w-3.5 h-3.5 text-emerald-300" />
                Walkthrough
              </button>

              <button
                id="btn-customer-2d"
                onClick={() => setActiveTab('2d')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === '2d'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                2D Layout
              </button>

              <button
                id="btn-customer-video"
                onClick={() => setActiveTab('video')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'video'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-red-400" />
                Walkthrough Video
              </button>

              <button
                id="btn-customer-summary"
                onClick={() => setActiveTab('summary')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'summary'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Grid3X3 className="w-3.5 h-3.5 text-amber-400" />
                Project Summary
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0 font-medium">
              <span className="hidden lg:inline">{customerName}</span>
              <span className="hidden lg:inline">•</span>
              <span className="font-mono bg-slate-200/80 text-slate-700 px-2 py-0.5 rounded text-[11px] font-bold">
                {revision || 'REV 1'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Interactive Stage */}
      <main className="flex-1 flex flex-col relative w-full h-[calc(100vh-8.5rem)]">
        {/* TAB 1: 3D Store View (Reusing existing Store3DViewer) */}
        {activeTab === '3d' && (
          <div className="relative w-full h-full bg-slate-950">
            <Store3DViewer
              entities={data.entities}
              projectId={data.projectTitle}
              storeName={data.storeName}
              isCustomerMode={true}
              initialViewMode="orbit"
              allowVideoExport={data.allowVideoDownload}
            />
          </div>
        )}

        {/* TAB 2: Walk View (Reusing existing Store3DViewer in walk mode) */}
        {activeTab === 'walk' && (
          <div className="relative w-full h-full bg-slate-950">
            <Store3DViewer
              entities={data.entities}
              projectId={data.projectTitle}
              storeName={data.storeName}
              isCustomerMode={true}
              initialViewMode="walk"
              allowVideoExport={data.allowVideoDownload}
            />
          </div>
        )}

        {/* TAB 3: 2D Floor Plan (Reusing existing CADRenderer) */}
        {activeTab === '2d' && (
          <div className="relative w-full h-full bg-[#f8fafc]">
            <Customer2DViewer
              entities={data.entities}
              storeName={data.storeName}
              projectTitle={data.projectTitle}
              allowPngDownload={data.allowPngDownload}
            />
          </div>
        )}

        {/* TAB 4: Video Walkthrough (Section 6, 43, 44) */}
        {activeTab === 'video' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-100 flex items-center justify-center">
            <div className="max-w-2xl w-full bg-white rounded-3xl p-8 sm:p-10 shadow-sm border border-slate-200/80 space-y-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-red-50 text-red-600 mx-auto flex items-center justify-center shadow-inner">
                <Video className="w-8 h-8 text-red-600" />
              </div>

              <div className="space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-red-600 bg-red-50 px-3 py-1 rounded-full">
                  RetailFix Walkthrough
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                  Store 3D Walkthrough
                </h2>
                <p className="text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                  Experience a virtual first-person walkthrough of {data.storeName} at human eye level (5′6″), complete with actual product racks, collision detection, and realistic architectural proportions.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                <button
                  onClick={() => setActiveTab('walk')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-emerald-600/30 transition-all hover:scale-[1.02]"
                >
                  <Footprints className="w-4 h-4 text-emerald-200" />
                  Walk Through Store (Live 3D)
                </button>

                <button
                  onClick={() => setActiveTab('3d')}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900 hover:bg-black text-white rounded-2xl text-xs font-bold shadow-sm transition-all hover:scale-[1.02]"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Export 1080p MP4 Video
                </button>
              </div>

              {/* Video Fallback Information (Section 44) */}
              <div className="mt-6 pt-6 border-t border-slate-100 text-xs text-slate-500 bg-slate-50 p-4 rounded-2xl text-left space-y-1">
                <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-slate-500" />
                  Walkthrough Playback Notice
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  Walkthrough videos and live simulation are generated dynamically on-demand from the authoritative CAD store geometry. You can also explore the 2D Layout or download the architectural PDF proposal anytime.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Project Summary & Rack Breakdown (Section 10 & 11) */}
        {activeTab === 'summary' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-slate-100">
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Store Hero Card */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-red-600 bg-red-50 px-2.5 py-0.5 rounded-lg">
                      {data.status || 'Layout Proposal'}
                    </span>
                    <span className="text-xs text-slate-400 font-mono font-medium">REV: {data.revision}</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {data.storeName}
                  </h2>
                  <p className="text-sm text-slate-600">
                    Prepared for <strong className="text-slate-900">{data.customerName}</strong>
                    {data.storeType && ` • ${data.storeType}`}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {data.allowPdfDownload && (
                    <button
                      onClick={handleDownloadPdf}
                      disabled={downloadingPdf}
                      className="flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-red-600/30 transition-all hover:scale-[1.02]"
                    >
                      <FileDown className="w-4 h-4" />
                      {downloadingPdf ? 'Exporting...' : 'Download PDF Proposal'}
                    </button>
                  )}
                </div>
              </div>

              {/* Statistics Grid (Section 10) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Total Racks</span>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">{summary.totalRacks}</div>
                  <span className="text-[11px] text-emerald-600 font-medium">Actual CAD Units</span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Wall Racks</span>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">{summary.wallRacks}</div>
                  <span className="text-[11px] text-slate-500">Wall Mounted</span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Center Gondolas</span>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">{summary.centerRacks}</div>
                  <span className="text-[11px] text-slate-500">Aisle Display</span>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">Endcaps & Corners</span>
                  <div className="text-2xl sm:text-3xl font-black text-slate-900">{summary.endcaps + summary.cornerRacks}</div>
                  <span className="text-[11px] text-slate-500">{summary.endcaps} Endcaps • {summary.cornerRacks} Corners</span>
                </div>
              </div>

              {/* RACK SUMMARY BREAKDOWN (Section 11) */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Rack Summary Breakdown</h3>
                    <p className="text-xs text-slate-500">Calculated directly from saved CAD entities</p>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-xl">
                    {summary.totalRacks} Racks Total
                  </span>
                </div>

                {rackBreakdown && rackBreakdown.length > 0 ? (
                  <div className="divide-y divide-slate-100">
                    {rackBreakdown.map((item, idx) => (
                      <div key={idx} className="py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl bg-red-50 text-red-600 flex items-center justify-center font-bold text-xs">
                            {idx + 1}
                          </div>
                          <div>
                            <div className="text-sm font-bold text-slate-900">{item.name}</div>
                            <div className="text-xs text-slate-500">
                              {item.rackType} • Dimensions: <span className="font-mono">{item.dimensions}</span>
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-black text-slate-900 font-mono">
                            × {item.count}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-8 text-center text-xs text-slate-500">
                    No racks currently placed in this layout.
                  </div>
                )}
              </div>

              {/* Architectural Store Specs Card (Section 10) */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-sm border border-slate-200/80 space-y-4">
                <h3 className="text-base font-bold text-slate-900">Store Architectural Details</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block mb-0.5">Room Dimensions</span>
                    <span className="font-bold text-slate-800">{summary.roomSize || 'Standard CAD Boundary'}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block mb-0.5">Doors</span>
                    <span className="font-bold text-slate-800">{summary.doors} Door(s)</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block mb-0.5">Windows</span>
                    <span className="font-bold text-slate-800">{summary.windows} Window(s)</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <span className="text-slate-400 block mb-0.5">Structural Columns</span>
                    <span className="font-bold text-slate-800">{summary.columns} Column(s)</span>
                  </div>
                </div>
              </div>

              {/* Footer Note */}
              <div className="text-center text-xs text-slate-500 py-4">
                <span>© RetailFix CAD Engine • Confidential store layout proposal</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
