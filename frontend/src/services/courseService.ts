import { Course } from '../types';
import { coursesData, CourseDataRecord } from '../data/coursesData';
import { api, USE_MOCK_API } from './api';

/**
 * COURSE SERVICE
 *
 * Provides courses assigned to Dr. Hajra Murtaza on Moellim.
 *
 * Current: Mock Data Layer (Artificial Intelligence, HCI, Machine Learning, PDC)
 * Future:
 *   GET /api/courses
 *   GET /api/courses/:id
 */
export const courseService = {
  /**
   * Retrieves all courses assigned to the current teacher.
   * Future endpoint: GET /api/courses
   */
  async getCourses(): Promise<CourseDataRecord[]> {
    if (!USE_MOCK_API) {
      try {
        const response = await api.get<CourseDataRecord[]>('/courses');
        return response.data;
      } catch (err) {
        console.warn('Backend unavailable, falling back to mock courses data', err);
      }
    }
    await new Promise((res) => setTimeout(res, 120));
    return [...coursesData];
  },

  /**
   * Retrieves a specific course by ID.
   * Future endpoint: GET /api/courses/:id
   */
  async getCourseById(id: string): Promise<CourseDataRecord | undefined> {
    if (!USE_MOCK_API) {
      try {
        const response = await api.get<CourseDataRecord>(`/courses/${id}`);
        return response.data;
      } catch (err) {
        console.warn(`Backend unavailable for course ${id}, falling back to mock`, err);
      }
    }
    await new Promise((res) => setTimeout(res, 80));
    return coursesData.find((course) => course.id === id);
  },

  /**
   * Synchronous getter for immediate render contexts
   */
  getCoursesSync(): CourseDataRecord[] {
    return [...coursesData];
  },

  /**
   * Backward compatibility alias
   */
  async getTeacherAssignedCourses(): Promise<Course[]> {
    return this.getCourses();
  }
};

export const getCourses = () => courseService.getCourses();
export const getCourseById = (id: string) => courseService.getCourseById(id);
export default courseService;
