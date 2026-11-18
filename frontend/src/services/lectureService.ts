import { LectureSessionData, DetectedAction } from '../types';
import { 
  lectureFilesData, 
  courseSyllabusLecturesData, 
  LectureFileRecord, 
  CourseLectureSyllabusItem 
} from '../data/lectureData';
import { sampleLectureSession } from '../data/mockData';
import { api, USE_MOCK_API } from './api';

export type { LectureFileRecord, CourseLectureSyllabusItem };

/**
 * LECTURE SERVICE
 *
 * Provides lecture files, syllabus items, and handles live lecture transcription sessions.
 *
 * Current: Mock Data Layer (lectureData.ts)
 * Future:
 *   GET /api/courses/:id/lectures
 *   POST /api/lecture/start
 *   POST /api/lecture/verify
 */
export const lectureService = {
  /**
   * Retrieves lecture files for a course or all courses.
   * Future endpoint: GET /api/courses/:courseId/lectures
   */
  async getLectures(courseId?: string): Promise<LectureFileRecord[]> {
    if (!USE_MOCK_API && courseId) {
      try {
        const response = await api.get<LectureFileRecord[]>(`/courses/${courseId}/lectures`);
        return response.data;
      } catch (err) {
        console.warn(`Backend unavailable for lectures of ${courseId}, falling back to mock`, err);
      }
    }
    await new Promise((res) => setTimeout(res, 120));
    if (courseId) {
      return lectureFilesData.filter((lec) => lec.courseId === courseId);
    }
    return [...lectureFilesData];
  },

  /**
   * Retrieves a single lecture file record by id.
   */
  async getLectureById(id: string): Promise<LectureFileRecord | undefined> {
    await new Promise((res) => setTimeout(res, 80));
    return lectureFilesData.find((lec) => lec.id === id);
  },

  /**
   * Retrieves syllabus lectures for a specific course.
   */
  async getCourseLectures(courseId: string): Promise<CourseLectureSyllabusItem[]> {
    await new Promise((res) => setTimeout(res, 100));
    return courseSyllabusLecturesData[courseId] || [];
  },

  /**
   * Initiates a live lecture recording session (Class Mode).
   * Future endpoint: POST /api/lecture/start
   */
  async startLectureSession(
    courseId: string, 
    courseName: string, 
    section: string, 
    topic: string
  ): Promise<LectureSessionData> {
    await new Promise((res) => setTimeout(res, 300));

    return {
      id: 'lec-' + Date.now(),
      courseId,
      courseName,
      section,
      lectureNumber: 8,
      topic: topic || 'Usability Principles & Heuristic Evaluation',
      startTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      durationSeconds: 1458,
      status: 'live',
      transcriptChunks: [...sampleLectureSession.transcriptChunks],
      extractedTopics: [...sampleLectureSession.extractedTopics],
      keyPoints: [...sampleLectureSession.keyPoints],
      detectedActions: [...sampleLectureSession.detectedActions]
    };
  },

  /**
   * Teacher verification of extracted lecture topics, key points, and tasks.
   * Future endpoint: POST /api/lecture/verify
   */
  async verifyAndSaveLecture(session: LectureSessionData): Promise<{ success: boolean; session: LectureSessionData }> {
    await new Promise((res) => setTimeout(res, 400));
    return {
      success: true,
      session: {
        ...session,
        status: 'verified'
      }
    };
  }
};

export const getLectures = (courseId?: string) => lectureService.getLectures(courseId);
export const getLectureById = (id: string) => lectureService.getLectureById(id);
export const getCourseLectures = (courseId: string) => lectureService.getCourseLectures(courseId);
export default lectureService;
