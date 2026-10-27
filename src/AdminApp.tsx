import { useState, useEffect } from 'react';
import { AdminLogin } from './admin/pages/AdminLogin';
import { AdminDashboard } from './admin/pages/AdminDashboard';
import { ProductModelsPage } from './admin/pages/ProductModelsPage';
import { AdminLayout } from './admin/layouts/AdminLayout';
import { CADEditor } from './components/CAD/CADEditor';

export function AdminApp() {
  const [currentRoute, setCurrentRoute] = useState<'login' | 'dashboard' | 'models' | 'designer'>('login');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  
  const [adminToken, setAdminToken] = useState<string | null>(() => localStorage.getItem('retailfix_admin_token'));
  const [adminUser, setAdminUser] = useState<any | null>(() => {
    const saved = localStorage.getItem('retailfix_admin_user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    const path = window.location.pathname;
    if (!adminToken) {
      if (path !== '/admin/login') {
        window.history.replaceState({}, '', '/admin/login');
      }
      setCurrentRoute('login');
    } else {
      if (path.startsWith('/admin/cad/')) {
        const id = path.split('/admin/cad/')[1];
        if (id) {
          setActiveProjectId(id);
          setCurrentRoute('designer');
        } else {
          window.history.replaceState({}, '', '/admin/dashboard');
          setCurrentRoute('dashboard');
        }
      } else if (path === '/admin/models') {
        setCurrentRoute('models');
      } else if (path === '/admin/login' || path === '/admin') {
        window.history.replaceState({}, '', '/admin/dashboard');
        setCurrentRoute('dashboard');
      } else {
        setCurrentRoute('dashboard');
      }
    }
  }, [adminToken]);

  // Listen for popstate events from the browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      if (!adminToken) {
        setCurrentRoute('login');
        return;
      }
      if (path.startsWith('/admin/cad/')) {
        const id = path.split('/admin/cad/')[1];
        setActiveProjectId(id || null);
        setCurrentRoute(id ? 'designer' : 'dashboard');
      } else if (path === '/admin/models') {
        setCurrentRoute('models');
      } else {
        setCurrentRoute('dashboard');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [adminToken]);

  const handleAdminLoginSuccess = (token: string, user: any) => {
    localStorage.setItem('retailfix_admin_token', token);
    localStorage.setItem('retailfix_admin_user', JSON.stringify(user));
    setAdminToken(token);
    setAdminUser(user);
    setCurrentRoute('dashboard');
    window.history.pushState({}, '', '/admin/dashboard');
  };

  const handleAdminLogout = () => {
    localStorage.removeItem('retailfix_admin_token');
    localStorage.removeItem('retailfix_admin_user');
    setAdminToken(null);
    setAdminUser(null);
    setCurrentRoute('login');
    window.history.pushState({}, '', '/admin/login');
  };

  const handleOpenCAD = (projectId: string) => {
    setActiveProjectId(projectId);
    setCurrentRoute('designer');
    window.history.pushState({}, '', `/admin/cad/${projectId}`);
  };

  const handleExitCAD = () => {
    setCurrentRoute('dashboard');
    window.history.pushState({}, '', '/admin/dashboard');
  };

  if (currentRoute === 'login') {
    return (
      <AdminLogin
        onLoginSuccess={handleAdminLoginSuccess}
        onCancel={() => {
          // If they cancel admin login, send them back to the public site
          window.location.href = '/';
        }}
      />
    );
  }

  if (currentRoute === 'designer' && activeProjectId) {
    // Admin uses CAD editor with isAdmin=true
    return (
      <CADEditor
        projectId={activeProjectId}
        isAdmin={true}
        onExit={handleExitCAD}
      />
    );
  }

  return (
    <AdminLayout onLogout={handleAdminLogout} adminUser={adminUser} currentRoute={currentRoute}>
      {currentRoute === 'dashboard' && (
        <AdminDashboard
          token={adminToken!}
          onOpenLayout={handleOpenCAD}
          onLogout={handleAdminLogout}
        />
      )}
      {currentRoute === 'models' && (
        <ProductModelsPage
          token={adminToken!}
        />
      )}
    </AdminLayout>
  );
}
