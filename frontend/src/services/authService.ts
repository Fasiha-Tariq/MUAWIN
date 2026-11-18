import { UserProfile } from '../types';
import { teacherData } from '../data/teacherData';
import { teacherService } from './teacherService';

export interface LoginCredentials {
  username: string;
  password?: string;
  rememberMe?: boolean;
}

export const authService = {
  /**
   * Future Integration Point: POST /auth/login
   * Simulated authentication validating credentials against Moellim instructor session.
   */
  async login(credentials: LoginCredentials): Promise<{ success: boolean; user: UserProfile; error?: string }> {
    // Artificial latency for realistic university portal authentication check
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (!credentials.username || credentials.username.trim() === '') {
      return { success: false, user: teacherData, error: 'Please provide a valid Moellim username.' };
    }

    const authTeacher = teacherService.getAuthenticatedTeacher();
    // Single authenticated teacher session
    const user: UserProfile = {
      id: authTeacher.teacherId,
      name: authTeacher.name,
      username: credentials.username.trim() || authTeacher.username,
      department: authTeacher.department,
      role: authTeacher.role as any,
      faculty: authTeacher.faculty,
      email: authTeacher.email,
      moellimConnected: true,
      lastActive: 'Just now'
    };

    try {
      localStorage.setItem('muawin_user', JSON.stringify(user));
      localStorage.setItem('muawin_auth_token', `jwt-${authTeacher.teacherId}-${Date.now()}`);
    } catch {
      // ignore storage quota issues
    }

    return { success: true, user };
  },

  getCurrentUser(): UserProfile | null {
    try {
      const stored = localStorage.getItem('muawin_user');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {
      // ignore parsing error
    }
    // Return Dr. Hajra Murtaza as standard demo default
    return teacherData;
  },

  logout(): void {
    try {
      localStorage.removeItem('muawin_user');
      localStorage.removeItem('muawin_auth_token');
      localStorage.removeItem('muawin_selected_course');
    } catch {
      // ignore
    }
  }
};

