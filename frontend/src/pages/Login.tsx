import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Eye,
  EyeOff,
  Lock,
  User,
  ArrowRight,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { useApp } from '../context/AppContext';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useApp();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim()) {
      setError('Please enter your Moellim username or university ID.');
      return;
    }

    if (!password) {
      setError('Please enter your Moellim password.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const success = await login(username, password, rememberMe);

      if (!success) {
        setError('Authentication failed. Please verify your Moellim credentials.');
        return;
      }

      navigate('/dashboard', { replace: true });
    } catch (err: any) {
      console.error('[Login] Authentication failed:', err);
      setError(
        err?.message ||
          'Authentication failed. Please verify your Moellim credentials.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-4xl w-full bg-white rounded-3xl border border-neutral-200/90 shadow-lg shadow-neutral-900/5 overflow-hidden grid grid-cols-1 md:grid-cols-2">
        {/* LEFT SIDE — BRANDING */}
        <div className="bg-slate-900 text-white p-8 md:p-11 flex flex-col justify-between relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-64 h-64 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-extrabold text-lg shadow-xs">
                M
              </div>
              <div>
                <span className="text-lg font-extrabold tracking-tight text-white">
                  MUAWIN
                </span>
                <span className="text-[10px] font-bold uppercase tracking-widest block text-slate-400">
                  From Intent to Action
                </span>
              </div>
            </div>

            <div className="mt-16">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 leading-snug">
                An intelligent workflow assistant for Riphah Moellim.
              </h2>
            </div>
          </div>

          <div className="relative z-10 mt-12 pt-5 border-t border-slate-800 text-[11px] text-slate-400 leading-relaxed">
            Faculty of Computing &amp; Applied Sciences &bull; Riphah International University
          </div>
        </div>

        {/* RIGHT SIDE — SIGN IN */}
        <div className="p-8 md:p-11 flex flex-col justify-between bg-white">
          <div>
            <div className="flex items-start justify-between gap-2 mb-8">
              <div>
                <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                  Welcome to MUAWIN
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Sign in with your university credentials to continue
                </p>
              </div>
              <span className="text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 shrink-0">
                Moellim LMS
              </span>
            </div>

            {error && (
              <div className="mb-5 p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-medium text-rose-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* USERNAME */}
              <div>
                <label
                  htmlFor="username"
                  className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5"
                >
                  Moellim Username / Faculty ID
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. 53289"
                    disabled={loading}
                    autoComplete="username"
                    className="w-full h-10 pl-10 pr-4 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/15 focus:border-blue-600 transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* PASSWORD */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5"
                >
                  Moellim Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    disabled={loading}
                    autoComplete="current-password"
                    className="w-full h-10 pl-10 pr-10 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600/15 focus:border-blue-600 transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* REMEMBER ME */}
              <div className="flex items-center justify-between text-xs pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                  />
                  <span className="text-slate-600">Remember me</span>
                </label>
              </div>

              {/* SUBMIT */}
              <button
                type="submit"
                disabled={loading || !username.trim() || !password}
                className="w-full h-10 mt-2 px-4 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-5 border-t border-slate-100 flex items-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>Secure access to your academic workspace</span>
          </div>
        </div>
      </div>
    </div>
  );
};