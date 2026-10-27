import React, { useState, useMemo, useEffect } from 'react';
import type { WallEntity } from '../../cad/types';
import { formatCustomRackLabel, formatFeetInches } from '../../cad/geometry/FeetInches';
import type { Product3DModelData } from '../../services/api';
import { Sliders, X, AlertCircle, Layers } from 'lucide-react';

export interface CustomRackParams {
  widthInches: number;
  depthInches: number;
  heightInches: number;
  shelves?: number;
  shelfCount?: number;
  shelfSpacing?: number | 'auto';
  shelfThickness?: number;
  placementType: 'wall' | 'center';
  targetWallId?: string;
  productModelId?: string;
  productName?: string;
  sku?: string;
  baseWidth?: number;
  baseDepth?: number;
  baseHeight?: number;
  scalingMode?: string;
}

interface CustomRackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddRack: (params: CustomRackParams) => void;
  walls: WallEntity[];
  initialProduct?: Product3DModelData | null;
  availableProducts?: Product3DModelData[];
}

export const CustomRackModal: React.FC<CustomRackModalProps> = ({
  isOpen,
  onClose,
  onAddRack,
  walls,
  initialProduct,
  availableProducts = [],
}) => {
  // Selected product model (standard or admin-uploaded)
  const [selectedProduct, setSelectedProduct] = useState<Product3DModelData | null>(
    initialProduct || (availableProducts.length > 0 ? availableProducts[0] : null)
  );

  // Dimension inputs (exact integers, no decimals)
  const [widthFt, setWidthFt] = useState<number>(3);
  const [widthIn, setWidthIn] = useState<number>(6);

  const [depthFt, setDepthFt] = useState<number>(2);
  const [depthIn, setDepthIn] = useState<number>(0);

  const [heightFt, setHeightFt] = useState<number>(7);
  const [heightIn, setHeightIn] = useState<number>(0);

  // Shelf configuration (Phase 6)
  const [shelves, setShelves] = useState<number>(6);
  const [shelfThickness, setShelfThickness] = useState<number>(1.0);
  const [shelfSpacing, setShelfSpacing] = useState<string>('Auto');

  const [placementType, setPlacementType] = useState<'wall' | 'center'>(
    walls.length > 0 ? 'wall' : 'center'
  );
  const [targetWallId, setTargetWallId] = useState<string>('');

  // Handle selected product model change
  const handleSelectProduct = (product: Product3DModelData | null) => {
    setSelectedProduct(product);
    if (product) {
      const w = product.width || 36;
      const d = product.depth || 24;
      const h = product.height || 84;
      setWidthFt(Math.floor(w / 12));
      setWidthIn(Math.round(w % 12));
      setDepthFt(Math.floor(d / 12));
      setDepthIn(Math.round(d % 12));
      setHeightFt(Math.floor(h / 12));
      setHeightIn(Math.round(h % 12));
      if (product.shelfCount) setShelves(product.shelfCount);
      if (product.shelfThickness) setShelfThickness(product.shelfThickness);

      const isWall =
        product.productType?.toLowerCase().includes('wall') ||
        product.productName?.toLowerCase().includes('wall');
      setPlacementType(isWall && walls.length > 0 ? 'wall' : 'center');
    } else {
      setWidthFt(3);
      setWidthIn(6);
      setDepthFt(2);
      setDepthIn(0);
      setHeightFt(7);
      setHeightIn(0);
      setShelves(6);
      setShelfThickness(1.0);
      setShelfSpacing('Auto');
      setPlacementType(walls.length > 0 ? 'wall' : 'center');
    }
  };

  useEffect(() => {
    if (initialProduct) {
      handleSelectProduct(initialProduct);
    } else if (availableProducts.length > 0 && !selectedProduct) {
      handleSelectProduct(availableProducts[0]);
    }
  }, [initialProduct, availableProducts]);

  // Total dimensions in inches
  const totalWidth = widthFt * 12 + widthIn;
  const totalDepth = depthFt * 12 + depthIn;
  const totalHeight = heightFt * 12 + heightIn;

  // Validation
  const errors = useMemo(() => {
    const errs: string[] = [];
    if (!selectedProduct) errs.push('A base product model template from Admin is required');
    if (totalWidth <= 0) errs.push('Width must be greater than 0');
    if (totalDepth <= 0) errs.push('Depth must be greater than 0');
    if (totalHeight <= 0) errs.push('Height must be greater than 0');
    if (widthIn < 0 || widthIn > 11) errs.push('Width inches must be 0–11');
    if (depthIn < 0 || depthIn > 11) errs.push('Depth inches must be 0–11');
    if (heightIn < 0 || heightIn > 11) errs.push('Height inches must be 0–11');
    if (shelves < 1 || shelves > 16) errs.push('Shelves must be between 1 and 16');
    return errs;
  }, [selectedProduct, totalWidth, totalDepth, totalHeight, widthIn, depthIn, heightIn, shelves]);

  const isValid = errors.length === 0;

  const rackLabel = useMemo(() => {
    if (totalWidth <= 0 || totalDepth <= 0 || totalHeight <= 0) return '—';
    return formatCustomRackLabel(totalHeight, totalWidth, totalDepth, false);
  }, [totalHeight, totalWidth, totalDepth]);

  const compactLabel = useMemo(() => {
    if (totalWidth <= 0 || totalDepth <= 0 || totalHeight <= 0) return '—';
    return formatCustomRackLabel(totalHeight, totalWidth, totalDepth, true);
  }, [totalHeight, totalWidth, totalDepth]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    onAddRack({
      widthInches: totalWidth,
      depthInches: totalDepth,
      heightInches: totalHeight,
      shelves,
      shelfCount: shelves,
      shelfSpacing: shelfSpacing === 'Auto' ? 'auto' : parseFloat(shelfSpacing) || 'auto',
      shelfThickness,
      placementType,
      targetWallId: targetWallId || undefined,
      productModelId: selectedProduct?.productId || (selectedProduct ? String(selectedProduct.id) : undefined),
      productName: selectedProduct?.productName,
      sku: selectedProduct?.sku,
      baseWidth: selectedProduct?.width,
      baseDepth: selectedProduct?.depth,
      baseHeight: selectedProduct?.height,
      scalingMode: selectedProduct?.scalingMode || 'stretch',
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-retailfix-red-600 flex items-center justify-center text-white shadow-md shadow-red-950">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-white text-sm">Add Custom Rack</h3>
              <p className="text-[11px] text-slate-400">
                Specify exact dimensions (Height × Width × Depth) and shelf count
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Base Product Model Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Base Product Model:
            </label>
            {availableProducts.length === 0 ? (
              <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-lg text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>No active products found in Admin. Upload a rack product in Admin first.</span>
              </div>
            ) : (
              <select
                value={selectedProduct?.productId || selectedProduct?.id || ''}
                onChange={(e) => {
                  const prodId = e.target.value;
                  const match = availableProducts.find(
                    (p) => String(p.productId || p.id) === prodId
                  );
                  handleSelectProduct(match || availableProducts[0] || null);
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white focus:ring-1 focus:ring-retailfix-red-500 outline-none"
              >
                {availableProducts.map((prod) => (
                  <option key={`${prod.productId || prod.id}_${prod.id}`} value={prod.productId || prod.id}>
                    {prod.productName} ({formatFeetInches(prod.width)} × {formatFeetInches(prod.height)} × {formatFeetInches(prod.depth)})
                  </option>
                ))}
              </select>
            )}
            {selectedProduct && (
              <div className="mt-1.5 text-[10px] text-slate-400 flex items-center justify-between">
                <span>Base Size: {formatFeetInches(selectedProduct.width)} × {formatFeetInches(selectedProduct.height)} × {formatFeetInches(selectedProduct.depth)}</span>
                <span className="font-mono text-emerald-400 uppercase">{selectedProduct.scalingMode || 'stretch'}</span>
              </div>
            )}
          </div>

          {/* Dimension Semantics Guide */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-[11px] space-y-1">
            <div className="flex justify-between items-center text-slate-300">
              <span>Dimension Convention:</span>
              <span className="font-mono text-amber-400 font-bold">HEIGHT × WIDTH × DEPTH</span>
            </div>
            <div className="text-[10px] text-slate-500 leading-tight">
              Height = vertical rack height &bull; Width = along wall/run &bull; Depth = projection inward
            </div>
          </div>

          {/* Width Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Width (Along Wall / Run):
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={widthFt}
                  onChange={(e) => setWidthFt(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-3 pr-8 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs pointer-events-none">
                  ft
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={11}
                  step={1}
                  value={widthIn}
                  onChange={(e) => setWidthIn(Math.max(0, Math.min(11, parseInt(e.target.value, 10) || 0)))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-3 pr-8 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs pointer-events-none">
                  in
                </span>
              </div>
            </div>
          </div>

          {/* Depth Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Depth (Projection Inward):
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={depthFt}
                  onChange={(e) => setDepthFt(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-3 pr-8 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs pointer-events-none">
                  ft
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={11}
                  step={1}
                  value={depthIn}
                  onChange={(e) => setDepthIn(Math.max(0, Math.min(11, parseInt(e.target.value, 10) || 0)))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-3 pr-8 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs pointer-events-none">
                  in
                </span>
              </div>
            </div>
          </div>

          {/* Height Input */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Height (Vertical Height):
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={heightFt}
                  onChange={(e) => setHeightFt(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-3 pr-8 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs pointer-events-none">
                  ft
                </span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  min={0}
                  max={11}
                  step={1}
                  value={heightIn}
                  onChange={(e) => setHeightIn(Math.max(0, Math.min(11, parseInt(e.target.value, 10) || 0)))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2 pl-3 pr-8 text-xs text-white font-mono focus:ring-1 focus:ring-retailfix-red-500 outline-none"
                  placeholder="0"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs pointer-events-none">
                  in
                </span>
              </div>
            </div>
          </div>

          {/* Shelf Configuration (Phase 6) */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300">
              Shelf Configuration:
            </label>
            <div className="flex items-center gap-3 bg-slate-950 border border-slate-700 rounded-lg p-2">
              <button
                type="button"
                onClick={() => setShelves((s) => Math.max(1, s - 1))}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center transition-colors text-sm"
              >
                -
              </button>
              <div className="flex-1 flex items-center justify-center gap-1.5 font-mono font-bold text-white text-sm">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>{shelves} shelves</span>
              </div>
              <button
                type="button"
                onClick={() => setShelves((s) => Math.min(16, s + 1))}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold flex items-center justify-center transition-colors text-sm"
              >
                +
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Shelf Spacing:</label>
                <select
                  value={shelfSpacing}
                  onChange={(e) => setShelfSpacing(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                >
                  <option value="Auto">Auto (Even distribution)</option>
                  <option value="10">10″ Spacing</option>
                  <option value="12">12″ Spacing</option>
                  <option value="14">14″ Spacing</option>
                  <option value="16">16″ Spacing</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Shelf Thickness:</label>
                <select
                  value={shelfThickness}
                  onChange={(e) => setShelfThickness(parseFloat(e.target.value) || 1.0)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                >
                  <option value={1.0}>1.0″ (Standard)</option>
                  <option value={1.25}>1.25″</option>
                  <option value={1.5}>1.5″ (Heavy Duty)</option>
                  <option value={2.0}>2.0″</option>
                </select>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">
              RetailFix parametric GLB distributes authentic shelf tiers cleanly.
            </p>
          </div>

          {/* Placement Options */}
          {walls.length > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Placement Type:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPlacementType('wall')}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                    placementType === 'wall'
                      ? 'bg-retailfix-red-600/20 border-retailfix-red-500 text-white'
                      : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  Wall Rack (Attached)
                </button>
                <button
                  type="button"
                  onClick={() => setPlacementType('center')}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold transition-all ${
                    placementType === 'center'
                      ? 'bg-retailfix-red-600/20 border-retailfix-red-500 text-white'
                      : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  Center / Free-standing
                </button>
              </div>

              {placementType === 'wall' && walls.length > 1 && (
                <div className="mt-2.5">
                  <label className="block text-[11px] text-slate-400 mb-1">Target Wall:</label>
                  <select
                    value={targetWallId}
                    onChange={(e) => setTargetWallId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="">Auto (Nearest Wall)</option>
                    {walls.map((w, idx) => (
                      <option key={w.id} value={w.id}>
                        Wall {idx + 1}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Real-time Label Preview */}
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1.5 font-mono text-xs">
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400 font-sans">Designation:</span>
              <span className="text-white font-bold">{rackLabel}</span>
            </div>
            <div className="flex justify-between items-center text-[11px]">
              <span className="text-slate-400 font-sans">CAD Text:</span>
              <span className="text-emerald-400 font-bold">C-RACK {compactLabel}</span>
            </div>
          </div>

          {/* Validation Errors */}
          {errors.length > 0 && (
            <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-800/60 flex items-start gap-2 text-red-300 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div>{errors[0]}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2.5 rounded-xl text-xs transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isValid}
              className="flex-1 bg-retailfix-red-600 hover:bg-retailfix-red-500 disabled:opacity-40 text-white font-bold py-2.5 rounded-xl text-xs transition-all shadow-lg shadow-red-950 flex items-center justify-center gap-1.5"
            >
              Add Rack
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
