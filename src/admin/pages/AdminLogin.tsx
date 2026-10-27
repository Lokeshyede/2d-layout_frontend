import React, { useState } from 'react';
import { api } from '../../services/api';
import { Shield, Lock, User, ArrowRight, AlertCircle } from 'lucide-react';

interface AdminLoginProps {
  onLoginSuccess: (token: string, user: any) => void;
  onCancel: () => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onLoginSuccess, onCancel }) => {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('retailfix@2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.adminLogin(username.trim(), password);
      localStorage.setItem('retailfix_admin_token', res.access_token);
      localStorage.setItem('retailfix_admin_user', JSON.stringify(res.user));
      onLoginSuccess(res.access_token, res.user);
    } catch (err: any) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-retailfix-dark-950 p-6 text-center text-white space-y-2">
          <div className="w-12 h-12 rounded-xl bg-retailfix-red-600 flex items-center justify-center mx-auto shadow-lg shadow-red-900/30">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-xl font-extrabold tracking-tight">RetailFix Admin Portal</h2>
          <p className="text-xs text-slate-400">Restricted administrative access for survey and CAD layout management.</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-5">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded-r-md flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-slate-400" />
              Admin Username
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 text-sm font-medium text-slate-900"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-retailfix-red-500 text-sm font-medium text-slate-900"
            />
          </div>

          <div className="pt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="w-1/3 py-2.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold text-xs transition-colors"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading}
              className="w-2/3 bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white font-bold py-2.5 rounded-lg shadow-md shadow-red-900/20 text-xs flex items-center justify-center gap-1.5 transition-all hover:scale-[1.02]"
            >
              {loading ? 'Authenticating...' : 'Sign In as Admin'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400">
              Default Credentials: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">admin</code> / <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">retailfix@2026</code>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
