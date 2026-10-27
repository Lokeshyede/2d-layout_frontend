import React, { useEffect, useState } from 'react';
import { api, type ShareConfigData } from '../../services/api';
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  Shield,
  Eye,
  Calendar,
  RefreshCw,
  Power,
  X,
  Loader2,
} from 'lucide-react';

interface ShareModalProps {
  projectId: string;
  storeName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  projectId,
  storeName = 'Retail Store',
  isOpen,
  onClose,
}) => {
  const [config, setConfig] = useState<ShareConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    loadShareConfig();
  }, [isOpen, projectId]);

  const loadShareConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getShareConfig(projectId);
      setConfig(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load share settings');
    } finally {
      setLoading(false);
    }
  };

  const getFullShareUrl = (relativeUrl: string) => {
    return `${window.location.origin}${relativeUrl}`;
  };

  const handleCopyLink = () => {
    if (!config) return;
    const fullUrl = getFullShareUrl(config.shareUrl);
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleToggleEnabled = async () => {
    if (!config) return;
    try {
      setUpdating(true);
      const updated = await api.updateShareConfig(projectId, {
        isEnabled: !config.isEnabled,
      });
      setConfig(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to update share status');
    } finally {
      setUpdating(false);
    }
  };

  const handleRegenerateToken = async () => {
    if (!config) return;
    if (!window.confirm('Regenerating will revoke the previous link immediately. Proceed?')) {
      return;
    }
    try {
      setUpdating(true);
      const updated = await api.updateShareConfig(projectId, {
        regenerateToken: true,
      });
      setConfig(updated);
    } catch (err: any) {
      setError(err.message || 'Failed to regenerate link');
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenPreview = () => {
    if (!config) return;
    window.open(config.shareUrl, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden font-sans">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-red-50 text-red-600 rounded-xl">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">Customer Share System</h3>
              <p className="text-xs text-slate-500">Read-only interactive presentation for {storeName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
              <Loader2 className="w-7 h-7 animate-spin text-red-600" />
              <span className="text-xs font-medium">Loading secure share configuration...</span>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          ) : config ? (
            <>
              {/* Sharing Status Card */}
              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      config.isEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      Sharing: {config.isEnabled ? 'Enabled' : 'Disabled'}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {config.isEnabled
                        ? 'Customer link is active and accessible'
                        : 'Customer link is inactive (shows Project Unavailable)'}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleToggleEnabled}
                  disabled={updating}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    config.isEnabled
                      ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  {config.isEnabled ? 'Disable Sharing' : 'Enable Sharing'}
                </button>
              </div>

              {/* Customer Link Box */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Customer Presentation Link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={getFullShareUrl(config.shareUrl)}
                    className="flex-1 bg-slate-100 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 py-2.5 font-mono select-all focus:outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    disabled={!config.isEnabled}
                    className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-red-600 hover:bg-red-700 text-white disabled:opacity-50'
                    }`}
                  >
                    {copied ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Link
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={handleOpenPreview}
                  disabled={!config.isEnabled}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Preview as Customer
                </button>

                <button
                  onClick={handleRegenerateToken}
                  disabled={updating}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-all"
                  title="Generate a new token (revoking the old one)"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
                  Regenerate Link
                </button>
              </div>

              {/* Security & Access Stats */}
              <div className="pt-2 border-t border-slate-100 space-y-2 text-xs text-slate-500">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    Customer Views:
                  </span>
                  <span className="font-semibold text-slate-800">{config.viewCount}</span>
                </div>
                {config.lastViewedAt && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      Last Viewed:
                    </span>
                    <span className="text-slate-700">
                      {new Date(config.lastViewedAt).toLocaleDateString()} at{' '}
                      {new Date(config.lastViewedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 pt-1">
                  <Shield className="w-3.5 h-3.5 text-emerald-500" />
                  <span>256-bit cryptographically secure token. CAD is 100% read-only.</span>
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
