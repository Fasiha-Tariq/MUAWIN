import { UserProfile } from '../types';
import { teacherData } from '../data/teacherData';
import { api, USE_MOCK_API } from './api';

export interface AuthenticatedTeacherProfile {
  teacherId: string;
  name: string;
  username: string;
  email: string;
  department: string;
  faculty: string;
  role: string;
}

/**
 * TEACHER SERVICE
 *
 * Provides current authenticated teacher identity.
 *
 * Current: Mock Data Layer (Dr. Hajra Murtaza)
 * Future: GET /api/teacher (Moellim authenticated session via Playwright)
 */
export const teacherService = {
  /**
   * Retrieves the currently authenticated teacher profile.
   * Future endpoint: GET /api/teacher
   */
  async getCurrentTeacher(): Promise<UserProfile> {
    if (!USE_MOCK_API) {
      try {
        const response = await api.get<UserProfile>('/teacher');
        return response.data;
      } catch (err) {
        console.warn('Backend unavailable, falling back to mock teacher profile', err);
      }
    }
    // Artificial slight delay to mimic async network resolution
    await new Promise((res) => setTimeout(res, 100));
    return { ...teacherData };
  },

  /**
   * Synchronous getter for immediate render contexts
   */
  getCurrentTeacherSync(): UserProfile {
    try {
      const stored = localStorage.getItem('muawin_user');
      if (stored) return JSON.parse(stored);
    } catch {}
    return { ...teacherData };
  },

  /**
   * Backward compatibility getter
   */
  getAuthenticatedTeacher(): AuthenticatedTeacherProfile {
    return {
      teacherId: teacherData.id,
      name: teacherData.name,
      username: teacherData.username,
      email: teacherData.email,
      department: teacherData.department,
      faculty: teacherData.faculty,
      role: teacherData.role
    };
  }
};

export const getCurrentTeacher = () => teacherService.getCurrentTeacher();
export default teacherService;
