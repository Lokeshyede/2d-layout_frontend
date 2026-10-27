import React from 'react';
import { ArrowRight, CheckCircle2, Sparkles, Store, Building2, ShoppingBag, Ruler } from 'lucide-react';

interface LandingPageProps {
  onStartSurvey: () => void;
  onAdminLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onStartSurvey, onAdminLogin }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-white border-b border-slate-200 py-16 md:py-24">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:32px_32px] opacity-80" />
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-retailfix-red-100/60 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Headlines & CTA */}
            <div className="lg:col-span-7 space-y-6 text-left">
              <div className="inline-flex items-center gap-2 bg-retailfix-red-50 border border-retailfix-red-200 text-retailfix-red-700 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-retailfix-red-600" />
                Next-Gen Retail Architectural Engine
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
                Store Survey & <span className="text-retailfix-red-600">2D CAD Layout</span> Platform
              </h1>

              <p className="text-lg text-slate-600 max-w-2xl leading-relaxed">
                Streamline site surveys and generate millimeter-precise architectural 2D store layouts with real-world Feet & Inches dimensioning, inward column projections, and retail fixture placement.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={onStartSurvey}
                  className="bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white font-bold text-base px-8 py-4 rounded-xl shadow-xl shadow-red-600/25 hover:shadow-red-600/35 transition-all flex items-center gap-3 hover:translate-y-[-2px] active:translate-y-[0px]"
                >
                  <Store className="w-5 h-5" />
                  Start Store Survey
                  <ArrowRight className="w-5 h-5" />
                </button>

                <div className="text-xs text-slate-500 flex items-center gap-1.5 pl-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span>No login required for customers</span>
                </div>
              </div>

              {/* Badges */}
              <div className="grid grid-cols-3 gap-4 pt-6 border-t border-slate-100 max-w-lg">
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-slate-900 font-mono">100%</p>
                  <p className="text-xs text-slate-500 font-medium">Feet + Inches Real CAD</p>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-slate-900 font-mono">0-Overlap</p>
                  <p className="text-xs text-slate-500 font-medium">Multi-Lane Dimensioning</p>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-slate-900 font-mono">Instant</p>
                  <p className="text-xs text-slate-500 font-medium">DWG Sheet & PDF Export</p>
                </div>
              </div>
            </div>

            {/* Right Column: CAD Editor Visual Teaser Card */}
            <div className="lg:col-span-5">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-4 relative group">
                <div className="bg-slate-900 rounded-xl p-3 flex items-center justify-between text-white text-xs mb-3 font-mono">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-green-500" />
                    <span className="text-slate-400 pl-2">RF-SUR-2026-0001 (50'-0" × 30'-0")</span>
                  </div>
                  <span className="bg-retailfix-red-600 px-2 py-0.5 rounded text-[10px] font-bold">REV 1</span>
                </div>

                <div className="aspect-[4/3] bg-white rounded-lg border border-slate-200 relative overflow-hidden flex items-center justify-center p-6">
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:16px_16px]" />
                  
                  <div className="relative w-full h-full border-4 border-slate-800 rounded bg-slate-50/40 p-4 flex flex-col justify-between">
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-white px-2 py-0.5 border border-red-200 text-retailfix-red-600 font-mono text-xs font-bold rounded shadow-sm">
                      50'-0"
                    </div>

                    <div className="absolute top-1/2 -left-8 -translate-y-1/2 -rotate-90 bg-white px-2 py-0.5 border border-red-200 text-retailfix-red-600 font-mono text-xs font-bold rounded shadow-sm">
                      30'-0"
                    </div>

                    <div className="flex justify-between">
                      <div className="w-6 h-6 bg-slate-900 border border-slate-700 flex items-center justify-center text-[8px] text-white font-bold">COL</div>
                      <div className="w-6 h-6 bg-slate-900 border border-slate-700 flex items-center justify-center text-[8px] text-white font-bold">COL</div>
                    </div>

                    <div className="flex items-center justify-center gap-4 my-auto">
                      <div className="h-20 w-8 bg-blue-50 border-2 border-blue-600 rounded flex flex-col justify-between p-0.5">
                        <div className="h-0.5 bg-blue-400 w-full" />
                        <span className="text-[7px] font-bold text-blue-700 text-center">RACK 1</span>
                        <div className="h-0.5 bg-blue-400 w-full" />
                      </div>
                      <div className="h-20 w-8 bg-blue-50 border-2 border-blue-600 rounded flex flex-col justify-between p-0.5">
                        <div className="h-0.5 bg-blue-400 w-full" />
                        <span className="text-[7px] font-bold text-blue-700 text-center">RACK 2</span>
                        <div className="h-0.5 bg-blue-400 w-full" />
                      </div>
                    </div>

                    <div className="flex justify-between items-end">
                      <div className="w-6 h-6 bg-slate-900 border border-slate-700 flex items-center justify-center text-[8px] text-white font-bold">COL</div>
                      <div className="border-b-2 border-red-600 text-[9px] font-bold text-red-600 px-3 pb-0.5">
                        3'-0" ENTRANCE
                      </div>
                      <div className="w-6 h-6 bg-slate-900 border border-slate-700 flex items-center justify-center text-[8px] text-white font-bold">COL</div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Unit: <strong className="text-slate-800">Feet + Inches</strong></span>
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Auto-Save Active
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-Step Process Section */}
      <section className="py-16 bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-xs font-bold text-retailfix-red-600 uppercase tracking-widest mb-2">Seamless Workflow</h2>
            <p className="text-3xl font-extrabold text-slate-900">How RetailFix Store Survey Works</p>
            <p className="text-slate-600 mt-2">Zero friction. No signups or account creation required for customers.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 relative group hover:border-retailfix-red-400 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-retailfix-red-600 text-white font-bold flex items-center justify-center mb-4 text-lg">
                1
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Fill Survey Details</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Enter customer contact info, store type (Supermarket, Pharmacy, Garment, etc.), and site dimensions.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 relative group hover:border-retailfix-red-400 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-retailfix-dark-900 text-white font-bold flex items-center justify-center mb-4 text-lg">
                2
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Instant Survey ID</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                System generates a unique Survey ID (e.g. <code>RF-SUR-2026-0001</code>) and opens the CAD Designer.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 relative group hover:border-retailfix-red-400 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-retailfix-red-600 text-white font-bold flex items-center justify-center mb-4 text-lg">
                3
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Draw 2D Store Layout</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Draw perimeter walls, insert columns, entrance shutters, swing doors, and standard retail display racks.
              </p>
            </div>

            <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 relative group hover:border-retailfix-red-400 transition-colors">
              <div className="w-10 h-10 rounded-lg bg-retailfix-dark-900 text-white font-bold flex items-center justify-center mb-4 text-lg">
                4
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Save & Download</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Download an official architectural drawing sheet with Title Block, Notes, Legend, and exact Feet+Inches dimensions.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <h2 className="text-xs font-bold text-retailfix-red-600 uppercase tracking-widest mb-2">Architectural Standards</h2>
            <p className="text-3xl font-extrabold text-slate-900">Engineered for Accuracy & Production</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 text-retailfix-red-600 flex items-center justify-center">
                <Ruler className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Collision-Free Dimension Engine</h3>
              <p className="text-sm text-slate-600">
                Automated multi-lane assignment algorithm places overall room dimensions outside and segment dimensions along walls without ever overlapping.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-900 flex items-center justify-center">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Inward Column Projection Rule</h3>
              <p className="text-sm text-slate-600">
                Wall columns strictly project into the room space with perpendicular under/inward offset dimensions, ensuring fixture layouts fit perfectly.
              </p>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
              <div className="w-10 h-10 rounded-lg bg-red-50 text-retailfix-red-600 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Retail Fixture Modules</h3>
              <p className="text-sm text-slate-600">
                Pre-configured Wall Racks (7'×3', 7'×4'), Center Gondolas, Corner units, and Glass Gates with toggleable rack dimension mode.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Banner */}
      <section className="bg-retailfix-dark-950 text-white py-16 border-t border-slate-800">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-6">
          <h2 className="text-3xl sm:text-4xl font-extrabold">Ready to Create Your Store Layout?</h2>
          <p className="text-slate-400 max-w-2xl mx-auto text-base">
            Start a store survey now or access the admin portal to review existing projects and export architectural sheets.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
            <button
              onClick={onStartSurvey}
              className="bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white font-bold text-base px-8 py-3.5 rounded-xl shadow-lg shadow-red-900/40 transition-all hover:scale-105"
            >
              Start New Survey Form
            </button>
            <button
              onClick={onAdminLogin}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-base px-6 py-3.5 rounded-xl border border-slate-700 transition-colors"
            >
              Admin Dashboard Login
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
