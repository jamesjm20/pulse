import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { fetchConfig } from '../api';
import type { Config } from '../types';

export default function Layout({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    fetchConfig().then(setConfig).catch(() => {});
  }, []);

  const userLabel = config?.user?.email
    ? config.user.email.split('@')[0]
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-200 px-6 py-4 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-12">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">P</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">Pulse</span>
            </div>
            <div className="flex items-center gap-1">
              {(['/', '/traces'] as const).map((to) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    `px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`
                  }
                >
                  {to === '/' ? '📊 Overview' : '🔗 Traces'}
                </NavLink>
              ))}
            </div>
          </div>
          {userLabel && (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-bold">
                {userLabel[0].toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-700">{userLabel}</span>
            </div>
          )}
        </div>
      </nav>
      <main className="max-w-7xl mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
