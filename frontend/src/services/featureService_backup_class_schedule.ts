
import { api } from './api';

export interface WeekExpectation {
  week: number;
  topic: string;
  due_date?: string | null;
  expected?: boolean;
  lecture_completed?: boolean;
  assignment_completed?: boolean;
  uploaded_at?: string | null;
  status?: string;
}

export interface ReminderRecord {
  id: number;
  course: string;
  week?: number | null;
  title: string;
  message: string;
  status: string;
  due_at?: string | null;
  snoozed_until?: string | null;
  created_at: string;
}

export interface CourseSetupUploadJob {
  job_id: string;
  course: string;
  status:
    | 'awaiting_approval'
    | 'approved'
    | 'running'
    | 'completed'
    | 'failed';
  uploads?: Array<{
    resource: string;
    filename: string;
    status: string;
    message?: string;
  }>;
  message?: string;
  error?: string;
}

export const featureService = {
  setup: (course: string) =>
    api.get<any>('/setup/status', { params: { course } }),

  uploadOutline: (course: string, file: File) => {
    const form = new FormData();
    form.append('course', course);
    form.append('file', file);
    return api.postForm<any>('/ai/outlines/upload', form);
  },

  previewTimetable: (course: string, file: File) => {
    const form = new FormData();
    form.append('course', course);
    form.append('file', file);
    return api.postForm<any>('/setup/timetable/preview', form);
  },

  confirmTimetable: (course: string, weeks: WeekExpectation[], file: File) => {
    const form = new FormData();
    form.append('course', course);
    form.append('weeks', JSON.stringify(weeks));
    form.append('timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
    form.append('file', file);
    return api.postForm<any>('/setup/timetable/confirm', form);
  },

  saveFolder: (course: string, folder_path: string) =>
    api.put<any>('/setup/folder', { course, folder_path }),

  scanFolder: (course: string) =>
    api.post<any>('/setup/folder/scan', undefined, {
      params: { course },
    }),

  confirmCandidate: (id: number) =>
    api.post<any>(`/setup/folder/candidates/${id}/confirm`, {}),

  weekly: (course: string) =>
    api.get<any>('/tracker/weekly', { params: { course } }),

  saveWeekly: (course: string, weeks: WeekExpectation[]) =>
    api.put<any>('/tracker/weekly', { course, weeks }),

  reminders: (course: string) =>
    api.get<any>('/reminders', { params: { course } }),

  reminderAction: (id: number, action: string, until?: string) =>
    api.post<any>(`/reminders/${id}`, { action, until }),

  // Prepare saved outline and timetable for teacher approval.
  prepareSavedMoellimDocuments: (course: string) => {
    const form = new FormData();
    form.append('course', course);
    return api.postForm<CourseSetupUploadJob>(
      '/setup/moellim/prepare-saved',
      form,
    );
  },

  // Prepare both documents for teacher review (legacy upload flow).
  prepareMoellimDocuments: (
    course: string,
    outlineFile: File,
    timetableFile: File,
  ) => {
    const form = new FormData();
    form.append('course', course);
    form.append('outline_file', outlineFile);
    form.append('timetable_file', timetableFile);

    return api.postForm<CourseSetupUploadJob>(
      '/setup/moellim/prepare',
      form,
    );
  },

  // Teacher approval is a separate action.
  approveMoellimDocuments: (jobId: string) =>
    api.post<CourseSetupUploadJob>(
      `/setup/moellim/${encodeURIComponent(jobId)}/approve`,
      {},
    ),

  // Execute only after approval.
  executeMoellimDocuments: (jobId: string) =>
    api.post<CourseSetupUploadJob>(
      `/setup/moellim/${encodeURIComponent(jobId)}/execute`,
      {},
    ),

  // Retrieve the current job status.
  moellimDocumentStatus: (jobId: string) =>
    api.get<CourseSetupUploadJob>(
      `/setup/moellim/${encodeURIComponent(jobId)}`,
    ),
};
