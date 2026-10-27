import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { LandingPage } from './components/Landing/LandingPage';
import { CustomerSurveyWizard } from './components/SurveyForm/CustomerSurveyWizard';
import { CADEditor } from './components/CAD/CADEditor';
import { CustomerPresentationPage } from './components/CustomerPresentation/CustomerPresentationPage';
import type { SurveyResponseData } from './services/api';

export function PublicApp() {
  const [currentRoute, setCurrentRoute] = useState<'landing' | 'survey' | 'designer' | 'share'>('landing');
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeToken, setActiveToken] = useState<string | undefined>(undefined);
  const [shareToken, setShareToken] = useState<string | null>(null);

  useEffect(() => {
    const handleLocationChange = () => {
      const path = window.location.pathname;
      const params = new URLSearchParams(window.location.search);
      
      if (path.startsWith('/share/project/')) {
        const token = path.replace('/share/project/', '').split('?')[0].split('/')[0];
        if (token) {
          setShareToken(token);
          setCurrentRoute('share');
          return;
        }
      } else if (path.startsWith('/share/')) {
        const token = path.replace('/share/', '').split('?')[0].split('/')[0];
        if (token) {
          setShareToken(token);
          setCurrentRoute('share');
          return;
        }
      }

      if (path.startsWith('/cad/')) {
        const id = path.split('/cad/')[1];
        if (id) {
          setActiveProjectId(id);
          setActiveToken(params.get('token') || undefined);
          setCurrentRoute('designer');
        }
      } else if (path === '/survey') {
        setCurrentRoute('survey');
      } else {
        setCurrentRoute('landing');
      }
    };

    // Initial check
    handleLocationChange();

    // Listen for popstate
    window.addEventListener('popstate', handleLocationChange);
    return () => window.removeEventListener('popstate', handleLocationChange);
  }, []);

  const handleStartSurvey = () => {
    setCurrentRoute('survey');
    window.history.pushState({}, '', '/survey');
  };

  const handleSurveyCreated = (surveyData: SurveyResponseData) => {
    setActiveProjectId(surveyData.surveyId);
    setActiveToken(surveyData.secureToken);
    setCurrentRoute('designer');
    const url = `/cad/${encodeURIComponent(surveyData.surveyId)}?token=${encodeURIComponent(surveyData.secureToken)}`;
    window.history.pushState({}, '', url);
  };

  const navigateTo = (route: string) => {
    setCurrentRoute(route as any);
    if (route === 'landing') window.history.pushState({}, '', '/');
    else if (route === 'survey') window.history.pushState({}, '', '/survey');
  };

  if (currentRoute === 'share' && shareToken) {
    return <CustomerPresentationPage token={shareToken} />;
  }

  if (currentRoute === 'designer' && activeProjectId) {
    return (
      <CADEditor
        projectId={activeProjectId}
        surveyToken={activeToken}
        isAdmin={false} // Public view is never admin
        onExit={() => {
          setCurrentRoute('landing');
          window.history.pushState({}, '', '/');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      <Navbar currentRoute={currentRoute} navigate={navigateTo} />

      <main className="flex-1">
        {currentRoute === 'landing' && (
          <LandingPage
            onStartSurvey={handleStartSurvey}
            onAdminLogin={() => {
              // Instead of showing admin login here, redirect to the new admin portal
              window.location.href = '/admin/login';
            }}
          />
        )}

        {currentRoute === 'survey' && (
          <CustomerSurveyWizard
            onSurveyCreated={handleSurveyCreated}
            onCancel={() => navigateTo('landing')}
          />
        )}
      </main>
    </div>
  );
}
