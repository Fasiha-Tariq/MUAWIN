import React, { useCallback, useEffect, useState } from 'react';
import { Settings as SettingsIcon, Cloud, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { api } from '../services/api';

type DriveStatus = {
  connected: boolean;
  account?: string | null;
  credentials_configured: boolean;
  token_saved: boolean;
  message: string;
};

export const Settings: React.FC = () => {
  const [drive, setDrive] = useState<DriveStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<DriveStatus>('/integrations/google-drive/status');
      setDrive(response.data);
      setMessage(response.data.message || '');
    } catch (error: any) {
      setMessage(error?.message || 'Could not read Google Drive connection status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  const connectDrive = async () => {
    setLoading(true);
    setMessage('Google sign-in window is opening. Complete consent in your browser.');
    try {
      const response = await api.post<{ connected: boolean; account?: string; message: string }>(
        '/integrations/google-drive/connect', {}
      );
      setMessage(response.data.message);
      await loadStatus();
    } catch (error: any) {
      setMessage(error?.message || 'Google Drive connection failed.');
      await loadStatus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><SettingsIcon /></div>
          <div><h2 className="text-xl font-bold text-slate-900">System Settings</h2><p className="text-sm text-slate-500">Manage external integrations used by MUAWIN.</p></div>
        </div>
      </div>

      <section className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Cloud className="w-6 h-6 text-blue-600" />
          <div><h3 className="font-bold text-slate-900">Google Drive</h3><p className="text-sm text-slate-500">Retrieve lecture files from your own Google Drive account.</p></div>
        </div>
        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            {drive?.connected ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-amber-600" />}
            {drive?.connected ? 'Connected' : 'Not connected'}
          </div>
          {drive?.account && <p className="mt-1 text-slate-600">Account: {drive.account}</p>}
          <p className="mt-2 text-slate-600">{message || drive?.message || 'Checking connection...'}</p>
          {drive && !drive.credentials_configured && <p className="mt-2 text-amber-700">Add your Google OAuth Desktop credentials as backend/credentials.json before connecting.</p>}
        </div>
        <div className="flex flex-wrap gap-3">
          <button onClick={connectDrive} disabled={loading || !drive?.credentials_configured} className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50">{loading ? 'Please wait...' : 'Connect Google Drive'}</button>
          <button onClick={() => void loadStatus()} disabled={loading} className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-semibold flex items-center gap-2 disabled:opacity-50"><RefreshCw className="w-4 h-4" /> Refresh status</button>
        </div>
        <p className="text-xs text-slate-500">MUAWIN requests read-only Google Drive access. Your OAuth credentials and token must remain private and should not be shared in the project ZIP or public repository.</p>
      </section>
    </div>
  );
};
