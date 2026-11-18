import { Course } from '../types';

export interface CourseDataRecord extends Course {
  name: string;
  instructor: string;
  status: 'active' | 'archived' | 'completed';
}

/**
 * COURSE MOCK DATA
 * Represents the 4 assigned courses for Dr. Hajra Murtaza on Riphah Moellim.
 *
 * In future backend integration:
 *   Moellim Dashboard
 *   → Playwright extraction of teacher-specific course cards
 *   → Python Backend (GET /api/courses)
 *   → React Service Layer
 */
export const coursesData: CourseDataRecord[] = [
  {
    id: 'cs6-ai',
    code: 'CS6 — AI',
    title: 'Artificial Intelligence',
    name: 'Artificial Intelligence',
    section: 'Section F',
    instructor: 'Dr. Hajra Murtaza',
    semester: 'Fall 2026',
    status: 'active',
    studentsCount: 42,
    creditHours: 3,
    recentActivity: 'Lecture 09 recorded & analyzed',
    recentActivityTime: 'Today, 08:50 AM',
    lastLectureDate: '17 Sep 2026',
    color: 'border-blue-500 text-blue-700 bg-blue-50'
  },
  {
    id: 'cs5-hci',
    code: 'CS5 — HCI',
    title: 'Human Computer Interaction',
    name: 'Human Computer Interaction',
    section: 'Section B',
    instructor: 'Dr. Hajra Murtaza',
    semester: 'Fall 2026',
    status: 'active',
    studentsCount: 38,
    creditHours: 3,
    recentActivity: 'Assignment approval prepared',
    recentActivityTime: 'Today, 09:15 AM',
    lastLectureDate: '17 Sep 2026',
    color: 'border-emerald-500 text-emerald-700 bg-emerald-50'
  },
  {
    id: 'cs5-ml',
    code: 'CS5 — ML',
    title: 'Machine Learning',
    name: 'Machine Learning',
    section: 'Section A',
    instructor: 'Dr. Hajra Murtaza',
    semester: 'Fall 2026',
    status: 'active',
    studentsCount: 45,
    creditHours: 4,
    recentActivity: 'Lecture 08 completed',
    recentActivityTime: 'Yesterday, 01:05 PM',
    lastLectureDate: '16 Sep 2026',
    color: 'border-indigo-500 text-indigo-700 bg-indigo-50'
  },
  {
    id: 'cs7-pdc',
    code: 'CS7 — PDC',
    title: 'Parallel and Distributed Computing',
    name: 'Parallel and Distributed Computing',
    section: 'Section F',
    instructor: 'Dr. Hajra Murtaza',
    semester: 'Fall 2026',
    status: 'active',
    studentsCount: 42,
    creditHours: 3,
    recentActivity: 'Lecture 02 uploaded & assignment queued',
    recentActivityTime: 'Today, 10:15 AM',
    lastLectureDate: '19 Sep 2026',
    color: 'border-purple-500 text-purple-700 bg-purple-50'
  }
];

// Aliases for compatibility
export const mockCourses: Course[] = coursesData;
export const TEACHER_ASSIGNED_COURSES: Course[] = coursesData;
