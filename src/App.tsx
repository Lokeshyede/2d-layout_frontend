import { useState, useEffect } from 'react';
import { AdminApp } from './AdminApp';
import { PublicApp } from './PublicApp';
import { DevProductPreview } from './dev/DevProductPreview';
import { DevResponsiveCADPreview } from './dev/DevResponsiveCADPreview';

export function App() {
  const [currentPath, setCurrentPath] = useState(() => window.location.pathname);
  const [isAdminRoute, setIsAdminRoute] = useState(() => 
    window.location.pathname.startsWith('/admin') || window.location.search.includes('view=admin')
  );

  useEffect(() => {
    const handleLocationChange = () => {
      setCurrentPath(window.location.pathname);
      setIsAdminRoute(window.location.pathname.startsWith('/admin') || window.location.search.includes('view=admin'));
    };
    
    // Initial normalization if someone uses the old ?view=admin query string
    if (window.location.search.includes('view=admin') && !window.location.pathname.startsWith('/admin')) {
      window.history.replaceState({}, '', '/admin/dashboard');
      setIsAdminRoute(true);
    }

    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  if (currentPath.startsWith('/dev/product-preview')) {
    return <DevProductPreview />;
  }

  if (currentPath.startsWith('/dev/cad-responsive')) {
    return <DevResponsiveCADPreview />;
  }

  return isAdminRoute ? <AdminApp /> : <PublicApp />;
}

export default App;
