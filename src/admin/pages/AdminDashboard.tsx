import React, { useState, useEffect } from 'react';
import { api, resolveBackendUrl } from '../../services/api';
import {
  Search,
  Layout,
  Download,
  Trash2,
  Eye,
  RefreshCw,
  X,
  Share2,
} from 'lucide-react';
import { ShareModal } from '../../components/CAD/ShareModal';

interface AdminDashboardProps {
  token: string;
  onOpenLayout: (projectId: string) => void;
  onLogout: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ token, onOpenLayout, onLogout }) => {
  const [stats, setStats] = useState<any>(null);
  const [surveys, setSurveys] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStoreType, setSelectedStoreType] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [page, setPage] = useState(1);

  // Detail Modal State
  const [activeSurveyDetail, setActiveSurveyDetail] = useState<any | null>(null);
  const [selectedShareProject, setSelectedShareProject] = useState<{ id: string; name: string } | null>(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const statsRes = await api.getAdminDashboard(token);
      setStats(statsRes);

      const surveysRes = await api.getAdminSurveys(token, {
        search: searchTerm,
        store_type: selectedStoreType,
        status: selectedStatus,
        page,
        limit: 15,
      });

      setSurveys(surveysRes.items || []);
    } catch (err: any) {
      console.error('Failed to fetch admin data:', err);
      setFetchError(err.message || 'Unable to connect to backend server');
      if (err.message === 'Unauthorized' || err.message?.includes('401') || err.status === 401) {
        onLogout?.();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [searchTerm, selectedStoreType, selectedStatus, page]);

  const handleDeleteSurvey = async (surveyId: string) => {
    if (!window.confirm(`Are you sure you want to delete Survey ${surveyId}? This action cannot be undone.`)) {
      return;
    }
    try {
      await api.deleteSurvey(token, surveyId);
      fetchDashboardData();
    } catch (err: any) {
      alert(`Failed to delete survey: ${err.message}`);
    }
  };

  const handleOpenDetailModal = async (surveyId: string) => {
    try {
      const detail = await api.getSurvey(surveyId);
      setActiveSurveyDetail(detail);
    } catch (err) {
      alert('Failed to load survey details');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-retailfix-red-100 text-retailfix-red-700 border border-retailfix-red-200 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full">
              Admin Portal
            </span>
            <span className="text-xs text-slate-500 font-mono">Live Management</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">Survey & CAD Layout Dashboard</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboardData}
            className="p-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg shadow-sm flex items-center gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Surveys</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono">{stats.totalSurveys}</p>
            <p className="text-[11px] text-slate-400">All registered survey records</p>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today's Surveys</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-retailfix-red-600 font-mono">{stats.todaySurveys}</p>
            <p className="text-[11px] text-slate-400">Submitted today</p>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Layouts Completed</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-emerald-600 font-mono">{stats.completedLayouts}</p>
            <p className="text-[11px] text-slate-400">Ready for fixture quotation</p>
          </div>

          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Draft / In-Progress</span>
            <p className="text-2xl sm:text-3xl font-extrabold text-amber-600 font-mono">{stats.draftLayouts}</p>
            <p className="text-[11px] text-slate-400">Under CAD drafting</p>
          </div>
        </div>
      )}

      {/* Surveys Management Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Search & Filter Toolbar */}
          <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row flex-wrap gap-3 items-start sm:items-center justify-between bg-slate-50/50">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search Customer, Phone, Survey ID, City..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 bg-white text-xs text-slate-900 focus:ring-2 focus:ring-retailfix-red-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <select
              value={selectedStoreType}
              onChange={(e) => {
                setSelectedStoreType(e.target.value);
                setPage(1);
              }}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-700 font-medium"
            >
              <option value="All">All Store Types</option>
              <option value="Supermarket">Supermarket</option>
              <option value="Grocery Store">Grocery Store</option>
              <option value="Garment Store">Garment Store</option>
              <option value="Pharmacy">Pharmacy</option>
              <option value="Electronics">Electronics</option>
              <option value="Other">Other</option>
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-700 font-medium"
            >
              <option value="All">All Statuses</option>
              <option value="survey_completed">Survey Completed</option>
              <option value="layout_in_progress">Layout In Progress</option>
              <option value="layout_completed">Layout Completed</option>
            </select>
          </div>
        </div>

        {/* Surveys Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[700px]">
            <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Survey ID</th>
                <th className="py-3 px-4">Customer & Store</th>
                <th className="py-3 px-4">Contact</th>
                <th className="py-3 px-4">Store Type</th>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    Loading surveys...
                  </td>
                </tr>
              ) : fetchError ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-red-500">
                    <div className="flex flex-col items-center gap-2">
                      <span className="font-semibold text-xs">Failed to load surveys from server:</span>
                      <span className="text-xs text-slate-500 font-mono">{fetchError}</span>
                      <button
                        onClick={fetchDashboardData}
                        className="mt-1 px-3 py-1 bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white rounded text-xs font-semibold"
                      >
                        Retry
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (surveys || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400">
                    No surveys found matching your query.
                  </td>
                </tr>
              ) : (
                (surveys || []).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-retailfix-red-600">
                      {s.surveyId}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{s.customerName}</div>
                      <div className="text-[11px] text-slate-500">{s.storeName}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      <div>{s.mobileNumber}</div>
                      <div className="text-[11px] text-slate-400">{s.city || '-'}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-medium text-[11px]">
                        {s.storeType}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600">
                      {s.surveyDate}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          s.status === 'layout_completed'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {s.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1">
                      <button
                        onClick={() => handleOpenDetailModal(s.surveyId)}
                        title="View Full Survey Details"
                        className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors inline-flex items-center"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onOpenLayout(s.projectId)}
                        title="Open in CAD Layout Editor"
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-black text-white font-bold rounded-lg transition-colors inline-flex items-center gap-1"
                      >
                        <Layout className="w-3 h-3 text-retailfix-red-400" />
                        CAD
                      </button>

                      <button
                        onClick={() => setSelectedShareProject({ id: s.projectId, name: s.customer.customerName })}
                        title="Customer Share System"
                        className="p-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg transition-colors inline-flex items-center"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      <a
                        href={api.getExportPdfUrl(s.projectId)}
                        target="_blank"
                        rel="noreferrer"
                        title="Download ReportLab PDF"
                        className="p-1.5 bg-red-50 hover:bg-red-100 text-retailfix-red-600 rounded-lg transition-colors inline-flex items-center"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>

                      <button
                        onClick={() => handleDeleteSurvey(s.surveyId)}
                        title="Delete Survey"
                        className="p-1.5 bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-600 rounded-lg transition-colors inline-flex items-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Survey Detail Modal */}
      {activeSurveyDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="space-y-1">
                <span className="text-[10px] font-mono text-retailfix-red-600 font-bold bg-red-50 px-2 py-0.5 rounded">
                  {activeSurveyDetail.surveyId}
                </span>
                <h2 className="text-xl font-extrabold text-slate-900">{activeSurveyDetail.customer.customerName}</h2>
              </div>
              <button
                onClick={() => setActiveSurveyDetail(null)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Customer Contact</span>
                <p><strong>Owner:</strong> {activeSurveyDetail.customer.ownerName || '-'}</p>
                <p><strong>Mobile:</strong> {activeSurveyDetail.customer.mobileNumber}</p>
                <p><strong>Email:</strong> {activeSurveyDetail.customer.email || '-'}</p>
                <p><strong>City/State:</strong> {activeSurveyDetail.customer.city}, {activeSurveyDetail.customer.state} ({activeSurveyDetail.customer.pincode})</p>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1">
                <span className="text-slate-400 font-semibold block text-[10px] uppercase">Store Specifications</span>
                <p><strong>Store Name:</strong> {activeSurveyDetail.store.storeName}</p>
                <p><strong>Store Type:</strong> {activeSurveyDetail.store.storeType}</p>
                <p><strong>Dimensions:</strong> {activeSurveyDetail.store.approxWidth} × {activeSurveyDetail.store.approxHeight}</p>
                <p><strong>Area:</strong> {activeSurveyDetail.store.storeArea || '-'}</p>
              </div>
            </div>

            {/* Survey Notes */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-2">
              <span className="text-slate-400 font-semibold block text-[10px] uppercase">Surveyor Remarks & Special Requirements</span>
              <p><strong>Remarks:</strong> {activeSurveyDetail.survey.remarks || 'None'}</p>
              <p><strong>Requirements:</strong> {activeSurveyDetail.survey.specialRequirements || 'None'}</p>
            </div>

            {/* Uploaded Photos */}
            {activeSurveyDetail.photos && activeSurveyDetail.photos.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 uppercase">Uploaded Site Photos</span>
                <div className="grid grid-cols-2 gap-3">
                  {activeSurveyDetail.photos.map((p: any) => (
                    <div key={p.id} className="border border-slate-200 rounded-lg p-2 bg-slate-50">
                      <img src={resolveBackendUrl(p.filePath)} alt={p.fileName} className="w-full h-32 object-cover rounded" />
                      <p className="text-[10px] text-slate-500 mt-1 truncate">{p.fileName}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2">
              <a
                href={api.getExportPdfUrl(activeSurveyDetail.projectId)}
                target="_blank"
                rel="noreferrer"
                className="bg-red-50 hover:bg-red-100 text-retailfix-red-600 font-bold px-4 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" /> Download PDF Drawing Sheet
              </a>

              <button
                onClick={() => {
                  setActiveSurveyDetail(null);
                  onOpenLayout(activeSurveyDetail.projectId);
                }}
                className="bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white font-bold px-5 py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 shadow-md shadow-red-900/30"
              >
                <Layout className="w-4 h-4" /> Open in CAD Designer
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedShareProject && (
        <ShareModal
          projectId={selectedShareProject.id}
          storeName={selectedShareProject.name}
          isOpen={Boolean(selectedShareProject)}
          onClose={() => setSelectedShareProject(null)}
        />
      )}
    </div>
  );
};
