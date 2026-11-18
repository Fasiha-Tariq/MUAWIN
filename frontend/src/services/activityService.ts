import { ActivityLog } from '../types';
import { activityData, ActivityDataRecord } from '../data/activityData';
import { api, USE_MOCK_API } from './api';

let localActivityLogs: ActivityLog[] = [...activityData];

/**
 * ACTIVITY SERVICE
 *
 * Provides immutable audit logs of teacher actions and Moellim automations.
 *
 * Current: Mock Data Layer (activityData.ts)
 * Future: GET /api/activity-logs
 */
export const activityService = {
  /**
   * Retrieves activity audit logs.
   * Future endpoint: GET /api/activity-logs
   */
  async getActivityLogs(): Promise<ActivityLog[]> {
    if (!USE_MOCK_API) {
      try {
        const [workflowResponse, featureResponse] = await Promise.all([
          api.get<ActivityLog[]>('/activity-logs'),
          api.get<{ events: any[] }>('/setup/events'),
        ]);
        const featureLogs: ActivityLog[] = (featureResponse.data.events || []).map((event: any) => ({
          id: `feature-${event.id}`,
          timestamp: event.created_at,
          courseCode: event.course || '',
          courseTitle: event.course || '',
          action: String(event.event_type || 'Course setup').replaceAll('_', ' '),
          workflowName: 'MUAWIN Course Management',
          status: event.status === 'failed' ? 'Failed' : 'Completed',
          operator: event.teacher,
          details: typeof event.details === 'string' ? event.details : JSON.stringify(event.details || {}),
        }));
        return [...(workflowResponse.data || []), ...featureLogs]
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      } catch (err) {
        console.warn('Backend unavailable, falling back to mock activity logs', err);
      }
    }
    await new Promise((res) => setTimeout(res, 120));
    try {
      const saved = localStorage.getItem('muawin_activity_logs');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [...localActivityLogs];
  },

  /**
   * Retrieves a single activity log by ID.
   * Future endpoint: GET /api/activity-logs/:id
   */
  async getActivityLogById(id: string): Promise<ActivityLog | undefined> {
    const logs = await this.getActivityLogs();
    return logs.find((l) => l.id === id);
  },

  /**
   * Records a new completed activity entry into the audit trail.
   * Future endpoint: POST /api/activity-logs
   */
  async recordActivity(log: Omit<ActivityLog, 'id'>): Promise<ActivityLog> {
    const newLog: ActivityLog = {
      ...log,
      id: 'log-' + Date.now()
    };

    localActivityLogs = [newLog, ...localActivityLogs];
    try {
      localStorage.setItem('muawin_activity_logs', JSON.stringify(localActivityLogs));
    } catch {}

    return newLog;
  }
};

export const getActivityLogs = () => activityService.getActivityLogs();
export const getActivityLogById = (id: string) => activityService.getActivityLogById(id);
export const recordActivity = (log: Omit<ActivityLog, 'id'>) => activityService.recordActivity(log);
export default activityService;
