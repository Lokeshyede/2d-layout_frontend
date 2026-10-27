import React, { useState } from 'react';
import { Compass, Shield, FileText, ArrowRight, Menu, X } from 'lucide-react';

interface NavbarProps {
  currentRoute: string;
  navigate: (route: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentRoute, navigate }) => {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (route: string) => {
    navigate(route);
    setMobileOpen(false);
  };

  return (
    <nav className="bg-retailfix-dark-900 border-b border-gray-800 text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">

          {/* Brand Logo */}
          <div
            className="flex items-center gap-3 cursor-pointer group shrink-0"
            onClick={() => handleNav('landing')}
          >
            <div className="w-10 h-10 rounded-lg bg-retailfix-red-600 flex items-center justify-center shadow-lg shadow-red-900/30 group-hover:scale-105 transition-transform">
              <Compass className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-xl tracking-tight text-white font-sans">RETAIL<span className="text-retailfix-red-500">FIX</span></span>
                <span className="text-[10px] font-mono bg-retailfix-red-950 text-retailfix-red-400 border border-retailfix-red-800/60 px-1.5 py-0.5 rounded font-semibold">CAD 2.0</span>
              </div>
              <p className="text-[10px] text-gray-400 font-medium tracking-wider uppercase hidden sm:block">Store Survey &amp; 2D CAD Platform</p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1">
            <button
              onClick={() => handleNav('landing')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                currentRoute === 'landing'
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800/60 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => handleNav('survey')}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
                currentRoute === 'survey'
                  ? 'bg-retailfix-red-600 text-white shadow-md shadow-red-900/30'
                  : 'text-gray-300 hover:bg-gray-800/60 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              New Store Survey
            </button>
          </div>

          {/* Right Action */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => { window.location.href = '/admin/login'; }}
              className="hidden sm:flex text-xs text-gray-400 hover:text-gray-200 items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <Shield className="w-3.5 h-3.5" />
              Admin Access
            </button>

            <button
              onClick={() => handleNav('survey')}
              className="hidden sm:inline-flex items-center gap-2 bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-lg shadow-red-900/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Start Survey
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
              aria-label="Toggle mobile menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-gray-800 bg-retailfix-dark-900">
          <div className="px-4 py-3 space-y-1">
            <button
              onClick={() => handleNav('landing')}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                currentRoute === 'landing'
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800/60 hover:text-white'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => handleNav('survey')}
              className={`w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                currentRoute === 'survey'
                  ? 'bg-retailfix-red-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800/60 hover:text-white'
              }`}
            >
              <FileText className="w-4 h-4" />
              New Store Survey
            </button>
            <button
              onClick={() => { window.location.href = '/admin/login'; }}
              className="w-full text-left px-4 py-3 rounded-lg text-sm font-medium text-gray-400 hover:bg-gray-800/60 hover:text-white transition-colors flex items-center gap-2"
            >
              <Shield className="w-4 h-4" />
              Admin Access
            </button>
            <div className="pt-2 pb-1">
              <button
                onClick={() => handleNav('survey')}
                className="w-full bg-retailfix-red-600 hover:bg-retailfix-red-700 text-white text-sm font-semibold px-4 py-3 rounded-lg flex items-center justify-center gap-2"
              >
                Start Store Survey
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
};
