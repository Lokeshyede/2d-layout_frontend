import { useState } from 'react';
import { LucideLayoutDashboard, LucideLogOut, Box, Menu, X } from 'lucide-react';

interface AdminLayoutProps {
  children: React.ReactNode;
  onLogout: () => void;
  adminUser: any;
  currentRoute?: 'dashboard' | 'models' | 'login' | 'designer';
}

export function AdminLayout({ children, onLogout, adminUser, currentRoute = 'dashboard' }: AdminLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    {
      href: '/admin/dashboard',
      label: 'Dashboard',
      route: 'dashboard',
      icon: LucideLayoutDashboard,
    },
    {
      href: '/admin/models',
      label: '3D Product Models',
      route: 'models',
      icon: Box,
    },
  ];

  const navigate = (href: string) => {
    window.history.pushState({}, '', href);
    window.dispatchEvent(new Event('popstate'));
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex font-sans">
      {/* ── Mobile overlay backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-200 ease-in-out
          w-64
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:relative lg:translate-x-0 lg:shrink-0
        `}
      >
        {/* Logo + close button */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <h1 className="text-xl font-bold text-white tracking-wider">
            RETAILFIX <span className="text-retailfix-red-500">ADMIN</span>
          </h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = currentRoute === item.route;
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => { e.preventDefault(); navigate(item.href); }}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors font-medium text-sm ${
                  active
                    ? 'bg-retailfix-red-600/15 text-retailfix-red-400 font-semibold'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </a>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="px-4 py-3 mb-2">
            <p className="text-sm font-medium text-white">{adminUser?.username || 'Admin'}</p>
            <p className="text-xs text-slate-500 truncate">{adminUser?.email}</p>
          </div>
          <button
            onClick={onLogout}
            className="flex w-full items-center gap-3 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LucideLogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-slate-200 h-14 flex items-center px-4 sm:px-6 shadow-sm gap-3">
          {/* Hamburger — visible only on <lg */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-semibold text-slate-800">Admin Portal</h2>
        </header>
        <div className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
