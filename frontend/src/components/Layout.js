import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import {
  LayoutDashboard, Users, CreditCard, MessageSquare,
  Palette, FileText, LogOut, Menu, X, ChevronRight,
  Grid3X3, Wallet, Map, Shield
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, testId: 'nav-dashboard' },
  { path: '/layouts', label: 'Plot Layouts', icon: Grid3X3, testId: 'nav-layouts' },
  { path: '/cashflow', label: 'Cash Flow', icon: Wallet, testId: 'nav-cashflow' },
  { path: '/customers', label: 'Customers', icon: Users, testId: 'nav-customers' },
  { path: '/payments', label: 'EMI Tracker', icon: CreditCard, testId: 'nav-payments' },
  { path: '/whatsapp', label: 'WhatsApp Center', icon: MessageSquare, testId: 'nav-whatsapp' },
  { path: '/reports', label: 'Reports', icon: FileText, testId: 'nav-reports' },
  { path: '/users', label: 'Users & Roles', icon: Shield, testId: 'nav-users' },
  { path: '/brand', label: 'Brand Settings', icon: Palette, testId: 'nav-brand' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [brand, setBrand] = useState({ brand_name: 'KrushnaKunj Association', primary_color: '#00AFD1' });

  useEffect(() => {
    api.get('/brand').then(r => {
      setBrand(r.data);
      document.documentElement.style.setProperty('--brand-primary', r.data.primary_color || '#00AFD1');
      document.documentElement.style.setProperty('--brand-accent', r.data.accent_color || '#2D2D2D');
    }).catch(() => {});
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-[#FAFAFA] overflow-hidden">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white border-r border-neutral-200 flex flex-col transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-5 border-b border-neutral-200">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="KrushnaKunj" className="w-9 h-9 rounded-lg object-contain" />
            <div>
              <h1 data-testid="brand-name-header" className="text-sm font-semibold text-neutral-900 tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {brand.brand_name || 'KrushnaKunj Association'}
              </h1>
              <p className="text-[10px] tracking-wider text-neutral-400 font-medium">The key to our success...</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              data-testid={item.testId}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `sidebar-nav-item ${isActive ? 'active' : 'text-neutral-600'}`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-neutral-200">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center text-xs font-semibold text-neutral-600">
              {(user?.name || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">{user?.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-400">{user?.role}</p>
            </div>
          </div>
          <Button
            data-testid="logout-btn"
            variant="ghost"
            className="w-full justify-start text-neutral-500 hover:text-red-600 hover:bg-red-50"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-neutral-200 bg-white flex items-center px-4 lg:px-6 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden mr-2"
            onClick={() => setSidebarOpen(true)}
            data-testid="mobile-menu-btn"
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex-1" />
          <span className="text-xs text-neutral-400 uppercase tracking-wider font-medium">
            {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </span>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <div className="page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
