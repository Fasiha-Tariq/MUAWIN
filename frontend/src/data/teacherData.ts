import { UserProfile } from '../types';

/**
 * TEACHER MOCK DATA
 * Represents the currently authenticated teacher on Riphah Moellim.
 * MUAWIN is an isolated personal workspace for ONE teacher only: Dr. Hajra Murtaza.
 *
 * In future backend integration:
 *   Moellim Authentication (Teacher Credentials)
 *   → Playwright Session
 *   → Python Backend (GET /api/teacher)
 *   → React Service Layer
 */
export const teacherData: UserProfile = {
  id: 'usr-riphah-8492',
  name: 'Dr. Hajra Murtaza',
  username: 'hajra.murtaza',
  department: 'Department of Computer Science',
  role: 'Course Instructor',
  faculty: 'Faculty of Computing & Applied Sciences',
  email: 'hajra.murtaza@riphah.edu.pk',
  moellimConnected: true,
  lastActive: 'Today, 09:32 AM'
};

// Aliases for backwards compatibility with existing components
export const mockTeacherProfile = teacherData;
export const AUTHENTICATED_TEACHER = teacherData;
