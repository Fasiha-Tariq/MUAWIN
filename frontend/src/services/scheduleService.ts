import { ClassScheduleItem, DetectedAction } from '../types';
import { scheduleData, ScheduleDataRecord, mockLectureSessionContent, CourseLectureSessionContent } from '../data/scheduleData';
import { api, USE_MOCK_API } from './api';

export type { CourseLectureSessionContent };

// Re-export for compatibility
export const MOCK_TEACHER_SCHEDULE = scheduleData;
export const MOCK_CLASS_CONTENT = mockLectureSessionContent;

/**
 * SCHEDULE SERVICE
 *
 * Provides teacher class timetable and Class Mode scheduling hooks.
 *
 * Current: Mock Data Layer (scheduleData.ts)
 * Future: GET /api/schedule (Timetable extracted via Moellim session)
 */
export const scheduleService = {
  /**
   * Retrieves full timetable schedule for the teacher.
   * Future endpoint: GET /api/schedule
   */
  async getSchedule(): Promise<ScheduleDataRecord[]> {
    if (!USE_MOCK_API) {
      try {
        const response = await api.get<ScheduleDataRecord[]>('/schedule');
        return response.data;
      } catch (err) {
        console.warn('Backend unavailable, falling back to mock schedule', err);
      }
    }
    await new Promise((res) => setTimeout(res, 100));
    return [...scheduleData];
  },

  /**
   * Retrieves the next upcoming class.
   */
  async getUpcomingClass(): Promise<ScheduleDataRecord | null> {
    const schedule = await this.getSchedule();
    if (!schedule || schedule.length === 0) return null;
    // Return the upcoming or first active schedule record
    return schedule[0] || null;
  },

  /**
   * Retrieves today's schedule.
   */
  async getTodaySchedule(): Promise<ScheduleDataRecord[]> {
    return this.getSchedule();
  },

  /**
   * Synchronous getter for current timetable items
   */
  getTeacherSchedule(): ClassScheduleItem[] {
    return [...scheduleData];
  },

  /**
   * Returns the course lecture content for a given course
   */
  getClassContent(courseId: string): CourseLectureSessionContent {
    return mockLectureSessionContent[courseId] || mockLectureSessionContent['cs6-ai'];
  },

  /**
   * Calculates the status of a schedule item relative to simulated current time (in minutes from midnight)
   * 
   * Timing rules:
   * - 5 minutes before scheduled start time: 'upcoming_warning'
   * - At or between start and end time: 'live' (ACTIVE)
   * - At or after end time: 'ended'
   * - Otherwise: 'idle'
   */
  calculateStatus(
    item: ClassScheduleItem, 
    currentMinutes: number, 
    manualOverrideStopped: boolean
  ): {
    status: 'idle' | 'upcoming_warning' | 'live' | 'ended';
    minutesUntilStart: number;
    minutesUntilEnd: number;
  } {
    const minutesUntilStart = item.startMinutes - currentMinutes;
    const minutesUntilEnd = item.endMinutes - currentMinutes;

    if (manualOverrideStopped) {
      return { status: 'ended', minutesUntilStart, minutesUntilEnd };
    }

    if (currentMinutes >= item.startMinutes && currentMinutes < item.endMinutes) {
      return { status: 'live', minutesUntilStart, minutesUntilEnd };
    }

    if (currentMinutes >= item.endMinutes) {
      return { status: 'ended', minutesUntilStart, minutesUntilEnd };
    }

    // 5 minutes warning window (5 minutes before up to start time)
    if (minutesUntilStart > 0 && minutesUntilStart <= 5) {
      return { status: 'upcoming_warning', minutesUntilStart, minutesUntilEnd };
    }

    return { status: 'idle', minutesUntilStart, minutesUntilEnd };
  },

  /**
   * Utility to format minutes into 12-hour AM/PM string
   */
  formatMinutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60) % 24;
    const mins = Math.floor(minutes % 60);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 === 0 ? 12 : hours % 12;
    return `${displayHours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')} ${period}`;
  }
};

export const getSchedule = () => scheduleService.getSchedule();
export const getUpcomingClass = () => scheduleService.getUpcomingClass();
export const getTodaySchedule = () => scheduleService.getTodaySchedule();
export default scheduleService;
