import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Sparkles, 
  Mic2, 
  CheckSquare, 
  Workflow, 
  History, 
  Settings, 
  HelpCircle, 
  ChevronLeft, 
  ChevronRight, 
  GraduationCap, 
  ExternalLink,
  ShieldCheck,
  X
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onCloseMobile
}) => {
  const { user, stats, demoMode, classModeStatus } = useApp();

  const mainNav = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
    { name: 'AI Assistant (Command Mode)', path: '/assistant', icon: Sparkles, badge: 'Voice/Text' },
    { 
      name: 'Class Mode (Lecture)', 
      path: '/lecture', 
      icon: Mic2, 
      badge: classModeStatus === 'live' ? '● LIVE' : classModeStatus === 'upcoming_warning' ? 'Starts in 5m' : 'Timetable' 
    }
  ];

  const workflowNav = [
    { 
      name: 'Approvals', 
      path: '/approvals', 
      icon: CheckSquare, 
      count: stats.pendingApprovals > 0 ? stats.pendingApprovals : undefined 
    },
    { name: 'Workflows', path: '/workflows', icon: Workflow },
    { name: 'Activity Logs', path: '/logs', icon: History }
  ];

  const systemNav = [
    { name: 'Settings', path: '/settings', icon: Settings },
    { name: 'Help', path: '/help', icon: HelpCircle }
  ];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-600 text-white font-semibold shadow-sm'
        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
    }`;

  const renderSidebarContent = (isMobileDrawer: boolean) => {
    const isCollapsed = isMobileDrawer ? false : collapsed;

    return (
      <div className="flex flex-col h-full bg-white border-r border-slate-200 select-none">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg tracking-wider shadow-sm shrink-0">
              M
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-tight text-slate-900">MUAWIN</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    Moellim
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-500 truncate">From Intent to Action</p>
              </div>
            )}
          </div>
          {/* Mobile close button */}
          {isMobileDrawer && (
            <button
              onClick={onCloseMobile}
              className="text-slate-400 hover:text-slate-600 p-2 rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Close sidebar"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Nav List */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {/* Main Section */}
          <div>
            {!isCollapsed && (
              <span className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Main
              </span>
            )}
            <nav className="space-y-1">
              {mainNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onCloseMobile}
                    className={linkClass}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!isCollapsed && (
                      <span className="flex-1 truncate">{item.name}</span>
                    )}
                    {!isCollapsed && item.badge && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Workflows Section */}
          <div>
            {!isCollapsed && (
              <span className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                Workflows
              </span>
            )}
            <nav className="space-y-1">
              {workflowNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onCloseMobile}
                    className={linkClass}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!isCollapsed && (
                      <span className="flex-1 truncate">{item.name}</span>
                    )}
                    {!isCollapsed && item.count !== undefined && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white animate-pulse">
                        {item.count}
                      </span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* System Section */}
          <div>
            {!isCollapsed && (
              <span className="px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                System
              </span>
            )}
            <nav className="space-y-1">
              {systemNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onCloseMobile}
                    className={linkClass}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    {!isCollapsed && (
                      <span className="flex-1 truncate">{item.name}</span>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Moellim Connection Status (Honest Demo State) */}
        {!isCollapsed && (
          <div className="px-3.5 py-2.5 mx-3 mb-2 rounded-lg bg-amber-50/80 border border-amber-200/80">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span className="font-bold text-amber-950 text-[11px] uppercase tracking-wider">Moellim Connection</span>
              </div>
              <span className="text-[10px] text-amber-800 font-bold bg-amber-100 px-1.5 py-0.5 rounded">
                Demo
              </span>
            </div>
            <p className="text-[11px] font-medium text-amber-800 mt-1">Demo Mode / Frontend Simulation</p>
          </div>
        )}

        {/* Teacher Profile Footer */}
        <div className="p-3 border-t border-slate-200 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
              {user?.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2) : 'HM'}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-900 truncate">{user?.name || 'Dr. Hajra Murtaza'}</h4>
                <p className="text-[11px] text-slate-500 truncate">{user?.role || 'Course Instructor'}</p>
              </div>
            )}
          </div>

          {/* Demo Mode / Frontend Simulation Indicator */}
          {!isCollapsed && demoMode && (
            <div className="mt-2 pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                <ShieldCheck className="w-3 h-3 text-blue-600" />
                Demo Mode
              </span>
              <span className="text-[10px] text-slate-400">Frontend Simulation</span>
            </div>
          )}
        </div>

        {/* Desktop Collapse Toggle */}
        {!isMobileDrawer && (
          <div className="hidden md:flex items-center justify-end px-3 py-2 border-t border-slate-100 bg-white">
            <button
              onClick={onToggleCollapse}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden md:block h-screen sticky top-0 transition-all duration-200 z-30 shrink-0 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in duration-150">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {renderSidebarContent(true)}
          </div>
        </div>
      )}
    </>
  );
};
