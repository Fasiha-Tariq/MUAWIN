import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Menu, 
  Sparkles, 
  Bell, 
  Mic2, 
  Search, 
  ShieldCheck, 
  LogOut, 
  ExternalLink,
  ChevronDown,
  BookOpen,
  Check
} from 'lucide-react';
import { useApp } from '../../context/AppContext';

interface TopbarProps {
  onOpenMobileMenu: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onOpenMobileMenu }) => {
  const { user, logout, stats, demoMode, courses, selectedCourseId, selectedCourse, selectCourse } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const [courseDropdownOpen, setCourseDropdownOpen] = useState(false);

  // Derive human readable page title
  const getPageInfo = () => {
    const path = location.pathname;
    if (path.startsWith('/dashboard')) return { title: 'Academic Dashboard', subtitle: 'Overview of courses and pending approvals' };
    if (path.startsWith('/assistant')) return { title: 'AI Assistant — Command Mode', subtitle: 'Direct natural-language & voice instruction command center' };
    if (path.startsWith('/lecture')) return { title: 'Class Mode — Lecture Session', subtitle: 'Live classroom audio capture, transcription & academic insight extraction' };
    if (path.startsWith('/approvals')) return { title: 'Pending Approvals', subtitle: 'Review and authorize automated actions before execution' };
    if (path.startsWith('/workflows')) return { title: 'Workflow Management', subtitle: 'Active, queued and completed execution pipelines' };
    if (path.startsWith('/logs')) return { title: 'Activity Logs', subtitle: 'Audited log of all agentic actions executed on Moellim' };
    if (path.startsWith('/settings')) return { title: 'System Settings', subtitle: 'Preferences, transcription configuration, and Moellim adapter' };
    if (path.startsWith('/help')) return { title: 'Help & Documentation', subtitle: 'User guide, workflow specifications, and system FAQs' };
    return { title: 'MUAWIN', subtitle: 'From Intent to Action' };
  };

  const { title, subtitle } = getPageInfo();

  return (
    <header className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200/90 px-3.5 sm:px-6 md:px-8 py-2.5 transition-colors">
      <div className="flex items-center justify-between gap-2 sm:gap-4 max-w-7xl mx-auto w-full">
        {/* Left side: Hamburger + MUAWIN Logo (Mobile) or Page Title (Tablet/Desktop) */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Open mobile navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile view: MUAWIN Logo & Brand */}
          <div className="flex items-center gap-2 sm:hidden">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-extrabold text-sm shadow-xs shrink-0">
              M
            </div>
            <span className="font-extrabold text-base tracking-tight text-slate-900">MUAWIN</span>
          </div>

          {/* Tablet & Desktop: Page Title & Subtitle */}
          <div className="min-w-0 hidden sm:block">
            <h1 className="text-base md:text-lg font-bold text-slate-900 truncate tracking-tight">{title}</h1>
            <p className="text-xs text-slate-500 hidden md:block truncate">{subtitle}</p>
          </div>
        </div>

        {/* Center / Right: Responsive Controls */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Active Course Selector (Tablet & Desktop only; on mobile it stays in page content) */}
          {courses.length > 0 && (
            <div className="relative hidden sm:block">
              <button
                onClick={() => setCourseDropdownOpen(!courseDropdownOpen)}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all shadow-2xs"
                title="Active course context for all MUAWIN workflows"
              >
                <BookOpen className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <div className="text-left hidden lg:block">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block leading-tight">Active Course</span>
                  <span className="font-bold text-slate-900">{selectedCourse ? `${selectedCourse.code} (${selectedCourse.section})` : 'Select Course'}</span>
                </div>
                <div className="lg:hidden font-bold text-slate-900">
                  {selectedCourse?.code || 'Course'}
                </div>
                <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
              </button>

              {courseDropdownOpen && (
                <div 
                  className="absolute right-0 sm:left-0 mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                  onMouseLeave={() => setCourseDropdownOpen(false)}
                >
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <p className="font-bold text-slate-900 text-xs">Your Assigned Courses</p>
                    <p className="text-[11px] text-slate-500">Only courses assigned to {user?.name} on Moellim</p>
                  </div>

                  <div className="py-1 max-h-60 overflow-y-auto">
                    {courses.map((course) => {
                      const isSelected = course.id === selectedCourseId;
                      return (
                        <button
                          key={course.id}
                          onClick={() => {
                            selectCourse(course.id);
                            setCourseDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 flex items-center justify-between hover:bg-slate-50 transition-colors ${
                            isSelected ? 'bg-blue-50/70 text-blue-900 font-semibold' : 'text-slate-700'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold">{course.code}</span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                {course.section}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">{course.title}</p>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0 ml-2" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quick Assistant shortcut (Desktop only) */}
          <button
            onClick={() => navigate('/assistant')}
            className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            <span>Ask MUAWIN</span>
          </button>

          {/* Moellim Connection Status indicator (Honest Demo State - Large screens only) */}
          <div 
            title="Moellim Connection: Demo Mode / Frontend Simulation (Playwright browser automation backend pending)"
            className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-amber-50 text-amber-900 border border-amber-200/80 shadow-2xs"
          >
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span className="text-[10px] font-bold text-amber-950 uppercase tracking-wider">Moellim:</span>
            <span className="text-[11px] font-medium text-amber-800">Demo Mode</span>
          </div>

          {/* Notifications Button (All screens) */}
          <button
            onClick={() => navigate('/approvals')}
            className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Approvals and notifications"
            aria-label="Pending Approvals"
          >
            <Bell className="w-4 h-4" />
            {stats.pendingApprovals > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white"></span>
            )}
          </button>

          {/* User Profile Dropdown Menu (All screens - responsive popup) */}
          <div className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className="flex items-center gap-2 p-1.5 text-left rounded-lg hover:bg-slate-100 transition-colors"
              aria-label="Instructor profile menu"
            >
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                {user?.name ? user.name.split(' ').map(n => n[0]).join('').substring(0, 2) : 'HM'}
              </div>
              <div className="hidden md:block text-left">
                <span className="text-xs font-bold text-slate-800 block max-w-[120px] truncate leading-tight">
                  {user?.name || 'Dr. Hajra Murtaza'}
                </span>
                <span className="text-[10px] text-slate-400 block leading-none">
                  {courses.length} courses
                </span>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden md:block" />
            </button>

            {profileOpen && (
              <div 
                className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
                onMouseLeave={() => setProfileOpen(false)}
              >
                {/* Current Teacher Name & Role */}
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="font-bold text-slate-900 text-sm">{user?.name || 'Dr. Hajra Murtaza'}</p>
                  <p className="text-xs font-semibold text-slate-600 mt-0.5">{user?.role || 'Course Instructor'}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{user?.department || 'Department of Computer Science'}</p>
                </div>

                {/* Moellim Account & Assigned Courses */}
                <div className="py-2.5 px-4 border-b border-slate-100 bg-slate-50/70 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Moellim Account:</span>
                    <span className="font-bold text-amber-800 bg-amber-100/70 border border-amber-200 px-2 py-0.5 rounded text-[10px] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                      Connected / Demo
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">Assigned Courses:</span>
                    <span className="font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded text-[10px]">
                      {courses.length} Assigned Sections
                    </span>
                  </div>
                </div>

                {/* System Settings & Activity Logs */}
                <div className="py-1">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 font-medium transition-colors"
                  >
                    System Settings
                  </button>
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/logs');
                    }}
                    className="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-50 font-medium transition-colors"
                  >
                    Activity Logs
                  </button>
                </div>

                {/* Sign Out */}
                <div className="border-t border-slate-100 pt-1">
                  <button
                    onClick={() => {
                      setProfileOpen(false);
                      logout();
                      navigate('/login');
                    }}
                    className="w-full text-left px-4 py-2 text-rose-600 hover:bg-rose-50 font-medium flex items-center gap-2 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

