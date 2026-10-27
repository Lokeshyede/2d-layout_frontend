/**
 * Resolves the backend origin from VITE_API_URL or dynamic current hostname.
 * Automatically adapts between localhost and LAN IPs (e.g. mobile testing on Wi-Fi),
 * preventing connection timeouts when the host Wi-Fi IP changes.
 */
export const getBackendOrigin = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  const isBrowser = typeof window !== 'undefined' && Boolean(window.location?.hostname);
  const browserHost = isBrowser ? window.location.hostname : '127.0.0.1';
  const isBrowserLocal = browserHost === 'localhost' || browserHost === '127.0.0.1';

  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    const trimmed = envUrl.trim().replace(/\/api\/?$/, '').replace(/\/$/, '');
    // Check if configured URL points to localhost or a private LAN IP (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
    const isEnvLocalOrLan = /https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)/i.test(trimmed);

    if (isEnvLocalOrLan && isBrowser) {
      // 1. If currently browsing on localhost/127.0.0.1, always connect to local backend (prevents stale LAN IP timeouts)
      if (isBrowserLocal) {
        return `http://${browserHost}:8001`;
      }
      // 2. If browsing from another device via LAN IP, use the device's accessed hostname
      return `http://${browserHost}:8001`;
    }

    // External/production domain
    return trimmed;
  }

  // Fallback to active browser host on port 8001
  return `http://${browserHost}:8001`;
};

export const API_BASE = `${getBackendOrigin()}/api`;

/**
 * Resolves an asset / upload / model path or URL to an absolute reachable backend URL.
 * Also rewrites any stale localhost:8000 / localhost:8001 URLs to the active backend origin.
 */
