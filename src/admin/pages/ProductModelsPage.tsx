import React, { useState, useEffect, useCallback } from 'react';
import {
  api,
  type Product3DModelData,
  type GLBUploadResult,
  type ProductReferenceCheckResult,
} from '../../services/api';
import { ModelPreviewModal } from '../components/ModelPreviewModal';
import { formatFeetInches } from '../../cad/geometry/FeetInches';
import { ProductModelRegistry } from '../../cad/services/ProductModelRegistry';
import { GLBCache } from '../../cad/rendering3d/GLBCache';
import {
  Box,
  Plus,
  Search,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Eye,
  Check,
  X,
  Loader2,
  RefreshCw,
  Trash2,
  Archive,
  Edit,
  Layers,
  ShieldAlert,
} from 'lucide-react';

interface ProductModelsPageProps {
  token: string;
}

export const ProductModelsPage: React.FC<ProductModelsPageProps> = ({ token }) => {
  const [products, setProducts] = useState<Product3DModelData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showArchived, setShowArchived] = useState(true); // Default to showing all products

  // View Modal state
  const [viewProduct, setViewProduct] = useState<Product3DModelData | null>(null);

  // 3D Preview Modal state
  const [previewProduct, setPreviewProduct] = useState<any>(null);

  // Add Product Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [isUploadingGLB, setIsUploadingGLB] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadResult, setUploadResult] = useState<GLBUploadResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Product Modal
  const [editProduct, setEditProduct] = useState<Product3DModelData | null>(null);
  const [isEditingSaving, setIsEditingSaving] = useState(false);
  const [editFormError, setEditFormError] = useState<string | null>(null);
  const [editReplaceFile, setEditReplaceFile] = useState<File | null>(null);

  // Delete / Archive Modal
  const [deleteTarget, setDeleteTarget] = useState<Product3DModelData | null>(null);
  const [isCheckingRefs, setIsCheckingRefs] = useState(false);
  const [refCheckResult, setRefCheckResult] = useState<ProductReferenceCheckResult | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Notification Banner
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create Form State
  const [createForm, setCreateForm] = useState({
    productName: '',
    sku: '',
    category: 'Wall Racks',
    productType: 'Wall Rack',
    widthFt: 3,
    widthIn: 0,
    depthFt: 2,
    depthIn: 0,
    heightFt: 7,
    heightIn: 0,
    shelfCount: 6,
    minShelves: 3,
    maxShelves: 10,
    shelfMode: 'AUTO_SPACING' as 'AUTO_SPACING' | 'FIXED_SPACING' | 'FIXED_COUNT',
    shelfSpacing: 'Auto',
    shelfThickness: 1.0,
    variableShelves: true,
    scalingMode: 'stretch' as 'stretch' | 'fit',
    localWidthAxis: 'X' as 'X' | 'Y' | 'Z',
    localHeightAxis: 'Y' as 'X' | 'Y' | 'Z',
    localDepthAxis: 'Z' as 'X' | 'Y' | 'Z',
    correctionRotationY: 0,
    active: true,
  });

  // Edit Form State
  const [editForm, setEditForm] = useState({
    productName: '',
    sku: '',
    category: 'Wall Racks',
    productType: 'Wall Rack',
    widthFt: 3,
    widthIn: 0,
    depthFt: 2,
    depthIn: 0,
    heightFt: 7,
    heightIn: 0,
    shelfCount: 6,
    minShelves: 3,
    maxShelves: 10,
    shelfMode: 'AUTO_SPACING' as 'AUTO_SPACING' | 'FIXED_SPACING' | 'FIXED_COUNT',
    shelfSpacing: 'Auto',
    shelfThickness: 1.0,
    variableShelves: true,
    scalingMode: 'stretch' as 'stretch' | 'fit',
    active: true,
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4500);
  };

  // Fetch product list
  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.getProducts({
        search: searchTerm || undefined,
        category: categoryFilter,
        include_inactive: showArchived,
      });
      setProducts(res?.items || []);
    } catch (err: any) {
      console.error('Failed to load products:', err);
      showToast(err.message || 'Failed to fetch product models', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [searchTerm, categoryFilter, showArchived]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Synchronize CAD Registry whenever product changes occur
  const syncCADRegistry = async () => {
    try {
      GLBCache.clear();
      await ProductModelRegistry.loadProducts(true);
    } catch (e) {
      console.warn('CAD registry sync deferred:', e);
    }
  };

  // Format Date Helper
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  // Convert Feet & Inches to total inches
  const toTotalInches = (ft: number, inch: number) => {
    return Math.round((Math.max(0, ft) * 12 + Math.max(0, inch)) * 10) / 10;
  };

  // Convert total inches to feet and inches
  const fromTotalInches = (totalInches: number) => {
    const total = Math.max(0, Math.round(totalInches));
    const ft = Math.floor(total / 12);
    const inch = total % 12;
    return { ft, inch };
  };

  // Handle GLB upload for new product
  const handleGLBUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.glb') && !lowerName.endsWith('.gltf')) {
      setFormError('Only .glb and .gltf 3D files are supported.');
      return;
    }

    setFormError(null);
    setIsUploadingGLB(true);
    try {
      const res = await api.uploadProductGLB(token, file);
      setUploadResult(res);

      const detected = res.detected_dimensions;
      if (detected) {
        const isZWidth = (detected.depth_inches || 0) > (detected.width_inches || 0);
        const w = fromTotalInches(detected.width_inches || 36);
        const h = fromTotalInches(detected.height_inches || 84);
        const d = fromTotalInches(detected.depth_inches || 24);

        setCreateForm((prev) => ({
          ...prev,
          productName: prev.productName || file.name.replace(/\.(glb|gltf)$/i, '').replace(/[_\-]/g, ' '),
          sku: prev.sku || `SKU-${file.name.replace(/\.(glb|gltf)$/i, '').replace(/[^a-zA-Z0-9]/g, '').substring(0, 8).toUpperCase()}`,
          widthFt: w.ft,
          widthIn: w.inch,
          heightFt: h.ft,
          heightIn: h.inch,
          depthFt: d.ft,
          depthIn: d.inch,
          localWidthAxis: isZWidth ? 'Z' : 'X',
          localDepthAxis: isZWidth ? 'X' : 'Z',
          correctionRotationY: isZWidth ? 90 : 0,
        }));
      }
      showToast(`GLB "${file.name}" uploaded & validated successfully!`);
    } catch (err: any) {
      setFormError(err.message || 'GLB upload failed. Please verify file integrity.');
    } finally {
      setIsUploadingGLB(false);
    }
  };

  // Save New Rack Product
  const handleSaveCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadResult) {
      setFormError('Please select and upload a valid .glb rack model.');
      return;
    }

    const name = createForm.productName.trim();
    const sku = createForm.sku.trim();
    if (!name) {
      setFormError('Rack Name is required.');
      return;
    }
    if (!sku) {
      setFormError('SKU is required and must be unique.');
      return;
    }
    if (createForm.widthIn < 0 || createForm.widthIn > 11) {
      setFormError('Width inches must be between 0 and 11.');
      return;
    }
    if (createForm.depthIn < 0 || createForm.depthIn > 11) {
      setFormError('Depth inches must be between 0 and 11.');
      return;
    }
    if (createForm.heightIn < 0 || createForm.heightIn > 11) {
      setFormError('Height inches must be between 0 and 11.');
      return;
    }

    const totalW = toTotalInches(createForm.widthFt, createForm.widthIn);
    const totalD = toTotalInches(createForm.depthFt, createForm.depthIn);
    const totalH = toTotalInches(createForm.heightFt, createForm.heightIn);

    if (totalW <= 0) {
      setFormError('Base Width must be greater than 0.');
      return;
    }
    if (totalD <= 0) {
      setFormError('Base Depth must be greater than 0.');
      return;
    }
    if (totalH <= 0) {
      setFormError('Base Height must be greater than 0.');
      return;
    }
    if (createForm.shelfCount < 0) {
      setFormError('Shelf count must be 0 or greater.');
      return;
    }

    setIsSaving(true);
    setFormError(null);
    try {
      const created = await api.createProduct(token, {
        product_name: name,
        product_type: createForm.productType,
        sku: sku,
        category: createForm.category || 'Wall Racks',
        width: totalW,
        height: totalH,
        depth: totalD,
        shelf_count: Number(createForm.shelfCount),
        min_shelves: Number(createForm.minShelves),
        max_shelves: Number(createForm.maxShelves),
        shelf_mode: createForm.shelfMode,
        shelf_thickness: Number(createForm.shelfThickness) || 1.0,
        scaling_mode: createForm.scalingMode,
        glb_url: uploadResult.glb_url,
        storage_path: uploadResult.storage_path,
        active: createForm.active,
        metadata_json: JSON.stringify({
          localWidthAxis: createForm.localWidthAxis,
          localHeightAxis: createForm.localHeightAxis,
          localDepthAxis: createForm.localDepthAxis,
          correctionRotation: { x: 0, y: Number(createForm.correctionRotationY) || 0, z: 0 },
          supportsParametricShelves: createForm.variableShelves,
          shelfCount: Number(createForm.shelfCount),
          shelfThickness: Number(createForm.shelfThickness) || 1.0,
          shelfSpacing: createForm.shelfSpacing,
          minShelves: Number(createForm.minShelves),
          maxShelves: Number(createForm.maxShelves),
          detected_width: uploadResult.detected_dimensions?.width_inches,
          detected_height: uploadResult.detected_dimensions?.height_inches,
          detected_depth: uploadResult.detected_dimensions?.depth_inches,
          mesh_count: uploadResult.mesh_count,
        }),
      });

      setShowAddModal(false);
      setUploadResult(null);
      showToast(`Rack "${created.productName}" (${created.sku}) created successfully!`);
      await fetchProducts();
      await syncCADRegistry();
    } catch (err: any) {
      setFormError(err.message || 'Failed to create product model.');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (p: Product3DModelData) => {
    const w = fromTotalInches(p.width);
    const d = fromTotalInches(p.depth);
    const h = fromTotalInches(p.height);

    setEditProduct(p);
    setEditForm({
      productName: p.productName,
      sku: p.sku || '',
      category: p.category || 'Wall Racks',
      productType: p.productType || 'Wall Rack',
      widthFt: w.ft,
      widthIn: w.inch,
      depthFt: d.ft,
      depthIn: d.inch,
      heightFt: h.ft,
      heightIn: h.inch,
      shelfCount: p.shelfCount ?? 6,
      minShelves: p.minShelves ?? 3,
      maxShelves: p.maxShelves ?? 10,
      shelfMode: (p.shelfMode as any) || 'AUTO_SPACING',
      shelfSpacing: (p as any).shelfSpacing || 'Auto',
      shelfThickness: p.shelfThickness ?? 1.0,
      variableShelves: (p.metadata?.supportsParametricShelves ?? true),
      scalingMode: (p.scalingMode as any) || 'stretch',
      active: p.active,
    });
    setEditReplaceFile(null);
    setEditFormError(null);
  };

  // Save Edit Rack
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editProduct) return;

    const name = editForm.productName.trim();
    const sku = editForm.sku.trim();
    if (!name) {
      setEditFormError('Rack Name is required.');
      return;
    }
    if (!sku) {
      setEditFormError('SKU is required and must be unique.');
      return;
    }
    if (editForm.widthIn < 0 || editForm.widthIn > 11) {
      setEditFormError('Width inches must be 0–11.');
      return;
    }
    if (editForm.depthIn < 0 || editForm.depthIn > 11) {
      setEditFormError('Depth inches must be 0–11.');
      return;
    }
    if (editForm.heightIn < 0 || editForm.heightIn > 11) {
      setEditFormError('Height inches must be 0–11.');
      return;
    }

    const totalW = toTotalInches(editForm.widthFt, editForm.widthIn);
    const totalD = toTotalInches(editForm.depthFt, editForm.depthIn);
    const totalH = toTotalInches(editForm.heightFt, editForm.heightIn);

    if (totalW <= 0 || totalD <= 0 || totalH <= 0) {
      setEditFormError('All dimensions must be greater than 0.');
      return;
    }

    setIsEditingSaving(true);
    setEditFormError(null);
    try {
      // 1. If replacement GLB selected, upload and replace it first
      if (editReplaceFile) {
        await api.replaceProductGLB(token, editProduct.id, editReplaceFile);
        GLBCache.invalidate(editProduct.glbUrl);
        GLBCache.clear();
      }

      // 2. Update product metadata
      const updated = await api.updateProduct(token, editProduct.id, {
        product_name: name,
        sku: sku,
        category: editForm.category,
        product_type: editForm.productType,
        width: totalW,
        height: totalH,
        depth: totalD,
        shelf_count: Number(editForm.shelfCount),
        min_shelves: Number(editForm.minShelves),
        max_shelves: Number(editForm.maxShelves),
        shelf_mode: editForm.shelfMode,
        shelf_thickness: Number(editForm.shelfThickness) || 1.0,
        scaling_mode: editForm.scalingMode,
        active: editForm.active,
        metadata_json: JSON.stringify({
          ...(editProduct.metadata || {}),
          supportsParametricShelves: editForm.variableShelves,
          shelfCount: Number(editForm.shelfCount),
          shelfThickness: Number(editForm.shelfThickness) || 1.0,
          shelfSpacing: editForm.shelfSpacing,
          minShelves: Number(editForm.minShelves),
          maxShelves: Number(editForm.maxShelves),
        }),
      });

      setEditProduct(null);
      showToast(`Rack "${updated.productName}" updated successfully!`);
      await fetchProducts();
      await syncCADRegistry();
    } catch (err: any) {
      setEditFormError(err.message || 'Failed to update product model.');
    } finally {
      setIsEditingSaving(false);
    }
  };

  // Toggle Active / Inactive
  const handleToggleActive = async (product: Product3DModelData) => {
    try {
      const updated = await api.toggleProductActive(token, product.id);
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, active: updated.active } : p))
      );
      showToast(
        `Rack "${product.productName}" is now ${updated.active ? 'Active (available in Add Rack)' : 'Inactive (hidden from Add Rack)'}`
      );
      await syncCADRegistry();
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle status', 'error');
    }
  };

  // Open Delete / Archive Confirmation Dialog with Reference Check
  const handleRequestDelete = async (product: Product3DModelData) => {
    setDeleteTarget(product);
    setIsCheckingRefs(true);
    setRefCheckResult(null);

    try {
      const check = await api.checkProductReferences(token, product.id);
      setRefCheckResult(check);
    } catch (err: any) {
      console.error('Failed to check references:', err);
      // Fallback
      setRefCheckResult({
        product_id: product.id,
        product_code: product.productId,
        product_name: product.productName,
        referenced: false,
        reference_count: 0,
        project_codes: [],
        can_delete: true,
        message: 'No project references detected.',
      });
    } finally {
      setIsCheckingRefs(false);
    }
  };

  // Execute Delete or Archive Action
  const handleConfirmDeleteOrArchive = async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      if (refCheckResult?.referenced) {
        // Archive instead of delete
        await api.archiveProduct(token, deleteTarget.id);
        showToast(`Rack "${deleteTarget.productName}" has been safely archived. Existing CAD projects continue loading.`);
      } else {
        // Permanent delete
        const res = await api.deleteProduct(token, deleteTarget.id);
        showToast(res.message || `Rack "${deleteTarget.productName}" permanently deleted.`);
      }
      setDeleteTarget(null);
      await fetchProducts();
      await syncCADRegistry();
    } catch (err: any) {
      showToast(err.message || 'Action failed', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const categories = ['All', 'Wall Racks', 'Center Racks', 'Endcaps', 'Display Racks', 'Corner Racks'];

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {notification && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-sm font-medium border transition-all animate-in fade-in slide-in-from-top-4 ${
            notification.type === 'success'
              ? 'bg-emerald-900/90 text-emerald-100 border-emerald-700/60'
              : 'bg-red-900/90 text-red-100 border-red-700/60'
          }`}
        >
          {notification.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          )}
          <span>{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="ml-2 text-slate-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <Box className="w-7 h-7 text-retailfix-red-600" />
            Rack & Product Models
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Single management catalog for RetailFix racks. Active models dynamically power CAD Add Rack.
          </p>
        </div>

        <button
          onClick={() => {
            setCreateForm({
              productName: '',
              sku: '',
              category: 'Wall Racks',
              productType: 'Wall Rack',
              widthFt: 3,
              widthIn: 0,
              depthFt: 2,
              depthIn: 0,
              heightFt: 7,
              heightIn: 0,
              shelfCount: 5,
              minShelves: 1,
              maxShelves: 10,
              shelfMode: 'AUTO_SPACING',
              scalingMode: 'stretch',
              localWidthAxis: 'X',
              localHeightAxis: 'Y',
              localDepthAxis: 'Z',
              correctionRotationY: 0,
              shelfSpacing: 'auto',
              shelfThickness: 1.0,
              variableShelves: true,
              active: true,
            });
            setUploadResult(null);
            setFormError(null);
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white font-semibold text-sm rounded-xl shadow-md shadow-red-600/20 transition-all hover:scale-[1.02]"
        >
          <Plus className="w-4 h-4" />
          + Add Rack
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by rack name, SKU, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-retailfix-red-500/20 focus:border-retailfix-red-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                categoryFilter === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
          <button
            onClick={() => setShowArchived(!showArchived)}
            title={showArchived ? 'Hide inactive products' : 'Show inactive products'}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ml-1 ${
              showArchived
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? 'Showing Inactive' : 'Active Only'}
          </button>
          <button
            onClick={fetchProducts}
            title="Refresh"
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors ml-1"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Rack Products Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500">
            <Loader2 className="w-8 h-8 text-retailfix-red-600 animate-spin mb-2" />
            <p className="text-sm">Loading rack product catalog...</p>
          </div>
        ) : (products || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
              <Box className="w-8 h-8" />
            </div>
            <h3 className="text-base font-bold text-slate-700">No rack products found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm">
              Click "+ Add Rack" to register a new 3D rack model.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm min-w-[950px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Rack Name</th>
                  <th className="px-3 py-3.5">SKU</th>
                  <th className="px-3 py-3.5">Category</th>
                  <th className="px-3 py-3.5">Base Width</th>
                  <th className="px-3 py-3.5">Base Depth</th>
                  <th className="px-3 py-3.5">Base Height</th>
                  <th className="px-3 py-3.5">Shelf Count / Mode</th>
                  <th className="px-3 py-3.5 text-center">GLB</th>
                  <th className="px-3 py-3.5 text-center">Status</th>
                  <th className="px-3 py-3.5">Created Date</th>
                  <th className="px-3 py-3.5">Updated Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {products.map((p) => (
                  <tr
                    key={`${p.productId || p.id}_${p.id}`}
                    className={`hover:bg-slate-50/80 transition-colors ${!p.active ? 'bg-slate-50/40 text-slate-500' : ''}`}
                  >
                    {/* Rack Name */}
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{p.productName}</div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        {p.productId} {p.version > 1 && <span className="text-slate-500">· v{p.version}</span>}
                      </div>
                    </td>

                    {/* SKU */}
                    <td className="px-3 py-3.5 font-mono text-xs font-medium text-slate-700">
                      {p.sku || '—'}
                    </td>

                    {/* Category */}
                    <td className="px-3 py-3.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {p.category || p.productType}
                      </span>
                    </td>

                    {/* Base Width */}
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <div className="font-medium text-slate-800">{formatFeetInches(p.width)}</div>
                      <div className="text-[10px] text-slate-400">{p.width}″</div>
                    </td>

                    {/* Base Depth */}
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <div className="font-medium text-slate-800">{formatFeetInches(p.depth)}</div>
                      <div className="text-[10px] text-slate-400">{p.depth}″</div>
                    </td>

                    {/* Base Height */}
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <div className="font-medium text-slate-800">{formatFeetInches(p.height)}</div>
                      <div className="text-[10px] text-slate-400">{p.height}″</div>
                    </td>

                    {/* Shelf Count / Mode */}
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <div className="font-medium text-slate-800">
                        {p.shelfCount ?? 5} shelves
                      </div>
                      <div className="text-[10px] text-slate-400 capitalize">
                        {(p.shelfMode || 'AUTO_SPACING').toLowerCase().replace('_', ' ')}
                      </div>
                    </td>

                    {/* GLB File / Preview */}
                    <td className="px-3 py-3.5 text-center">
                      <button
                        onClick={() => setPreviewProduct(p)}
                        title="Inspect 3D GLB Model"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5 text-retailfix-red-500" />
                        <span>GLB 3D</span>
                      </button>
                    </td>

                    {/* Status */}
                    <td className="px-3 py-3.5 text-center">
                      <button
                        onClick={() => handleToggleActive(p)}
                        title="Click to toggle Active / Inactive"
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                          p.active
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 border border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${p.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {p.active ? 'Active' : 'Inactive'}
                      </button>
                    </td>

                    {/* Created Date */}
                    <td className="px-3 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(p.createdAt)}
                    </td>

                    {/* Updated Date */}
                    <td className="px-3 py-3.5 text-xs text-slate-500 whitespace-nowrap">
                      {formatDate(p.updatedAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Action */}
                        <button
                          onClick={() => setViewProduct(p)}
                          title="View Rack Details (Read-only)"
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Action */}
                        <button
                          onClick={() => handleOpenEdit(p)}
                          title="Edit Rack Product"
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-blue-600 transition-colors"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Activate / Deactivate Action */}
                        <button
                          onClick={() => handleToggleActive(p)}
                          title={p.active ? 'Deactivate (hide from CAD)' : 'Activate (make available in CAD)'}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            p.active
                              ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {p.active ? <X className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
                        </button>

                        {/* Delete / Archive Action */}
                        <button
                          onClick={() => handleRequestDelete(p)}
                          title="Delete or Archive Rack"
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* 1. VIEW RACK MODAL (Read-Only) */}
      {/* ========================================================= */}
      {viewProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-4xl max-h-[92dvh] bg-white rounded-2xl shadow-2xl overflow-y-auto border border-slate-200 my-auto">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-retailfix-red-600/10 text-retailfix-red-600 flex items-center justify-center">
                  <Eye className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">
                    View Rack: {viewProduct.productName}
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {viewProduct.productId} • {viewProduct.sku || 'No SKU'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setViewProduct(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Status Badge & Summary */}
              <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                      viewProduct.active
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-slate-200 text-slate-600 border border-slate-300'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${viewProduct.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                    {viewProduct.active ? 'Active (Live in CAD Add Rack)' : 'Inactive (Archived)'}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">Category: {viewProduct.category || viewProduct.productType}</span>
                  <span className="text-xs text-slate-500 font-medium">Scaling: <strong className="font-mono text-slate-700 uppercase">{viewProduct.scalingMode || 'stretch'}</strong></span>
                </div>
                <div className="text-xs text-slate-500 flex items-center gap-4">
                  <span>Created: {formatDate(viewProduct.createdAt)}</span>
                  <span>Updated: {formatDate(viewProduct.updatedAt)}</span>
                </div>
              </div>

              {/* Base Dimensions & Shelf Specs */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Dimensions Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                    Base Dimensions
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Width</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">{formatFeetInches(viewProduct.width)}</div>
                      <div className="text-[10px] text-slate-400">{viewProduct.width}″</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Depth</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">{formatFeetInches(viewProduct.depth)}</div>
                      <div className="text-[10px] text-slate-400">{viewProduct.depth}″</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Height</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">{formatFeetInches(viewProduct.height)}</div>
                      <div className="text-[10px] text-slate-400">{viewProduct.height}″</div>
                    </div>
                  </div>
                </div>

                {/* Shelf Configuration Card */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">
                    Shelf Configuration
                  </h4>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Default Shelves</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">{viewProduct.shelfCount ?? 5}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Min Shelves</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">{viewProduct.minShelves ?? 1}</div>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="text-[10px] text-slate-400 uppercase font-semibold">Max Shelves</div>
                      <div className="text-sm font-bold text-slate-800 mt-0.5">{viewProduct.maxShelves ?? 10}</div>
                    </div>
                  </div>
                  <div className="mt-2.5 text-[11px] text-slate-500 text-center">
                    Spacing Mode: <strong className="text-slate-700 capitalize">{(viewProduct.shelfMode || 'AUTO_SPACING').toLowerCase().replace('_', ' ')}</strong>
                  </div>
                </div>
              </div>

              {/* 3D GLB Preview Button / Embedded Viewer */}
              <div className="p-4 bg-slate-900 rounded-xl text-white flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm flex items-center gap-2">
                    <Box className="w-4 h-4 text-emerald-400" />
                    Uploaded 3D Model: <span className="font-mono text-emerald-300 text-xs">{viewProduct.glbUrl.split('/').pop()}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Original GLB binary with non-destructive Three.js runtime scaling
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    // Open the interactive Three.js 3D modal
                    const p = viewProduct;
                    setViewProduct(null);
                    setPreviewProduct(p);
                  }}
                  className="px-4 py-2 bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Launch Interactive 3D Viewer
                </button>
              </div>
            </div>

            <div className="flex justify-end px-6 py-4 border-t border-slate-200 bg-slate-50">
              <button
                type="button"
                onClick={() => setViewProduct(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg transition-colors"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. CREATE RACK MODAL */}
      {/* ========================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl max-h-[92dvh] bg-white rounded-2xl shadow-2xl overflow-y-auto border border-slate-200 my-auto">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-retailfix-red-600/10 text-retailfix-red-600 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-800">Create New Rack Model</h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCreate} className="p-6 space-y-5">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Basic Rack Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rack Name *</label>
                  <input
                    type="text"
                    required
                    value={createForm.productName}
                    onChange={(e) => setCreateForm({ ...createForm, productName: e.target.value })}
                    placeholder="e.g. Wall Rack 7×3"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-retailfix-red-500/20 focus:border-retailfix-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU (Unique) *</label>
                  <input
                    type="text"
                    required
                    value={createForm.sku}
                    onChange={(e) => setCreateForm({ ...createForm, sku: e.target.value })}
                    placeholder="e.g. WR-7X3"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-retailfix-red-500/20 focus:border-retailfix-red-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                  <select
                    value={createForm.category}
                    onChange={(e) =>
                      setCreateForm({
                        ...createForm,
                        category: e.target.value,
                        productType: e.target.value.replace(/s$/, ''),
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-retailfix-red-500/20 focus:border-retailfix-red-500"
                  >
                    <option value="Wall Racks">Wall Racks</option>
                    <option value="Center Racks">Center Racks (Gondola)</option>
                    <option value="Endcaps">Endcaps</option>
                    <option value="Corner Racks">Corner Racks</option>
                    <option value="Display Racks">Display Racks</option>
                  </select>
                </div>
              </div>

              {/* 2. GLB File Upload Dropzone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Rack GLB 3D Model (.glb / .gltf) *
                </label>
                <label
                  className={`border-2 border-dashed rounded-xl p-5 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                    uploadResult
                      ? 'border-emerald-400 bg-emerald-50/30'
                      : isUploadingGLB
                      ? 'border-retailfix-red-400 bg-red-50/20'
                      : 'border-slate-300 hover:border-retailfix-red-400 bg-slate-50'
                  }`}
                >
                  <input
                    type="file"
                    accept=".glb,.gltf"
                    onChange={handleGLBUpload}
                    className="hidden"
                    disabled={isUploadingGLB}
                  />
                  {isUploadingGLB ? (
                    <div className="flex flex-col items-center text-slate-600">
                      <Loader2 className="w-8 h-8 text-retailfix-red-600 animate-spin mb-2" />
                      <p className="text-sm font-medium">Validating & Uploading 3D Model...</p>
                      <p className="text-xs text-slate-400 mt-0.5">Checking binary glTF mesh integrity</p>
                    </div>
                  ) : uploadResult ? (
                    <div className="flex flex-col items-center text-emerald-800 text-center">
                      <CheckCircle2 className="w-7 h-7 text-emerald-600 mb-1" />
                      <p className="text-sm font-bold text-emerald-900">{uploadResult.file_name}</p>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        Valid GLB • {uploadResult.mesh_count} meshes • {(uploadResult.file_size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          setPreviewProduct({
                            id: 0,
                            productId: 'NEW_PREVIEW',
                            productName: createForm.productName || 'Preview',
                            productType: createForm.productType,
                            sku: createForm.sku,
                            width: toTotalInches(createForm.widthFt, createForm.widthIn),
                            height: toTotalInches(createForm.heightFt, createForm.heightIn),
                            depth: toTotalInches(createForm.depthFt, createForm.depthIn),
                            glbUrl: uploadResult.glb_url,
                            storagePath: uploadResult.storage_path,
                            version: 1,
                            active: true,
                            shelfCount: Number(createForm.shelfCount),
                            shelfThickness: Number(createForm.shelfThickness) || 1.0,
                            metadata: {
                              supportsParametricShelves: createForm.variableShelves,
                            },
                          });
                        }}
                        className="mt-2 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-sm"
                      >
                        Preview 3D Model Now
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-slate-500 text-center">
                      <UploadCloud className="w-7 h-7 text-slate-400 mb-1" />
                      <p className="text-sm font-medium text-slate-700">Click or drag `.glb` file here</p>
                      <p className="text-xs text-slate-400 mt-0.5">Accepted: .glb, .gltf (glTF 2.0 binary)</p>
                    </div>
                  )}
                </label>
              </div>

              {/* 3. Base Dimensions (Feet & Inches) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Base Dimensions (Feet & Inches)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {/* Width */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Base Width *</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <input
                          type="number"
                          min={0}
                          value={createForm.widthFt}
                          onChange={(e) => setCreateForm({ ...createForm, widthFt: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                          placeholder="Ft"
                        />
                        <span className="block text-[10px] text-slate-400 text-center mt-0.5">Feet</span>
                      </div>
                      <div>
                        <input
                          type="number"
                          min={0}
                          max={11}
                          value={createForm.widthIn}
                          onChange={(e) => setCreateForm({ ...createForm, widthIn: Math.min(11, Math.max(0, parseInt(e.target.value) || 0)) })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                          placeholder="In"
                        />
                        <span className="block text-[10px] text-slate-400 text-center mt-0.5">In (0-11)</span>
                      </div>
                    </div>
                    <div className="text-center text-[10px] text-retailfix-red-600 font-semibold mt-1">
                      Total: {toTotalInches(createForm.widthFt, createForm.widthIn)}″
                    </div>
                  </div>

                  {/* Depth */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Base Depth *</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <input
                          type="number"
                          min={0}
                          value={createForm.depthFt}
                          onChange={(e) => setCreateForm({ ...createForm, depthFt: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                          placeholder="Ft"
                        />
                        <span className="block text-[10px] text-slate-400 text-center mt-0.5">Feet</span>
                      </div>
                      <div>
                        <input
                          type="number"
                          min={0}
                          max={11}
                          value={createForm.depthIn}
                          onChange={(e) => setCreateForm({ ...createForm, depthIn: Math.min(11, Math.max(0, parseInt(e.target.value) || 0)) })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                          placeholder="In"
                        />
                        <span className="block text-[10px] text-slate-400 text-center mt-0.5">In (0-11)</span>
                      </div>
                    </div>
                    <div className="text-center text-[10px] text-retailfix-red-600 font-semibold mt-1">
                      Total: {toTotalInches(createForm.depthFt, createForm.depthIn)}″
                    </div>
                  </div>

                  {/* Height */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Base Height *</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div>
                        <input
                          type="number"
                          min={0}
                          value={createForm.heightFt}
                          onChange={(e) => setCreateForm({ ...createForm, heightFt: Math.max(0, parseInt(e.target.value) || 0) })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                          placeholder="Ft"
                        />
                        <span className="block text-[10px] text-slate-400 text-center mt-0.5">Feet</span>
                      </div>
                      <div>
                        <input
                          type="number"
                          min={0}
                          max={11}
                          value={createForm.heightIn}
                          onChange={(e) => setCreateForm({ ...createForm, heightIn: Math.min(11, Math.max(0, parseInt(e.target.value) || 0)) })}
                          className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                          placeholder="In"
                        />
                        <span className="block text-[10px] text-slate-400 text-center mt-0.5">In (0-11)</span>
                      </div>
                    </div>
                    <div className="text-center text-[10px] text-retailfix-red-600 font-semibold mt-1">
                      Total: {toTotalInches(createForm.heightFt, createForm.heightIn)}″
                    </div>
                  </div>
                </div>
              </div>

              {/* 4. Shelf Configuration & Scaling Mode */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Shelf Configuration (Phase 6) */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Shelf Configuration
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={createForm.variableShelves}
                        onChange={(e) => setCreateForm({ ...createForm, variableShelves: e.target.checked })}
                        className="rounded border-slate-300 text-retailfix-red-600 focus:ring-retailfix-red-500"
                      />
                      <span className="text-xs font-semibold text-slate-700">Variable Shelves</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Shelf Count</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={createForm.shelfCount}
                        onChange={(e) => setCreateForm({ ...createForm, shelfCount: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono bg-white font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Shelf Spacing</label>
                      <select
                        value={createForm.shelfSpacing}
                        onChange={(e) => setCreateForm({ ...createForm, shelfSpacing: e.target.value })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono"
                      >
                        <option value="Auto">Auto</option>
                        <option value="10">10″</option>
                        <option value="12">12″</option>
                        <option value="14">14″</option>
                        <option value="16">16″</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Shelf Thickness</label>
                      <select
                        value={createForm.shelfThickness}
                        onChange={(e) => setCreateForm({ ...createForm, shelfThickness: parseFloat(e.target.value) || 1.0 })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono"
                      >
                        <option value={1.0}>1″</option>
                        <option value={1.25}>1.25″</option>
                        <option value={1.5}>1.5″</option>
                        <option value={2.0}>2″</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Minimum Shelves</label>
                      <input
                        type="number"
                        min={1}
                        max={createForm.maxShelves}
                        value={createForm.minShelves}
                        onChange={(e) => setCreateForm({ ...createForm, minShelves: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs text-center font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Maximum Shelves</label>
                      <input
                        type="number"
                        min={createForm.minShelves}
                        max={16}
                        value={createForm.maxShelves}
                        onChange={(e) => setCreateForm({ ...createForm, maxShelves: Math.max(createForm.minShelves, parseInt(e.target.value) || 1) })}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs text-center font-mono bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Scaling Mode */}
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    3D Scaling Mode
                  </div>
                  <select
                    value={createForm.scalingMode}
                    onChange={(e) => setCreateForm({ ...createForm, scalingMode: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white mt-1"
                  >
                    <option value="stretch">Axis Scale (Stretch independent W, D, H — Recommended)</option>
                    <option value="fit">Uniform Fit (Proportional scaling)</option>
                  </select>
                  <p className="text-[10px] text-slate-500">
                    Axis Scale computes widthScale = currentWidth / baseWidth, depthScale = currentDepth / baseDepth, heightScale = currentHeight / baseHeight.
                  </p>
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="create_rack_active"
                  checked={createForm.active}
                  onChange={(e) => setCreateForm({ ...createForm, active: e.target.checked })}
                  className="w-4 h-4 text-retailfix-red-600 rounded border-slate-300 focus:ring-retailfix-red-500"
                />
                <label htmlFor="create_rack_active" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Active (Immediately available in CAD Add Rack menu)
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-medium text-xs rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !uploadResult}
                  className={`px-5 py-2 bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white font-semibold text-xs rounded-lg shadow-md shadow-red-600/20 flex items-center gap-2 transition-all ${
                    isSaving || !uploadResult ? 'opacity-60 cursor-not-allowed' : ''
                  }`}
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Rack Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. EDIT RACK MODAL */}
      {/* ========================================================= */}
      {editProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl max-h-[92dvh] bg-white rounded-2xl shadow-2xl overflow-y-auto border border-slate-200 my-auto">
            <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/10 text-blue-600 flex items-center justify-center">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800">Edit Rack: {editProduct.productName}</h3>
                  <span className="text-xs text-slate-400 font-mono">{editProduct.productId}</span>
                </div>
              </div>
              <button
                onClick={() => setEditProduct(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-5">
              {/* Product Versioning Notice */}
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 flex items-start gap-2">
                <Layers className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold">Product Versioning Protection:</strong> Updating model dimensions or GLB applies strictly to NEW placements. Existing saved CAD projects will preserve their original geometry intact.
                </div>
              </div>

              {editFormError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{editFormError}</span>
                </div>
              )}

              {/* Name, SKU, Category */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Rack Name *</label>
                  <input
                    type="text"
                    required
                    value={editForm.productName}
                    onChange={(e) => setEditForm({ ...editForm, productName: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">SKU (Unique) *</label>
                  <input
                    type="text"
                    required
                    value={editForm.sku}
                    onChange={(e) => setEditForm({ ...editForm, sku: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Category *</label>
                  <select
                    value={editForm.category}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        category: e.target.value,
                        productType: e.target.value.replace(/s$/, ''),
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="Wall Racks">Wall Racks</option>
                    <option value="Center Racks">Center Racks (Gondola)</option>
                    <option value="Endcaps">Endcaps</option>
                    <option value="Corner Racks">Corner Racks</option>
                    <option value="Display Racks">Display Racks</option>
                  </select>
                </div>
              </div>

              {/* Base Dimensions (Feet & Inches) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  Base Dimensions (Feet & Inches)
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Base Width</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={editForm.widthFt}
                        onChange={(e) => setEditForm({ ...editForm, widthFt: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                        placeholder="Ft"
                      />
                      <input
                        type="number"
                        min={0}
                        max={11}
                        value={editForm.widthIn}
                        onChange={(e) => setEditForm({ ...editForm, widthIn: Math.min(11, Math.max(0, parseInt(e.target.value) || 0)) })}
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                        placeholder="In"
                      />
                    </div>
                    <div className="text-center text-[10px] text-retailfix-red-600 font-semibold mt-1">
                      Total: {toTotalInches(editForm.widthFt, editForm.widthIn)}″
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Base Depth</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={editForm.depthFt}
                        onChange={(e) => setEditForm({ ...editForm, depthFt: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                        placeholder="Ft"
                      />
                      <input
                        type="number"
                        min={0}
                        max={11}
                        value={editForm.depthIn}
                        onChange={(e) => setEditForm({ ...editForm, depthIn: Math.min(11, Math.max(0, parseInt(e.target.value) || 0)) })}
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                        placeholder="In"
                      />
                    </div>
                    <div className="text-center text-[10px] text-retailfix-red-600 font-semibold mt-1">
                      Total: {toTotalInches(editForm.depthFt, editForm.depthIn)}″
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Base Height</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="number"
                        min={0}
                        value={editForm.heightFt}
                        onChange={(e) => setEditForm({ ...editForm, heightFt: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                        placeholder="Ft"
                      />
                      <input
                        type="number"
                        min={0}
                        max={11}
                        value={editForm.heightIn}
                        onChange={(e) => setEditForm({ ...editForm, heightIn: Math.min(11, Math.max(0, parseInt(e.target.value) || 0)) })}
                        className="px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono"
                        placeholder="In"
                      />
                    </div>
                    <div className="text-center text-[10px] text-retailfix-red-600 font-semibold mt-1">
                      Total: {toTotalInches(editForm.heightFt, editForm.heightIn)}″
                    </div>
                  </div>
                </div>
              </div>

              {/* Shelf & Scaling */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Shelf Configuration
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editForm.variableShelves}
                        onChange={(e) => setEditForm({ ...editForm, variableShelves: e.target.checked })}
                        className="rounded border-slate-300 text-retailfix-red-600 focus:ring-retailfix-red-500"
                      />
                      <span className="text-xs font-semibold text-slate-700">Variable Shelves</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Shelf Count</label>
                      <input
                        type="number"
                        min={1}
                        max={12}
                        value={editForm.shelfCount}
                        onChange={(e) => setEditForm({ ...editForm, shelfCount: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs text-center font-mono bg-white font-bold text-slate-800"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Shelf Spacing</label>
                      <select
                        value={editForm.shelfSpacing}
                        onChange={(e) => setEditForm({ ...editForm, shelfSpacing: e.target.value })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono"
                      >
                        <option value="Auto">Auto</option>
                        <option value="10">10″</option>
                        <option value="12">12″</option>
                        <option value="14">14″</option>
                        <option value="16">16″</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Shelf Thickness</label>
                      <select
                        value={editForm.shelfThickness}
                        onChange={(e) => setEditForm({ ...editForm, shelfThickness: parseFloat(e.target.value) || 1.0 })}
                        className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs bg-white text-center font-mono"
                      >
                        <option value={1.0}>1″</option>
                        <option value={1.25}>1.25″</option>
                        <option value={1.5}>1.5″</option>
                        <option value={2.0}>2″</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Minimum Shelves</label>
                      <input
                        type="number"
                        min={1}
                        max={editForm.maxShelves}
                        value={editForm.minShelves}
                        onChange={(e) => setEditForm({ ...editForm, minShelves: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs text-center font-mono bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Maximum Shelves</label>
                      <input
                        type="number"
                        min={editForm.minShelves}
                        max={16}
                        value={editForm.maxShelves}
                        onChange={(e) => setEditForm({ ...editForm, maxShelves: Math.max(editForm.minShelves, parseInt(e.target.value) || 1) })}
                        className="w-full px-2 py-1 border border-slate-300 rounded text-xs text-center font-mono bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Scaling Mode
                  </div>
                  <select
                    value={editForm.scalingMode}
                    onChange={(e) => setEditForm({ ...editForm, scalingMode: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs bg-white mt-1"
                  >
                    <option value="stretch">Axis Scale (Stretch independent W, D, H)</option>
                    <option value="fit">Uniform Fit (Proportional)</option>
                  </select>

                  {/* Optional Replace GLB file */}
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Replace 3D Model (GLB/GLTF)
                    </label>
                    <input
                      type="file"
                      accept=".glb,.gltf"
                      onChange={(e) => setEditReplaceFile(e.target.files?.[0] || null)}
                      className="text-xs text-slate-500 file:mr-2 file:py-1 file:px-2.5 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-200 file:text-slate-700 hover:file:bg-slate-300"
                    />
                    {editReplaceFile && (
                      <span className="text-[10px] text-emerald-600 font-medium block mt-1">
                        Selected: {editReplaceFile.name} (increments version to v{editProduct.version + 1})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="checkbox"
                  id="edit_rack_active"
                  checked={editForm.active}
                  onChange={(e) => setEditForm({ ...editForm, active: e.target.checked })}
                  className="w-4 h-4 text-retailfix-red-600 rounded border-slate-300 focus:ring-retailfix-red-500"
                />
                <label htmlFor="edit_rack_active" className="text-xs font-semibold text-slate-700 cursor-pointer">
                  Active (appears in CAD Add Rack menu for new placements)
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditProduct(null)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-medium text-xs rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isEditingSaving}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-lg shadow-md shadow-blue-600/20 flex items-center gap-2 transition-all"
                >
                  {isEditingSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Update Rack Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 4. DELETE / ARCHIVE CONFIRMATION MODAL */}
      {/* ========================================================= */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            {isCheckingRefs ? (
              <div className="flex flex-col items-center justify-center py-8 text-slate-500">
                <Loader2 className="w-8 h-8 text-retailfix-red-600 animate-spin mb-3" />
                <p className="text-sm font-medium">Checking CAD project references...</p>
              </div>
            ) : refCheckResult?.referenced ? (
              // REFERENCED PRODUCT: Explain why delete is blocked and offer archive
              <div>
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
                  <ShieldAlert className="w-6 h-6" />
                </div>

                <h3 className="text-base font-bold text-slate-900 text-center mb-1">
                  Cannot Permanently Delete Rack
                </h3>

                <div className="text-center font-semibold text-slate-800 text-sm mb-2">
                  {deleteTarget.productName} ({deleteTarget.sku || deleteTarget.productId})
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 mb-4">
                  <p className="font-semibold mb-1">This rack is used in existing CAD projects.</p>
                  <p className="text-amber-700">
                    Permanent deletion is unavailable to prevent breaking saved CAD layouts.
                    It will be archived instead.
                  </p>
                  {Array.isArray(refCheckResult?.project_codes) && refCheckResult.project_codes.length > 0 && (
                    <div className="mt-2 text-[11px] font-mono text-amber-900 bg-amber-100/70 p-1.5 rounded">
                      Referenced in: {refCheckResult.project_codes.slice(0, 3).join(', ')}
                      {refCheckResult.project_codes.length > 3 && ` +${refCheckResult.project_codes.length - 3} more`}
                    </div>
                  )}
                </div>

                <p className="text-xs text-slate-500 mb-5">
                  Archiving hides this rack from the CAD "Add Rack" menu so salesmen cannot place new instances, but existing saved projects continue to render faithfully.
                </p>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-medium text-xs rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteOrArchive}
                    disabled={isDeleting}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
                    Archive Rack
                  </button>
                </div>
              </div>
            ) : (
              // UNREFERENCED PRODUCT: Confirmation for permanent deletion
              <div>
                <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-6 h-6" />
                </div>

                <h3 className="text-base font-bold text-slate-900 text-center mb-1">
                  Delete Rack?
                </h3>

                <div className="text-center font-semibold text-slate-800 text-sm mb-1">
                  {deleteTarget.productName}
                </div>
                <div className="text-center font-mono text-xs text-slate-500 mb-3">
                  SKU: {deleteTarget.sku || deleteTarget.productId}
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 mb-5 text-center">
                  This rack is not used in any CAD projects.
                  <span className="block text-red-600 font-semibold mt-1">This action cannot be undone.</span>
                </div>

                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(null)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 font-medium text-xs rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteOrArchive}
                    disabled={isDeleting}
                    className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Delete
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 5. 3D GLB INTERACTIVE PREVIEW MODAL */}
      {/* ========================================================= */}
      {previewProduct && (
        <ModelPreviewModal
          product={previewProduct}
          onClose={() => setPreviewProduct(null)}
        />
      )}
    </div>
  );
};
