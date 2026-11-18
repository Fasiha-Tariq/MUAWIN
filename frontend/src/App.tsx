
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { AppLayout } from './components/layout/AppLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Assistant } from './pages/Assistant';
import { LectureSession } from './pages/LectureSession';
import { Approvals } from './pages/Approvals';
import { WorkflowDetails } from './pages/WorkflowDetails';
import { Workflows } from './pages/Workflows';
import { ActivityLogs } from './pages/ActivityLogs';
import { Settings } from './pages/Settings';
import { Help } from './pages/Help';
import { CourseSetup } from './pages/CourseSetup';
import { WeeklyTracker } from './pages/WeeklyTracker';
import { Reminders } from './pages/Reminders';

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Login Routes */}
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />

          {/* Protected Application Routes */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/lecture" element={<LectureSession />} />
            <Route path="/setup" element={<CourseSetup />} />
            <Route path="/tracker" element={<WeeklyTracker />} />
            <Route path="/reminders" element={<Reminders />} />
            <Route path="/approvals" element={<Approvals />} />
            <Route path="/approvals/:id" element={<Approvals />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/workflows/:id" element={<Workflows />} />
            <Route path="/logs" element={<ActivityLogs />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/help" element={<Help />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}


