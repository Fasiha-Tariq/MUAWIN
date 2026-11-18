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
  ClipboardList,
  BellRing,
  BookOpenCheck, 
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
    { name: 'AI Assistant', path: '/assistant', icon: Sparkles, badge: 'Voice/Text' },
    { 
      name: 'Class Mode', 
      path: '/lecture', 
      icon: Mic2, 
      badge: classModeStatus === 'live' ? 'LIVE' : classModeStatus === 'upcoming_warning' ? '5m' : 'Timetable' 
    }
  ];

  const setupNav = [
    { name: 'Course Setup', path: '/setup', icon: BookOpenCheck },
    { name: 'Weekly Tracker', path: '/tracker', icon: ClipboardList },
    { name: 'Reminders', path: '/reminders', icon: BellRing },
  ];

  const workflowNav = [
    { 
      name: 'Approvals', 
      path: '/approvals', 
      icon: CheckSquare, 
      count: stats.pendingApprovals > 0 ? stats.pendingApprovals : undefined 
    },
    // { name: 'Workflows', path: '/workflows', icon: Workflow },
    { name: 'Activity Logs', path: '/logs', icon: History }
  ];

  const systemNav = [
    { name: 'Settings', path: '/settings', icon: Settings },
    { name: 'Help', path: '/help', icon: HelpCircle }
  ];

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
      isActive
        ? 'bg-blue-600 text-white font-semibold shadow-sm shadow-blue-950/50'
        : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
    }`;

  const renderSidebarContent = (isMobileDrawer: boolean) => {
    const isCollapsed = isMobileDrawer ? false : collapsed;

    return (
      <div className="flex flex-col h-full min-h-full bg-slate-900 text-slate-200 border-r border-slate-800 select-none">
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg tracking-wider shadow-sm shrink-0">
              M
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-extrabold text-base tracking-tight text-white">MUAWIN</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-400/25">
                    Moellim
                  </span>
                </div>
                <p className="text-[11px] font-medium text-slate-400 truncate">From Intent to Action</p>
              </div>
            )}
          </div>
          {/* Mobile close button */}
          {isMobileDrawer && (
            <button
              onClick={onCloseMobile}
              className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
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
              <span className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
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
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                            isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                        />
                        {!isCollapsed && (
                          <span className="flex-1 truncate">{item.name}</span>
                        )}
                        {!isCollapsed && item.badge && (
                          <span
                            className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                              isActive
                                ? 'bg-blue-500/40 text-white border border-blue-300/30'
                                : item.badge === 'LIVE'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : item.badge === '5m'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Course Setup & Tracking Section */}
          <div>
            {!isCollapsed && (
              <span className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                Course Management
              </span>
            )}
            <nav className="space-y-1">
              {setupNav.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={onCloseMobile}
                    className={linkClass}
                    title={isCollapsed ? item.name : undefined}
                  >
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                            isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                        />
                        {!isCollapsed && <span className="flex-1 truncate">{item.name}</span>}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* Workflows Section */}
          <div>
            {!isCollapsed && (
              <span className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
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
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                            isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                        />
                        {!isCollapsed && (
                          <span className="flex-1 truncate">{item.name}</span>
                        )}
                        {!isCollapsed && item.count !== undefined && (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-slate-950">
                            {item.count}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>

          {/* System Section */}
          <div>
            {!isCollapsed && (
              <span className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
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
                    {({ isActive }) => (
                      <>
                        <Icon
                          className={`w-4.5 h-4.5 shrink-0 transition-colors ${
                            isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                          }`}
                        />
                        {!isCollapsed && (
                          <span className="flex-1 truncate">{item.name}</span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Bottom Group: Connection + Profile + Toggle */}
        <div className="mt-auto shrink-0">
          {/* Moellim Connection Status */}
          {!isCollapsed && (
            <div className="px-3.5 py-2.5 mx-3 mb-2 rounded-xl bg-slate-800/80 border border-slate-700/80">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      user?.moellimConnected && !demoMode ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span className="font-bold text-slate-200 text-[10px] uppercase tracking-wider">
                    Moellim Status
                  </span>
                </div>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    user?.moellimConnected && !demoMode
                      ? 'text-emerald-300 bg-emerald-500/15 border border-emerald-500/25'
                      : 'text-amber-300 bg-amber-500/15 border border-amber-500/25'
                  }`}
                >
                  {demoMode ? 'Demo' : user?.moellimConnected ? 'Connected' : 'Offline'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                {demoMode
                  ? 'Simulation mode active'
                  : user?.moellimConnected
                  ? 'Authenticated session'
                  : 'No active session'}
              </p>
            </div>
          )}

          {/* Teacher Profile Footer */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-300 font-bold text-sm shrink-0">
                {user?.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2) : 'HM'}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-bold text-white truncate">{user?.name || 'Dr. Hajra Murtaza'}</h4>
                  <p className="text-[11px] text-slate-400 truncate">{user?.role || 'Course Instructor'}</p>
                </div>
              )}
            </div>

            {!isCollapsed && demoMode && (
              <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1 text-blue-300 font-medium">
                  <ShieldCheck className="w-3 h-3 text-blue-400" />
                  Demo Mode
                </span>
                <span className="text-[10px] text-slate-500">Simulation</span>
              </div>
            )}
          </div>

          {/* Desktop Collapse Toggle */}
          {!isMobileDrawer && (
            <div className="hidden md:flex items-center justify-end px-3 py-2 border-t border-slate-800/80 bg-slate-900">
              <button
                onClick={onToggleCollapse}
                className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden md:flex flex-col fixed inset-y-0 left-0 transition-all duration-200 z-30 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {renderSidebarContent(false)}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex animate-in fade-in duration-150">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
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