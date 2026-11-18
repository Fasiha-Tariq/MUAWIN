import { Course } from '../types';
import { teacherData } from '../data/teacherData';
import { coursesData } from '../data/coursesData';
import { courseSyllabusLecturesData } from '../data/lectureData';
import { teacherService, AuthenticatedTeacherProfile } from './teacherService';
import { courseService } from './courseService';
import { lectureService } from './lectureService';

export type { AuthenticatedTeacherProfile };

export interface CourseLecture {
  id: string;
  lectureNumber: number;
  topic: string;
  date: string;
  status: 'Completed' | 'Upcoming' | 'Draft';
  hasTranscription: boolean;
  tasksExtracted: number;
  summary: string;
}

export const AUTHENTICATED_TEACHER: AuthenticatedTeacherProfile = {
  teacherId: teacherData.id,
  name: teacherData.name,
  username: teacherData.username,
  email: teacherData.email,
  department: teacherData.department,
  faculty: teacherData.faculty,
  role: teacherData.role
};

export const TEACHER_ASSIGNED_COURSES: Course[] = coursesData;

/**
 * Composite bridge service maintaining backwards compatibility
 * with existing components while pointing to the new service layer.
 */
export const teacherCourseService = {
  async getTeacherAssignedCourses(): Promise<Course[]> {
    return courseService.getCourses();
  },

  getAuthenticatedTeacher(): AuthenticatedTeacherProfile {
    return AUTHENTICATED_TEACHER;
  },

  async getCourseLectures(courseId: string): Promise<CourseLecture[]> {
    return lectureService.getCourseLectures(courseId) as Promise<CourseLecture[]>;
  }
};

export default teacherCourseService;
