import { api, type Product3DModelData } from '../../services/api';

type RegistryListener = () => void;

class ProductModelRegistryService {
  private products: Map<string, Product3DModelData> = new Map();
  private isLoaded: boolean = false;
  private isLoading: boolean = false;
  private loadError: string | null = null;
  private loadPromise: Promise<void> | null = null;
  private listeners: Set<RegistryListener> = new Set();

  constructor() {
    // Initial fetch from backend Admin Product Model database (no hardcoded fallbacks)
    this.loadProducts().catch((err) => {
      console.warn('[ProductModelRegistry] Initial load deferred:', err);
    });
  }

  public subscribe(listener: RegistryListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (e) {
        console.error('[ProductModelRegistry] Listener error:', e);
      }
    }
  }

  public getIsLoading(): boolean {
    return this.isLoading;
  }

  public getIsLoaded(): boolean {
    return this.isLoaded;
  }

  public getLoadError(): string | null {
    return this.loadError;
  }

  /**
   * Fetches the complete product catalog from the Admin database.
   * If the API fails, sets loadError and clears products — NEVER injects hardcoded fallbacks.
   */
  public async loadProducts(force: boolean = false): Promise<void> {
    if (this.isLoaded && !force && !this.loadError) return;
    if (this.loadPromise && !force) return this.loadPromise;

    this.isLoading = true;
    this.loadError = null;

    this.loadPromise = (async () => {
      try {
        const response = await api.getProducts({ include_inactive: true });
        this.products.clear();
        if (response.items && Array.isArray(response.items)) {
          for (const item of response.items) {
            if (item.productId) this.products.set(item.productId, item);
            this.products.set(String(item.id), item);
            if (item.sku) this.products.set(item.sku, item);
          }
        }
        this.isLoaded = true;
        this.loadError = null;
      } catch (err: any) {
        console.error('[ProductModelRegistry] Failed to fetch product models from Admin DB:', err);
        this.products.clear();
        this.isLoaded = false;
        this.loadError = err.message || 'Unable to load rack products.';
      } finally {
        this.isLoading = false;
        this.loadPromise = null;
        this.notify();
      }
    })();

    return this.loadPromise;
  }

  public get(idOrCode: string): Product3DModelData | undefined {
    return this.products.get(idOrCode);
  }

  public getAll(): Product3DModelData[] {
    const seen = new Set<string>();
    const list: Product3DModelData[] = [];
    for (const p of this.products.values()) {
      if (p && p.productId && !seen.has(p.productId)) {
        seen.add(p.productId);
        list.push(p);
      }
    }
    return list;
  }

  /**
   * Returns only active products available for new rack creation.
   */
  public getActive(): Product3DModelData[] {
    return this.getAll().filter((p) => p.active);
  }

  /**
   * Normalizes a rackType string into one of the 5 canonical product categories:
   * 'wall_rack' | 'center_rack' | 'endcap' | 'corner_rack' | 'custom_rack' | undefined
   */
  public normalizeCategory(rackType?: string): 'wall_rack' | 'center_rack' | 'endcap' | 'corner_rack' | 'custom_rack' | undefined {
    if (!rackType) return undefined;
    const lower = rackType.toLowerCase().trim();
    if (lower.includes('endcap') || lower.includes('end cap')) return 'endcap';
    if (lower.includes('corner')) return 'corner_rack';
    if (lower.includes('center') || lower.includes('gondola')) return 'center_rack';
    if (lower.includes('wall')) return 'wall_rack';
    if (lower.includes('custom')) return 'custom_rack';
    return undefined;
  }

  /**
   * Resolves a product model given a productId or fallback rackType string.
   * Resolution priority:
   * 1. Exact match on productModelId (active or archived)
   * 2. Canonical active product matching rackType / category (strict, no cross-category substitution)
   * 3. Otherwise undefined
   */
  public resolve(productModelId?: string, fallbackRackType?: string): Product3DModelData | undefined {
    // 1. Direct match on productModelId (active or archived)
    if (productModelId) {
      if (this.products.has(productModelId)) {
        return this.products.get(productModelId);
      }
      const all = this.getAll();
      const bySkuOrId = all.find(
        (p) => p.sku === productModelId || p.productId === productModelId || String(p.id) === productModelId
      );
      if (bySkuOrId) return bySkuOrId;
    }

    // 2. Strict category resolution from active products if fallbackRackType is provided
    if (fallbackRackType) {
      const targetCategory = this.normalizeCategory(fallbackRackType);
      if (!targetCategory) return undefined;

      const activeProducts = this.getActive();

      const lowerFallback = fallbackRackType.toLowerCase();
      const wants7x4 = lowerFallback.includes('7x4') || lowerFallback.includes('7 x 4');
      const wants7x3 = lowerFallback.includes('7x3') || lowerFallback.includes('7 x 3');

      // Filter products strictly belonging to the target category
      const matchingProducts = activeProducts.filter((p) => {
        const prodCat =
          this.normalizeCategory(p.productType) ||
          this.normalizeCategory(p.category) ||
          this.normalizeCategory(p.productName);
        return prodCat === targetCategory;
      });

      if (matchingProducts.length === 0) {
        return undefined;
      }

      // If specific dimension requested, prioritize dimension match
      if (targetCategory === 'wall_rack') {
        if (wants7x4) {
          const m7x4 = matchingProducts.find((p) => p.width >= 46 && p.width <= 50);
          if (m7x4) return m7x4;
        }
        if (wants7x3) {
          const m7x3 = matchingProducts.find((p) => p.width >= 34 && p.width <= 38);
          if (m7x3) return m7x3;
        }
      }

      // Return default active product for this category
      return matchingProducts[0];
    }

    return undefined;
  }
}

export const ProductModelRegistry = new ProductModelRegistryService();
