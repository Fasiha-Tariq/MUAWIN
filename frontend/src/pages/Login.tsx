import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Lock,
  User,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useApp();

  // ============================================================
  // LOGIN FORM STATE
  // ============================================================

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ============================================================
  // SUBMIT
  // ============================================================

  const handleSubmit = async (
    e: React.FormEvent
  ) => {
    e.preventDefault();

    if (!username.trim()) {
      setError(
        'Please enter your Moellim username or university ID.'
      );
      return;
    }

    if (!password) {
      setError(
        'Please enter your Moellim password.'
      );
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const success = await login(
        username,
        password,
        rememberMe
      );

      if (!success) {
        setError(
          'Authentication failed. Please verify your Moellim credentials.'
        );
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch (error: any) {
      console.error(
        '[Login] Authentication failed:',
        error
      );

      setError(
        error?.message ||
          'Authentication failed. Please verify your Moellim credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // UI
  // ============================================================

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-4xl w-full bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden grid grid-cols-1 md:grid-cols-2">

        {/* ======================================================
            LEFT SIDE — BRANDING
        ====================================================== */}

        <div className="bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900 text-white p-8 md:p-12 flex flex-col justify-between relative overflow-hidden">

          {/* Decorative shapes */}
          <div className="absolute -right-12 -top-12 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-12 -bottom-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Brand header */}
          <div className="relative z-10">

            <div className="flex items-center gap-3">

              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold text-xl shadow-md">
                M
              </div>

              <div>
                <span className="text-xl font-extrabold tracking-tight">
                  MUAWIN
                </span>

                <span className="text-[10px] font-bold uppercase tracking-wider block text-blue-300">
                  From Intent to Action
                </span>
              </div>

            </div>

            <div className="mt-12 space-y-4">

              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-tight">
                An intelligent workflow assistant for Riphah Moellim.
              </h2>

              <p className="text-sm text-blue-200/80 leading-relaxed max-w-sm">
                Reducing repetitive academic and administrative effort through supervised agentic automation.
              </p>

            </div>

          </div>

          {/* Workflow Sequence */}
          <div className="relative z-10 mt-10 pt-8 border-t border-white/10 space-y-2.5 text-xs text-blue-100/90">

            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 flex items-center justify-center text-[10px] font-bold">
                1
              </span>
              <span>
                Teacher Intent Understanding
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-400/40 text-blue-300 flex items-center justify-center text-[10px] font-bold">
                2
              </span>
              <span>
                Structured Workflow Plan
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center text-[10px] font-bold">
                3
              </span>
              <span>
                Human Teacher Approval
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="w-5 h-5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center text-[10px] font-bold">
                4
              </span>
              <span>
                Controlled Moellim Execution & Audit
              </span>
            </div>

          </div>

          <div className="relative z-10 mt-6 text-[11px] text-blue-300/70">
            Faculty of Computing & Applied Sciences • Riphah International University
          </div>

        </div>

        {/* ======================================================
            RIGHT SIDE — LOGIN
        ====================================================== */}

        <div className="p-8 md:p-12 flex flex-col justify-between">

          <div>

            <div className="mb-6">

              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Welcome to MUAWIN
              </h3>

              <p className="text-xs text-slate-500 mt-1">
                Sign in with your university credentials to continue
              </p>

            </div>

            {/* Error */}
            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">
                {error}
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className="space-y-4"
            >

              {/* Faculty Session Notice */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200/90 text-xs">

                <div className="flex items-center justify-between">

                  <div className="flex items-center gap-2">

                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>

                    <span className="font-bold text-slate-800">
                      Faculty Session Authentication
                    </span>

                  </div>

                  <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                    Moellim LMS
                  </span>

                </div>

                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                  Sign in to your university account. MUAWIN will automatically identify your instructor session and retrieve only your assigned courses and sections.
                </p>

              </div>

              {/* =================================================
                  USERNAME
              ================================================= */}

              <div>

                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Moellim Username / Faculty ID
                </label>

                <div className="relative">

                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />

                  <input
                    type="text"
                    value={username}
                    onChange={(e) =>
                      setUsername(
                        e.target.value
                      )
                    }
                    placeholder="e.g. 53289"
                    disabled={loading}
                    autoComplete="username"
                    className="w-full pl-10 pr-4 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-600 transition-colors disabled:opacity-50"
                  />

                </div>

              </div>

              {/* =================================================
                  PASSWORD
              ================================================= */}

              <div>

                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Moellim Password
                </label>

                <div className="relative">

                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />

                  <input
                    type={
                      showPassword
                        ? 'text'
                        : 'password'
                    }
                    value={password}
                    onChange={(e) =>
                      setPassword(
                        e.target.value
                      )
                    }
                    placeholder="Enter password"
                    disabled={loading}
                    autoComplete="current-password"
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-blue-600 transition-colors disabled:opacity-50"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        !showPassword
                      )
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                    aria-label={
                      showPassword
                        ? 'Hide password'
                        : 'Show password'
                    }
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>

                </div>

              </div>

              {/* =================================================
                  REMEMBER ME
              ================================================= */}

              <div className="flex items-center justify-between text-xs pt-1">

                <label className="flex items-center gap-2 cursor-pointer select-none">

                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) =>
                      setRememberMe(
                        e.target.checked
                      )
                    }
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                  />

                  <span className="text-slate-600">
                    Remember me
                  </span>

                </label>

                <span
                  className="text-[11px] text-slate-500 font-medium"
                  title="Retrieves only your assigned courses from Moellim"
                >
                  Single Teacher Session
                </span>

              </div>

              {/* =================================================
                  SUBMIT
              ================================================= */}

              <button
                type="submit"
                disabled={
                  loading ||
                  !username.trim() ||
                  !password
                }
                className="w-full mt-2 py-3 px-4 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2"
              >

                {loading ? (
                  <span>
                    Signing in to Moellim Workspace...
                  </span>
                ) : (
                  <>
                    <span>
                      Sign In & Load Assigned Courses
                    </span>

                    <ArrowRight className="w-4 h-4" />
                  </>
                )}

              </button>

            </form>

          </div>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">

            <span className="flex items-center gap-1.5">

              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />

              <span>
                Secure access to your academic workspace
              </span>

            </span>

            <span>
              v1.0-FYP
            </span>

          </div>

        </div>

      </div>
    </div>
  );
};