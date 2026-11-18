export type UserRole = 'Course Instructor' | 'Department Coordinator' | 'Administrator';

export interface UserProfile {
  id: string;
  name: string;
  username: string;
  department: string;
  role: UserRole;
  faculty: string;
  avatarUrl?: string;
  email: string;
  moellimConnected: boolean;
  lastActive: string;
}

export interface Course {
  id: string;
  code: string;
  title: string;
  section: string;
  semester: string;
  studentsCount: number;
  creditHours: number;
  recentActivity: string;
  recentActivityTime: string;
  lastLectureDate?: string;
  color: string;
}

export type WorkflowStatus = 
  | 'idle' 
  | 'understanding' 
  | 'planned' 
  | 'waiting_approval' 
  | 'approved' 
  | 'executing' 
  | 'verifying' 
  | 'completed' 
  | 'failed' 
  | 'rejected';

export type ActionType = 
  | 'Create Assignment' 
  | 'Create Reminder' 
  | 'Upload Lecture Notes' 
  | 'Update Attendance' 
  | 'Mark Lecture Completed'
  | 'Schedule Quiz';

export interface WorkflowStep {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  timestamp?: string;
  moellimTarget?: string;
}

export interface WorkflowPayload {
  title?: string;
  description?: string;
  questions?: string[];
  dueDate?: string;
  reminderDate?: string;
  targetGroup?: string;
  message?: string;
  totalMarks?: number;
  submissionType?: string;
  allowLateSubmissions?: boolean;
  fileAttachment?: string;
  fileSize?: string;
  targetSection?: string;
  lectureTopic?: string;
  date?: string;
  status?: string;
  duration?: string;
  [key: string]: any;
}

export interface AssignmentPayload extends WorkflowPayload {
  title: string;
  description: string;
  questions: string[];
  dueDate: string;
  totalMarks: number;
  submissionType: string;
  allowLateSubmissions: boolean;
}

export interface ReminderPayload extends WorkflowPayload {
  title: string;
  targetGroup: string;
  reminderDate: string;
  message: string;
}

export interface WorkflowItem {
  id: string;
  title: string;
  actionType: ActionType;
  workflowType?: 'lecture' | 'assignment';

  courseId: string;

  courseCode: string;

  courseName: string;

  source: string;

  requestedBy:
    | 'Teacher Instruction'
    | 'Lecture Analysis'
    | 'Automated Detection';

  createdAt: string;

  status: WorkflowStatus;

  currentStepIndex: number;

  steps: WorkflowStep[];

  instructionText?: string;

  detectedIntent?: {
    intent: string;
    course: string;
    source: string;
    action: string;
    confidence: number;
  };

  payload?: WorkflowPayload;

  verificationResult?: {
    verifiedAt: string;
    moellimUrl?: string;
    verificationStatus: 'Verified' | 'Unverified';
    notes: string;
  };
}

export interface DetectedAction {
  id: string;
  type: ActionType;
  topic: string;
  dueDateCandidate?: string;
  description: string;
  confidence: number;
  status: 'pending_review' | 'converted_to_workflow' | 'dismissed';
}

export interface ClassScheduleItem {
  id: string;
  courseId: string;
  courseCode: string;
  courseTitle: string;
  section: string;
  dayOfWeek: string;
  startTime: string; // e.g. "10:00 AM"
  endTime: string;   // e.g. "11:30 AM"
  startMinutes: number; // minutes from midnight (e.g. 600 for 10:00 AM)
  endMinutes: number;   // minutes from midnight (e.g. 690 for 11:30 AM)
  room: string;
  lectureNumber: number;
  topic: string;
  semester: string;
}

export type ClassModeStatus = 'idle' | 'upcoming_warning' | 'live' | 'ended';

export interface ClassModeState {
  currentClass: ClassScheduleItem | null;
  status: ClassModeStatus;
  warningDismissed: boolean;
  manualOverrideStopped: boolean;
  autoStarted: boolean;
  startedAt: string | null;
  scheduledEndTime: string | null;
  elapsedSeconds: number;
  isListening: boolean;
  transcripts: {
    id: string;
    timestamp: string;
    speaker: string;
    text: string;
  }[];
  extractedTopics: string[];
  keyPoints: string[];
  importantConcepts: string[];
  detectedActions: DetectedAction[];
  endedAt: string | null;
  stoppedReason: 'scheduled_end' | 'manual_stop' | null;
}

export interface LectureSessionData {
  id: string;
  courseId: string;
  courseName: string;
  section: string;
  lectureNumber: number;
  topic: string;
  startTime: string;
  durationSeconds: number;
  status: 'scheduled' | 'live' | 'paused' | 'ended' | 'verified';
  transcriptChunks: {
    id: string;
    timestamp: string;
    speaker: string;
    text: string;
  }[];
  extractedTopics: string[];
  keyPoints: string[];
  detectedActions: DetectedAction[];
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  courseCode: string;
  courseTitle: string;
  action: string;
  workflowName: string;
  status: 'Completed' | 'Verified' | 'Pending' | 'Failed';
  operator: string;
  details: string;
  moellimRef?: string;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: number;
}