export const resolveBackendUrl = (pathOrUrl: string): string => {
  if (!pathOrUrl) return '';
  const backendOrigin = getBackendOrigin();
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    // If it points to localhost, 127.0.0.1, or any LAN IP on port 8000/8001, rewrite to active backendOrigin
    if (/https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):(8000|8001)/.test(pathOrUrl)) {
      return pathOrUrl.replace(/https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+):(8000|8001)/, backendOrigin);
    }
    return pathOrUrl;
  }
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${backendOrigin}${normalizedPath}`;
};

export interface CustomerData {
  customerName: string;
  ownerName?: string;
  mobileNumber: string;
  whatsAppNumber?: string;
  email?: string;
  storeAddress?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface StoreData {
  storeName: string;
  storeType: string;
  storeArea?: string;
  approxWidth?: string;
  approxHeight?: string;
  unit?: string;
  roomShapeMode?: 'AUTO' | 'MANUAL';
}

export interface SurveyData {
  surveyDate: string;
  salesmanName?: string;
  siteContactPerson?: string;
  remarks?: string;
  specialRequirements?: string;
}

export interface CreateSurveyPayload {
  customer: CustomerData;
  store: StoreData;
  survey: SurveyData;
}

export interface SurveyResponseData {
  id: number;
  surveyId: string;
  projectId: string;
  customerId: string;
  secureToken: string;
  status: string;
  customer: CustomerData;
  store: StoreData;
  survey: SurveyData;
  photos: { id: number; photoType: string; fileName: string; filePath: string; createdAt: string }[];
  revision: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDataResponse {
  projectId: string;
  surveyId: string;
  title: string;
  revision: string;
  viewport: { zoom: number; panX: number; panY: number; roomShapeMode?: 'AUTO' | 'MANUAL' };
  scale: string;
  unit: string;
  notes?: string;
  entities: any[];
  versions: { id: number; revisionName: string; createdBy: string; createdAt: string }[];
  customerName?: string;
  storeName?: string;
  storeType?: string;
  approxWidth?: string;
  approxHeight?: string;
  surveyDate?: string;
  updatedAt?: string;
}

export const api = {
  // Survey API
  async createSurvey(payload: CreateSurveyPayload): Promise<SurveyResponseData> {
    const res = await fetch(`${API_BASE}/surveys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create survey' }));
      throw new Error(err.detail || 'Failed to create survey');
    }
    return res.json();
  },

  async getSurvey(surveyId: string, token?: string): Promise<SurveyResponseData> {
    const url = token
      ? `${API_BASE}/surveys/${surveyId}?token=${encodeURIComponent(token)}`
      : `${API_BASE}/surveys/${surveyId}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Survey not found');
    }
    return res.json();
  },

  async uploadPhoto(surveyId: string, file: File, photoType = 'store_photo') {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('photo_type', photoType);
    const res = await fetch(`${API_BASE}/surveys/${surveyId}/photos`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) throw new Error('Photo upload failed');
    return res.json();
  },

  // Project CAD API
  async getProject(projectId: string, token?: string): Promise<ProjectDataResponse> {
    const url = token
      ? `${API_BASE}/projects/${projectId}?token=${encodeURIComponent(token)}`
      : `${API_BASE}/projects/${projectId}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error('Project layout not found');
    }
    return res.json();
  },

  async saveProject(projectId: string, payload: any, token?: string): Promise<ProjectDataResponse> {
    const url = token
      ? `${API_BASE}/projects/${projectId}?token=${encodeURIComponent(token)}`
      : `${API_BASE}/projects/${projectId}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to save project' }));
      throw new Error(err.detail || 'Failed to save project');
    }
    return res.json();
  },

  getExportPdfUrl(projectId: string): string {
    return `${API_BASE}/projects/${projectId}/export/pdf`;
  },

  // Admin Auth & Management
  async adminLogin(username: string, password: string): Promise<{ access_token: string; user: any }> {
    const res = await fetch(`${API_BASE}/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Invalid admin credentials' }));
      throw new Error(err.detail || 'Invalid admin credentials');
    }
    return res.json();
  },

  async getAdminDashboard(token: string) {
    const res = await fetch(`${API_BASE}/admin/dashboard`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Unauthorized');
    return res.json();
  },

  async getAdminSurveys(token: string, params: { search?: string; store_type?: string; status?: string; page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.store_type && params.store_type !== 'All') query.append('store_type', params.store_type);
    if (params.status && params.status !== 'All') query.append('status', params.status);
    if (params.page) query.append('page', params.page.toString());
    if (params.limit) query.append('limit', params.limit.toString());

    const res = await fetch(`${API_BASE}/admin/surveys?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to fetch surveys');
    return res.json();
  },

  async deleteSurvey(token: string, surveyId: string) {
    const res = await fetch(`${API_BASE}/admin/surveys/${surveyId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to delete survey');
    return res.json();
  },

  // 3D Product Model Library APIs
  async getProducts(params?: { search?: string; category?: string; include_inactive?: boolean }): Promise<{ items: Product3DModelData[]; total: number }> {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.category && params.category !== 'All') query.append('category', params.category);
    if (params?.include_inactive) query.append('include_inactive', 'true');

    const res = await fetch(`${API_BASE}/products?${query.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch products');
    const data = await res.json();
    return {
      items: Array.isArray(data?.items) ? data.items.map(normalizeProductModel) : [],
      total: data?.total ?? 0
    };
  },

  async getProduct(idOrCode: string): Promise<Product3DModelData> {
    const res = await fetch(`${API_BASE}/products/${idOrCode}`);
    if (!res.ok) throw new Error('Product not found');
    const data = await res.json();
    return normalizeProductModel(data);
  },

  async uploadProductGLB(token: string, file: File): Promise<GLBUploadResult> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/admin/products/upload-glb`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to upload GLB' }));
      throw new Error(err.detail || 'Failed to upload GLB');
    }
    return res.json();
  },

  async createProduct(token: string, data: any): Promise<Product3DModelData> {
    const res = await fetch(`${API_BASE}/admin/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create product' }));
      throw new Error(err.detail || 'Failed to create product');
    }
    return normalizeProductModel(await res.json());
  },

  async updateProduct(token: string, id: number, data: any): Promise<Product3DModelData> {
    const res = await fetch(`${API_BASE}/admin/products/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update product' }));
      throw new Error(err.detail || 'Failed to update product');
    }
    return normalizeProductModel(await res.json());
  },

  async replaceProductGLB(token: string, id: number, file: File): Promise<Product3DModelData> {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`${API_BASE}/admin/products/${id}/replace-glb`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to replace GLB' }));
      throw new Error(err.detail || 'Failed to replace GLB');
    }
    return normalizeProductModel(await res.json());
  },

  async toggleProductActive(token: string, id: number): Promise<Product3DModelData> {
    const res = await fetch(`${API_BASE}/admin/products/${id}/toggle-active`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to toggle product status');
    return normalizeProductModel(await res.json());
  },

  async checkProductReferences(token: string, id: number): Promise<ProductReferenceCheckResult> {
    const res = await fetch(`${API_BASE}/admin/products/${id}/reference-check`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to check product references');
    return res.json();
  },

  async archiveProduct(token: string, id: number): Promise<Product3DModelData> {
    const res = await fetch(`${API_BASE}/admin/products/${id}/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to archive product');
    return normalizeProductModel(await res.json());
  },

  async deleteProduct(token: string, id: number): Promise<{ success: boolean; message: string; archived?: boolean; permanent?: boolean }> {
    const res = await fetch(`${API_BASE}/admin/products/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to delete product' }));
      throw new Error(err.detail || 'Failed to delete product');
    }
    return res.json();
  },

  // Share API
  async getShareConfig(projectId: string): Promise<ShareConfigData> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/share`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch share settings' }));
      throw new Error(err.detail || 'Failed to fetch share settings');
    }
    return res.json();
  },

  async updateShareConfig(projectId: string, payload: ShareConfigUpdatePayload): Promise<ShareConfigData> {
    const res = await fetch(`${API_BASE}/projects/${projectId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update share settings' }));
      throw new Error(err.detail || 'Failed to update share settings');
    }
    return res.json();
  },

  async getCustomerPresentation(token: string): Promise<CustomerPresentationData> {
    const res = await fetch(`${API_BASE}/share/${encodeURIComponent(token)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Project Unavailable' }));
      throw new Error(err.detail || 'Project Unavailable: This customer project link is no longer active.');
    }
    const data = await res.json();
    return {
      ...data,
      products: (data.products || []).map(normalizeProductModel),
    };
  },

  getCustomerPdfUrl(token: string): string {
    return `${API_BASE}/share/${encodeURIComponent(token)}/pdf`;
  },
};

export interface ShareConfigData {
  shareToken: string;
  shareUrl: string;
  isEnabled: boolean;
  expiresAt?: string | null;
  viewCount: number;
  lastViewedAt?: string | null;
  allowPdfDownload: boolean;
  allowPngDownload: boolean;
  allowVideoDownload: boolean;
}

export interface ShareConfigUpdatePayload {
  isEnabled?: boolean;
  expiresAt?: string | null;
  regenerateToken?: boolean;
  allowPdfDownload?: boolean;
  allowPngDownload?: boolean;
  allowVideoDownload?: boolean;
}

export interface RackBreakdownItem {
  name: string;
  rackType: string;
  dimensions: string;
  count: number;
}

export interface CustomerProjectSummary {
  totalRacks: number;
  wallRacks: number;
  centerRacks: number;
  endcaps: number;
  cornerRacks: number;
  columns: number;
  doors: number;
  windows: number;
  roomSize?: string | null;
}

export interface CustomerPresentationData {
  storeName: string;
  customerName: string;
  storeType?: string | null;
  location?: string | null;
  projectTitle: string;
  revision: string;
  status: string;
  unit: string;
  scale: string;
  viewport: { zoom: number; panX: number; panY: number };
  entities: any[];
  summary: CustomerProjectSummary;
  rackBreakdown: RackBreakdownItem[];
  products: Product3DModelData[];
  allowPdfDownload: boolean;
  allowPngDownload: boolean;
  allowVideoDownload: boolean;
}

export interface ProductReferenceCheckResult {
  product_id: number;
  product_code: string;
  product_name: string;
  referenced: boolean;
  reference_count: number;
  project_codes: string[];
  can_delete: boolean;
  message: string;
}

export interface ProductModelMetadata {
  localWidthAxis?: 'X' | 'Y' | 'Z';
  localHeightAxis?: 'X' | 'Y' | 'Z';
  localDepthAxis?: 'X' | 'Y' | 'Z';
  correctionRotation?: { x: number; y: number; z: number };
  supportsParametricShelves?: boolean;
  shelfCount?: number;
  detected_dimensions?: any;
  [key: string]: any;
}

export interface Product3DModelData {
  id: number;
  productId: string;
  productName: string;
  productType: string;
  sku?: string;
  category?: string;
  width: number;
  height: number;
  depth: number;
  glbUrl: string;
  storagePath: string;
  thumbnailUrl?: string;
  scalingMode?: string;
  shelfCount?: number;
  minShelves?: number;
  maxShelves?: number;
  shelfMode?: 'AUTO_SPACING' | 'FIXED_SPACING' | 'FIXED_COUNT';
  shelfThickness?: number;
  version: number;
  active: boolean;
  metadataJson?: string;
  metadata?: ProductModelMetadata;
  createdAt?: string;
  updatedAt?: string;
}

export interface GLBUploadResult {
  storage_path: string;
  glb_url: string;
  file_name: string;
  file_size: number;
  detected_dimensions: {
    width_inches: number;
    height_inches: number;
    depth_inches: number;
    width_mm: number;
    height_mm: number;
    depth_mm: number;
  };
  mesh_count: number;
  materials: string[];
  valid: boolean;
  message: string;
}

function normalizeProductModel(raw: any): Product3DModelData {
  let parsedMetadata: ProductModelMetadata = {};
  const metaRaw = raw.metadata_json || raw.metadataJson;
  if (metaRaw) {
    try {
      parsedMetadata = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw;
    } catch {}
  }

  return {
    id: raw.id,
    productId: raw.product_id || raw.productId,
    productName: raw.product_name || raw.productName,
    productType: raw.product_type || raw.productType,
    sku: raw.sku,
    category: raw.category,
    width: raw.width,
    height: raw.height,
    depth: raw.depth,
    glbUrl: resolveBackendUrl(raw.glb_url || raw.glbUrl),
    storagePath: raw.storage_path || raw.storagePath,
    thumbnailUrl: resolveBackendUrl(raw.thumbnail_url || raw.thumbnailUrl),
    scalingMode: raw.scaling_mode || raw.scalingMode || 'stretch',
    shelfCount: raw.shelf_count ?? raw.shelfCount ?? 5,
    minShelves: raw.min_shelves ?? raw.minShelves ?? 1,
    maxShelves: raw.max_shelves ?? raw.maxShelves ?? 10,
    shelfMode: raw.shelf_mode ?? raw.shelfMode ?? 'AUTO_SPACING',
    shelfThickness: raw.shelf_thickness ?? raw.shelfThickness ?? 1.0,
    version: raw.version ?? 1,
    active: raw.active ?? true,
    metadataJson: typeof metaRaw === 'string' ? metaRaw : (metaRaw ? JSON.stringify(metaRaw) : undefined),
    metadata: parsedMetadata,
    createdAt: raw.created_at || raw.createdAt,
    updatedAt: raw.updated_at || raw.updatedAt,
  };
}

