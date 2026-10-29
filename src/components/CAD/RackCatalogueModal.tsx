import React, { useState, useMemo } from 'react';
import type { Product3DModelData } from '../../services/api';
import { formatFeetInches } from '../../cad/geometry/FeetInches';
import {
  ShoppingBag,
  X,
  Sliders,
  AlertCircle,
  RefreshCw,
  PackageX,
  ExternalLink,
  Layers,
  ArrowRight,
  Maximize2
} from 'lucide-react';

interface RackCatalogueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRack: (product: Product3DModelData) => void;
  onQuickAddRack?: (product: Product3DModelData) => void;
  onOpenCustomRackModal: () => void;
  products: Product3DModelData[];
  isLoading: boolean;
  error: string | null;
  onRetry: () => void;
}

export const RackCatalogueModal: React.FC<RackCatalogueModalProps> = ({
  isOpen,
  onClose,
  onSelectRack,
  onQuickAddRack,
  onOpenCustomRackModal,
  products = [],
  isLoading,
  error,
  onRetry,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const categories = useMemo(() => {
    return [
      { id: 'all', label: 'All Racks' },
      { id: 'wall', label: 'Wall Racks' },
      { id: 'center', label: 'Center Gondolas' },
      { id: 'endcap', label: 'Endcaps' },
      { id: 'corner', label: 'Corner Racks' },
    ];
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const cat = (p.productType || p.category || p.productName || '').toLowerCase();
      const name = (p.productName || '').toLowerCase();
      const sku = (p.sku || '').toLowerCase();

      // Category match
      if (selectedCategory !== 'all') {
        if (selectedCategory === 'wall' && !cat.includes('wall')) return false;
        if (selectedCategory === 'center' && !(cat.includes('center') || cat.includes('gondola'))) return false;
        if (selectedCategory === 'endcap' && !(cat.includes('endcap') || cat.includes('end cap'))) return false;
        if (selectedCategory === 'corner' && !cat.includes('corner')) return false;
      }

      // Search query match
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        if (!name.includes(q) && !sku.includes(q) && !cat.includes(q)) return false;
      }

      return true;
    });
  }, [products, selectedCategory, searchQuery]);

  if (!isOpen) return null;

  return (
    <div
      id="rack-catalogue-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="rack-catalogue-title"
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm p-0 md:p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-h-[88dvh] md:max-h-[85vh] md:max-w-xl bg-slate-900 border-t md:border border-slate-700 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Sheet Grab Handle */}
        <div className="w-12 h-1 bg-slate-700/80 rounded-full mx-auto my-1.5 md:hidden shrink-0" />

        {/* Header */}
        <div className="px-4 py-3.5 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-retailfix-red-600/20 border border-retailfix-red-500/30 flex items-center justify-center text-retailfix-red-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 id="rack-catalogue-title" className="text-sm font-bold text-white flex items-center gap-2">
                Rack Catalogue
                <span className="text-[10px] font-mono font-medium text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                  {filteredProducts.length} items
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Select a rack model to place on the CAD canvas
              </p>
            </div>
          </div>
          <button
            id="btn-close-rack-catalogue"
            onClick={onClose}
            aria-label="Close rack catalogue"
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 active:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Category Filters (Horizontal Scroll on Mobile) */}
        <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto scrollbar-hide shrink-0">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all touch-manipulation ${
                  isSelected
                    ? 'bg-retailfix-red-600 text-white shadow-md shadow-red-900/30'
                    : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>

        {/* Search Input (If 4+ products) */}
        {products.length >= 4 && (
          <div className="px-4 pt-2.5 pb-1 bg-slate-900 shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by rack name or SKU..."
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-retailfix-red-500"
            />
          </div>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center gap-3">
              <div className="w-8 h-8 border-3 border-slate-700 border-t-retailfix-red-500 rounded-full animate-spin" />
              <p className="text-xs text-slate-400 font-medium">Loading rack catalogue...</p>
            </div>
          ) : error ? (
            <div className="py-8 px-4 rounded-xl bg-red-950/20 border border-red-900/30 text-center flex flex-col items-center gap-2.5">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <div>
                <p className="text-xs font-bold text-red-300">Unable to load rack products</p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-sm break-words">{error}</p>
              </div>
              <button
                onClick={onRetry}
                className="mt-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 border border-slate-700 active:scale-95 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="py-10 text-center flex flex-col items-center gap-3 bg-slate-950/50 rounded-2xl border border-slate-800/80 p-6">
              <PackageX className="w-8 h-8 text-slate-500" />
              <div>
                <p className="text-xs font-bold text-slate-300">
                  {searchQuery || selectedCategory !== 'all'
                    ? 'No matching racks found'
                    : 'No active rack models in database'}
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {searchQuery || selectedCategory !== 'all'
                    ? 'Try adjusting your search or category filter.'
                    : 'Upload or activate a rack model in Admin to start placing.'}
                </p>
              </div>
              <a
                href="/admin/products"
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 bg-retailfix-red-600/20 text-retailfix-red-400 hover:bg-retailfix-red-600/30 rounded-lg text-xs font-semibold border border-retailfix-red-500/30"
              >
                Open Admin Products <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            filteredProducts.map((prod) => {
              const heightStr = formatFeetInches(prod.height || 84);
              const widthStr = formatFeetInches(prod.width || 36);
              const depthStr = formatFeetInches(prod.depth || 24);
              const shelfCount = prod.shelfCount || 6;

              return (
                <div
                  key={`${prod.productId || prod.id}_${prod.id}`}
                  className="p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-slate-600 transition-all flex flex-col gap-2.5 group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-white group-hover:text-retailfix-red-400 transition-colors">
                        {prod.productName}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        {prod.sku && (
                          <span className="text-[9px] font-mono text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700/80">
                            {prod.sku}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400 font-medium capitalize">
                          {(prod.productType || prod.category || 'Rack').replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full font-semibold shrink-0">
                      Active
                    </span>
                  </div>

                  {/* Dimensions Specs Row */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 py-1.5 px-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 text-[10px] font-mono">
                    <div>
                      <span className="text-slate-500 block text-[9px]">WIDTH</span>
                      <strong className="text-slate-200">{widthStr}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">DEPTH</span>
                      <strong className="text-slate-200">{depthStr}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">HEIGHT</span>
                      <strong className="text-slate-200">{heightStr}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[9px]">SHELVES</span>
                      <strong className="text-slate-200">{shelfCount} levels</strong>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      id={`btn-select-rack-${prod.productId || prod.id}`}
                      onClick={() => onSelectRack(prod)}
                      className="flex-1 py-2.5 px-3 bg-retailfix-red-600 hover:bg-retailfix-red-500 active:bg-retailfix-red-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-red-950/50 touch-manipulation transition-all active:scale-[0.98]"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Select & Place on Canvas</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                    </button>

                    {onQuickAddRack && (
                      <button
                        onClick={() => onQuickAddRack(prod)}
                        title="Instantly place at room center"
                        className="hidden sm:flex py-2.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold items-center justify-center gap-1 transition-colors shrink-0"
                      >
                        <Maximize2 className="w-3 h-3" />
                        <span>Center</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer / Custom Rack Button */}
        <div className="p-3.5 bg-slate-950/90 border-t border-slate-800 flex items-center justify-between shrink-0 gap-3 pb-safe">
          <button
            onClick={() => {
              onClose();
              onOpenCustomRackModal();
            }}
            disabled={products.length === 0}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-bold border transition-all flex items-center justify-between touch-manipulation ${
              products.length === 0
                ? 'opacity-40 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
                : 'bg-slate-800/90 hover:bg-slate-800 border-slate-700 text-retailfix-red-400 hover:text-white active:bg-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-retailfix-red-500" />
              <span>Configure Custom Dimensions</span>
            </div>
            <span className="text-[10px] bg-retailfix-red-600/20 text-retailfix-red-300 px-2 py-0.5 rounded font-mono">
              Custom W × D × H &rarr;
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

