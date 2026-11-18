import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import {
  UserProfile,
  Course,
  WorkflowItem,
  ActivityLog,
  LectureSessionData,
  ToastMessage,
  ClassScheduleItem,
  ClassModeStatus,
  DetectedAction,
} from '../types';

import { sampleLectureSession } from '../data/mockData';
import { teacherData } from '../data/teacherData';
import { scheduleData } from '../data/scheduleData';

import {
  scheduleService,
  CourseLectureSessionContent,
} from '../services/scheduleService';

import { workflowService } from '../services/workflowService';
import { api } from '../services/api';

/*
|--------------------------------------------------------------------------
| MUAWIN STORAGE VERSION
|--------------------------------------------------------------------------
*/

const MUAWIN_STORAGE_VERSION = 'real-backend-v4';

/*
|--------------------------------------------------------------------------
| STORAGE HELPERS
|--------------------------------------------------------------------------
|
| User-specific workflow/activity storage prevents one teacher's
| browser data from appearing under another teacher's login.
|
*/

const getTeacherStorageKey = (
  baseKey: string,
  username?: string | null
) => {
  if (!username) {
    return baseKey;
  }

  return `${baseKey}_${username.trim()}`;
};

/*
|--------------------------------------------------------------------------
| RESTORE USER
|--------------------------------------------------------------------------
|
| IMPORTANT:
| We require both:
| - muawin_user
| - muawin_auth_token
|
| This prevents restoring a teacher profile without a valid
| MUAWIN backend session token.
|
*/

const getStoredUser = (): UserProfile | null => {
  try {
    const storedUser = localStorage.getItem(
      'muawin_user'
    );

    const authToken = localStorage.getItem(
      'muawin_auth_token'
    );

    if (!storedUser || !authToken) {
      return null;
    }

    const parsed = JSON.parse(storedUser);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed as UserProfile;
  } catch (error) {
    console.warn(
      '[AppContext] Could not restore authenticated user:',
      error
    );

    return null;
  }
};

/*
|--------------------------------------------------------------------------
| RESTORE COURSES
|--------------------------------------------------------------------------
*/

const getStoredCourses = (): Course[] => {
  try {
    const storedUser = getStoredUser();

    if (!storedUser) {
      return [];
    }

    const savedCourses = localStorage.getItem(
      'muawin_courses'
    );

    if (!savedCourses) {
      return [];
    }

    const parsed = JSON.parse(savedCourses);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    return [];
  } catch (error) {
    console.warn(
      '[AppContext] Could not restore Moellim courses:',
      error
    );

    return [];
  }
};

/*
|--------------------------------------------------------------------------
| CONTEXT TYPE
|--------------------------------------------------------------------------
*/

interface AppContextType {
  user: UserProfile | null;

  courses: Course[];

  coursesLoading: boolean;

  selectedCourseId: string | null;

  selectedCourse: Course | null;

  selectCourse: (courseId: string | null) => void;

  workflows: WorkflowItem[];

  activityLogs: ActivityLog[];

  currentLectureSession: LectureSessionData | null;

  toasts: ToastMessage[];

  demoMode: boolean;

  setDemoMode: (val: boolean) => void;

  login: (
    username: string,
    password: string,
    rememberMe?: boolean
  ) => Promise<boolean>;

  logout: () => void;

  addToast: (
    type: 'success' | 'info' | 'warning' | 'error',
    title: string,
    message: string
  ) => void;

  dismissToast: (id: string) => void;

  addWorkflow: (
    workflow: WorkflowItem
  ) => Promise<WorkflowItem | null>;

  getWorkflowById: (
    id: string
  ) => WorkflowItem | undefined;

  approveWorkflow: (
    id: string
  ) => Promise<void>;

  rejectWorkflow: (
    id: string,
    reason?: string
  ) => Promise<void>;

  executeWorkflowDirectly: (
    id: string,
    onProgress?: (
      step: number,
      msg: string
    ) => void
  ) => Promise<boolean>;

  startLecture: (
    courseId?: string,
    section?: string,
    topic?: string
  ) => void;

  updateLectureSession: (
    session: Partial<LectureSessionData>
  ) => void;

  endLectureSession: () => void;

  verifyAndSaveLecture: (
    session: LectureSessionData,
    createWorkflowsFromTasks?: boolean
  ) => void;

  teacherSchedule: ClassScheduleItem[];

  activeScheduleClass: ClassScheduleItem;

  selectScheduleClass: (
    scheduleId: string
  ) => void;

  simulatedMinutes: number;

  simulatedTimeString: string;

  setSimulatedMinutes: (
    mins: number
  ) => void;

  jumpSimulatedPreset: (
    preset:
      | 'warning_5min'
      | 'class_start'
      | 'mid_lecture'
      | 'class_end'
      | 'next_class'
  ) => void;

  classModeStatus: ClassModeStatus;

  upcomingWarningActive: boolean;

  dismissUpcomingWarning: () => void;

  manualOverrideStopped: boolean;

  stopClassModeManual: () => void;

  resumeClassModeManual: () => void;

  activeClassContent: CourseLectureSessionContent;

  stageClassModeAction: (
    action: DetectedAction
  ) => void;

  elapsedLectureSeconds: number;

  stats: {
    activeCourses: number;
    pendingApprovals: number;
    completedWorkflows: number;
    lecturesProcessed: number;
  };
}

const AppContext =
  createContext<AppContextType | undefined>(
    undefined
  );

/*
|--------------------------------------------------------------------------
| APP PROVIDER
|--------------------------------------------------------------------------
*/

export const AppProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  // ============================================================
  // USER
  // ============================================================

  const [user, setUser] =
    useState<UserProfile | null>(() => {
      return getStoredUser();
    });

  // ============================================================
  // COURSES
  // ============================================================

  const [courses, setCourses] =
    useState<Course[]>(() => {
      return getStoredCourses();
    });

  const [
    coursesLoading,
    setCoursesLoading,
  ] = useState<boolean>(() => {
    const storedUser = getStoredUser();
    const storedCourses = getStoredCourses();

    /*
     * If both user and courses were successfully restored,
     * the application already has its roster.
     */
    return (
      !!storedUser &&
      storedCourses.length === 0
    );
  });

  // ============================================================
  // SELECTED COURSE
  // ============================================================

  const [
    selectedCourseId,
    setSelectedCourseId,
  ] = useState<string | null>(() => {
    try {
      return (
        localStorage.getItem(
          'muawin_selected_course'
        ) || null
      );
    } catch {
      return null;
    }
  });

  const selectedCourse = useMemo(() => {
    if (!selectedCourseId) {
      return courses[0] || null;
    }

    return (
      courses.find(
        (course) =>
          course.id === selectedCourseId
      ) ||
      courses[0] ||
      null
    );
  }, [
    courses,
    selectedCourseId,
  ]);

  const selectCourse = (
    courseId: string | null
  ) => {
    setSelectedCourseId(courseId);

    try {
      if (courseId) {
        localStorage.setItem(
          'muawin_selected_course',
          courseId
        );
      } else {
        localStorage.removeItem(
          'muawin_selected_course'
        );
      }
    } catch (error) {
      console.warn(
        '[AppContext] Could not save selected course:',
        error
      );
    }
  };

  // ============================================================
  // COURSE SYNCHRONIZATION
  // ============================================================
  //
  // IMPORTANT FIX:
  //
  // DO NOT do:
  //
  // if (!user) {
  //   setCourses([]);
  // }
  //
  // React can temporarily have user === null while restoring
  // localStorage during a page refresh.
  //
  // Clearing courses here caused:
  //
  // "Showing your 0 assigned courses"
  //
  // after reload.
  //
  // Courses are now cleared ONLY by logout().
  // ============================================================

  useEffect(() => {
    /*
     * User may temporarily be null during React initialization.
     *
     * Do NOT clear courses.
     */
    if (!user) {
      return;
    }

    /*
     * If no courses exist yet, login may still be committing
     * the live Moellim roster.
     */
    if (courses.length === 0) {
      setCoursesLoading(false);
      return;
    }

    let storedCourseId: string | null = null;

    try {
      storedCourseId =
        localStorage.getItem(
          'muawin_selected_course'
        );
    } catch {
      storedCourseId = null;
    }

    const courseExists =
      !!storedCourseId &&
      courses.some(
        (course) =>
          course.id === storedCourseId
      );

    const validCourseId =
      courseExists
        ? storedCourseId
        : courses[0].id;

    if (
      selectedCourseId !==
      validCourseId
    ) {
      setSelectedCourseId(
        validCourseId
      );
    }

    try {
      localStorage.setItem(
        'muawin_selected_course',
        validCourseId
      );
    } catch {}

    setCoursesLoading(false);
  }, [
    user,
    courses,
    selectedCourseId,
  ]);

  // ============================================================
  // ACTIVITY LOGS
  // ============================================================

  const [
    activityLogs,
    setActivityLogs,
  ] = useState<ActivityLog[]>(() => {
    try {
      const storedUser =
        getStoredUser();

      const storageKey =
        getTeacherStorageKey(
          'muawin_activity_logs',
          storedUser?.username
        );

      const saved =
        localStorage.getItem(
          storageKey
        );

      if (saved) {
        const parsed =
          JSON.parse(saved);

        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      console.warn(
        '[AppContext] Could not restore activity logs:',
        error
      );
    }

    return [];
  });

  // ============================================================
  // WORKFLOWS
  // ============================================================

  const [
    workflows,
    setWorkflows,
  ] = useState<WorkflowItem[]>(() => {
    try {
      const storedUser =
        getStoredUser();

      const storageKey =
        getTeacherStorageKey(
          'muawin_workflows',
          storedUser?.username
        );

      const storedVersion =
        localStorage.getItem(
          'muawin_storage_version'
        );

      if (
        storedVersion !==
        MUAWIN_STORAGE_VERSION
      ) {
        /*
         * Only clear the CURRENT teacher's workflow data.
         */
        if (storedUser?.username) {
          localStorage.removeItem(
            storageKey
          );
        }

        localStorage.setItem(
          'muawin_storage_version',
          MUAWIN_STORAGE_VERSION
        );

        return [];
      }

      const saved =
        localStorage.getItem(
          storageKey
        );

      if (!saved) {
        return [];
      }

      const parsed =
        JSON.parse(saved);

      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.filter(
        (workflow: WorkflowItem) =>
          !workflow.id.startsWith(
            'local-'
          ) &&
          !workflow.id.startsWith(
            'wf-lec-'
          )
      );
    } catch (error) {
      console.warn(
        '[AppContext] Could not restore workflows:',
        error
      );

      return [];
    }
    
  });
    // Keep the latest workflows available to polling
// without restarting the polling effect on every update.
      const workflowsRef = useRef(workflows);
      workflowsRef.current = workflows;
  // ============================================================
  // AUTOMATIC CLASS MODE
  // ============================================================

  const teacherSchedule =
    scheduleData;

  const [
    activeScheduleId,
    setActiveScheduleId,
  ] = useState<string>(
    'sched-ai-01'
  );

  const [
    simulatedMinutes,
    setSimulatedMinutes,
  ] = useState<number>(595);

  const [
    warningDismissed,
    setWarningDismissed,
  ] = useState<boolean>(false);

  const [
    manualOverrideStopped,
    setManualOverrideStopped,
  ] = useState<boolean>(false);

  const [
    elapsedLectureSeconds,
    setElapsedLectureSeconds,
  ] = useState<number>(0);

  const activeScheduleClass =
    useMemo(() => {
      return (
        teacherSchedule.find(
          (s) =>
            s.id ===
            activeScheduleId
        ) ||
        teacherSchedule[0]
      );
    }, [
      teacherSchedule,
      activeScheduleId,
    ]);

  const simulatedTimeString =
    useMemo(() => {
      return scheduleService.formatMinutesToTime(
        simulatedMinutes
      );
    }, [
      simulatedMinutes,
    ]);

  const timing =
    useMemo(() => {
      return scheduleService.calculateStatus(
        activeScheduleClass,
        simulatedMinutes,
        manualOverrideStopped
      );
    }, [
      activeScheduleClass,
      simulatedMinutes,
      manualOverrideStopped,
    ]);

  const classModeStatus: ClassModeStatus =
    timing.status;

  const upcomingWarningActive =
    classModeStatus ===
      'upcoming_warning' &&
    !warningDismissed;

  const activeClassContent =
    useMemo(() => {
      return scheduleService.getClassContent(
        activeScheduleClass.courseId
      );
    }, [
      activeScheduleClass.courseId,
    ]);

  const selectScheduleClass = (
    scheduleId: string
  ) => {
    setActiveScheduleId(
      scheduleId
    );

    const target =
      teacherSchedule.find(
        (s) =>
          s.id === scheduleId
      );

    if (target) {
      setSelectedCourseId(
        target.courseId
      );

      setWarningDismissed(
        false
      );

      setManualOverrideStopped(
        false
      );

      setSimulatedMinutes(
        target.startMinutes - 5
      );

      setElapsedLectureSeconds(
        0
      );
    }
  };

  // ============================================================
  // CLASS MODE TIMER
  // ============================================================

  useEffect(() => {
    let interval: ReturnType<
      typeof setInterval
    > | null = null;

    if (
      classModeStatus ===
      'live'
    ) {
      interval =
        setInterval(() => {
          setElapsedLectureSeconds(
            (prev) =>
              prev + 1
          );
        }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(
          interval
        );
      }
    };
  }, [
    classModeStatus,
  ]);

  // ============================================================
  // TOASTS
  // ============================================================

  const [
    toasts,
    setToasts,
  ] = useState<ToastMessage[]>([]);

  const addToast = (
    type:
      | 'success'
      | 'info'
      | 'warning'
      | 'error',
    title: string,
    message: string
  ) => {
    const newToast: ToastMessage = {
      id:
        'toast-' +
        Date.now() +
        Math.random()
          .toString(36)
          .substring(
            2,
            5
          ),

      type,

      title,

      message,

      timestamp:
        Date.now(),
    };

    setToasts((prev) => [
      ...prev,
      newToast,
    ]);

    setTimeout(() => {
      setToasts((prev) =>
        prev.filter(
          (t) =>
            t.id !==
            newToast.id
        )
      );
    }, 4500);
  };

  const dismissToast = (
    id: string
  ) => {
    setToasts((prev) =>
      prev.filter(
        (t) =>
          t.id !== id
      )
    );
  };

  // ============================================================
  // CLASS MODE STATUS NOTIFICATIONS
  // ============================================================

  const prevStatusRef =
    useRef<ClassModeStatus>(
      classModeStatus
    );

  useEffect(() => {
    const prev =
      prevStatusRef.current;

    if (
      prev !==
      classModeStatus
    ) {
      if (
        classModeStatus ===
          'live' &&
        prev !== 'live'
      ) {
        addToast(
          'info',
          'Class Mode Started Automatically',
          `Class Mode is now LIVE for ${activeScheduleClass.courseCode} (${activeScheduleClass.section}). Continuous speech-to-text transcription active.`
        );
      } else if (
        classModeStatus ===
          'ended' &&
        prev === 'live' &&
        !manualOverrideStopped
      ) {
        addToast(
          'warning',
          'Class Session Ended',
          `Your ${activeScheduleClass.courseCode} (${activeScheduleClass.section}) session has ended at ${activeScheduleClass.endTime}. Audio capture concluded.`
        );
      }

      prevStatusRef.current =
        classModeStatus;
    }
  }, [
    classModeStatus,
    activeScheduleClass,
    manualOverrideStopped,
  ]);

  const dismissUpcomingWarning =
    () => {
      setWarningDismissed(
        true
      );
    };

  const stopClassModeManual =
    () => {
      setManualOverrideStopped(
        true
      );

      addToast(
        'warning',
        'Class Mode Stopped',
        'Lecture capture stopped early by teacher override.'
      );
    };

  const resumeClassModeManual =
    () => {
      setManualOverrideStopped(
        false
      );

      addToast(
        'success',
        'Class Mode Resumed',
        'Live audio capture and transcription resumed.'
      );
    };

  const jumpSimulatedPreset = (
    preset:
      | 'warning_5min'
      | 'class_start'
      | 'mid_lecture'
      | 'class_end'
      | 'next_class'
  ) => {
    if (
      preset ===
      'warning_5min'
    ) {
      setSimulatedMinutes(
        activeScheduleClass.startMinutes -
          5
      );

      setWarningDismissed(
        false
      );

      setManualOverrideStopped(
        false
      );

      setElapsedLectureSeconds(
        0
      );

      addToast(
        'info',
        'Simulated Time: 5-Minute Warning',
        `Clock set to ${scheduleService.formatMinutesToTime(
          activeScheduleClass.startMinutes -
            5
        )}. Upcoming class alert active.`
      );
    } else if (
      preset ===
      'class_start'
    ) {
      setSimulatedMinutes(
        activeScheduleClass.startMinutes
      );

      setManualOverrideStopped(
        false
      );

      setElapsedLectureSeconds(
        30
      );

      addToast(
        'success',
        'Simulated Time: Class Start (Auto-Start)',
        `Clock set to ${activeScheduleClass.startTime}. Class Mode automatically transitions to LIVE.`
      );
    } else if (
      preset ===
      'mid_lecture'
    ) {
      setSimulatedMinutes(
        activeScheduleClass.startMinutes +
          35
      );

      setManualOverrideStopped(
        false
      );

      setElapsedLectureSeconds(
        35 * 60
      );

      addToast(
        'info',
        'Simulated Time: Mid-Lecture (Live)',
        'Clock set to active lecture session. Continuous transcription & academic actions displayed.'
      );
    } else if (
      preset ===
      'class_end'
    ) {
      setSimulatedMinutes(
        activeScheduleClass.endMinutes
      );

      setManualOverrideStopped(
        false
      );

      addToast(
        'warning',
        'Simulated Time: Class End (Auto-Stop)',
        `Clock reached ${activeScheduleClass.endTime}. Class Mode automatically stops.`
      );
    } else if (
      preset ===
      'next_class'
    ) {
      const currentIndex =
        teacherSchedule.findIndex(
          (s) =>
            s.id ===
            activeScheduleId
        );

      const nextIndex =
        (currentIndex + 1) %
        teacherSchedule.length;

      const nextSched =
        teacherSchedule[
          nextIndex
        ];

      setActiveScheduleId(
        nextSched.id
      );

      setSelectedCourseId(
        nextSched.courseId
      );

      setSimulatedMinutes(
        nextSched.startMinutes -
          5
      );

      setWarningDismissed(
        false
      );

      setManualOverrideStopped(
        false
      );

      setElapsedLectureSeconds(
        0
      );

      addToast(
        'info',
        'Next Scheduled Class',
        `Switched to ${nextSched.courseCode} (${nextSched.section}) at ${nextSched.startTime}.`
      );
    }
  };

  // ============================================================
  // CLASS MODE DETECTED ACTION
  // ============================================================

  const stageClassModeAction = (
    action: DetectedAction
  ) => {
    const newWorkflow: WorkflowItem = {
      id:
        `wf-cm-${Date.now()}`,

      title:
        `${activeScheduleClass.courseCode}: ${action.topic}`,

      actionType:
        action.type,

      courseId:
        activeScheduleClass.courseId,

      courseCode:
        activeScheduleClass.courseCode,

      courseName:
        activeScheduleClass.courseTitle,

      source:
        `Class Mode Lecture ${activeScheduleClass.lectureNumber} (Live Timetable Session)`,

      requestedBy:
        'Lecture Analysis',

      createdAt:
        new Date().toLocaleTimeString(
          [],
          {
            hour: '2-digit',
            minute: '2-digit',
          }
        ),

      status:
        'waiting_approval',

      currentStepIndex: 4,

      steps: [
        {
          id: 1,
          title:
            'In-Class Audio Capture',
          description:
            'Captured instructor verbal directive from timetable lecture audio',
          status:
            'completed',
        },

        {
          id: 2,
          title:
            'Semantic Intent & Topic Parsing',
          description:
            `Parsed ${action.type}: "${action.topic}"`,
          status:
            'completed',
        },

        {
          id: 3,
          title:
            'Resolve Target Roster',
          description:
            `Bound to ${activeScheduleClass.courseCode} (${activeScheduleClass.section})`,
          status:
            'completed',
        },

        {
          id: 4,
          title:
            'Synthesize Moellim Payload',
          description:
            'Prepared assignment/reminder payload for LMS integration',
          status:
            'completed',
        },

        {
          id: 5,
          title:
            'Teacher Human Authorization',
          description:
            'Teacher Approval required before committing changes to Moellim',
          status:
            'in_progress',
        },
      ],

      detectedIntent: {
        intent:
          action.type,

        course:
          `${activeScheduleClass.courseCode} (${activeScheduleClass.section})`,

        source:
          `Class Mode Lecture ${activeScheduleClass.lectureNumber}`,

        action:
          `Publish ${action.type} to Moellim LMS`,

        confidence:
          action.confidence,
      },

      payload: {
        title:
          action.topic,

        dueDate:
          action.dueDateCandidate ||
          'Upcoming Friday, 11:59 PM',

        description:
          action.description,

        targetSection:
          activeScheduleClass.section,

        totalMarks:
          action.type ===
          'Create Assignment'
            ? 20
            : undefined,

        submissionType:
          action.type ===
          'Create Assignment'
            ? 'Online File submission (PDF/Code)'
            : undefined,

        allowLateSubmissions:
          false,
      },
    };

    setWorkflows((prev) => [
      newWorkflow,
      ...prev,
    ]);

    const newLog: ActivityLog = {
      id:
        `log-cm-${Date.now()}`,

      timestamp:
        'Today, ' +
        new Date().toLocaleTimeString(
          [],
          {
            hour: '2-digit',
            minute: '2-digit',
          }
        ),

      courseCode:
        activeScheduleClass.courseCode,

      courseTitle:
        activeScheduleClass.courseTitle,

      action:
        `${action.type} Staged`,

      workflowName:
        'Class Mode Automated Extraction',

      status:
        'Completed',

      operator:
        `${user?.name || 'MUAWIN Agent'} (Class Mode)`,

      details:
        `Extracted from lecture audio: ${action.topic}. Staged into Approvals for teacher sign-off.`,

      moellimRef:
        `MOEL-CM-${Math.floor(
          1000 +
            Math.random() *
              9000
        )}`,
    };

    setActivityLogs(
      (prev) => [
        newLog,
        ...prev,
      ]
    );

    addToast(
      'success',
      'Directive Staged for Approval',
      `"${action.topic}" has been added to your Teacher Approvals queue.`
    );
  };

  // ============================================================
  // LECTURE SESSION
  // ============================================================

  const [
    currentLectureSession,
    setCurrentLectureSession,
  ] =
    useState<LectureSessionData | null>(
      sampleLectureSession
    );

  const [
    demoMode,
    setDemoMode,
  ] =
    useState<boolean>(false);

  // ============================================================
  // LOCAL STORAGE — USER-SCOPED
  // ============================================================

  useEffect(() => {
    try {
      if (!user?.username) {
        return;
      }

      const storageKey =
        getTeacherStorageKey(
          'muawin_workflows',
          user.username
        );

      localStorage.setItem(
        storageKey,
        JSON.stringify(
          workflows
        )
      );
    } catch (error) {
      console.warn(
        '[AppContext] Could not save workflows:',
        error
      );
    }
  }, [
    workflows,
    user?.username,
  ]);

  useEffect(() => {
    try {
      if (!user?.username) {
        return;
      }

      const storageKey =
        getTeacherStorageKey(
          'muawin_activity_logs',
          user.username
        );

      localStorage.setItem(
        storageKey,
        JSON.stringify(
          activityLogs
        )
      );
    } catch (error) {
      console.warn(
        '[AppContext] Could not save activity logs:',
        error
      );
    }
  }, [
    activityLogs,
    user?.username,
  ]);

  // ============================================================
  // LOGIN — REAL DYNAMIC MOELLIM AUTHENTICATION
  // ============================================================

  const login = async (
    username: string,
    password: string,
    rememberMe = false
  ): Promise<boolean> => {
    const cleanUsername =
      username.trim();

    if (
      !cleanUsername ||
      !password
    ) {
      throw new Error(
        'Moellim username and password are required.'
      );
    }

    setCoursesLoading(true);

    console.log(
      '[AppContext] Authenticating dynamically with Moellim...',
      cleanUsername
    );

    try {
      /*
       * The username/password belong to the teacher who is
       * currently logging in.
       *
       * No teacher ID is hardcoded.
       */

      const response =
        await api.post(
          '/auth/login',
          {
            username:
              cleanUsername,

            password,
          }
        );

      const data =
        response.data;

      if (
        !data ||
        data.authenticated !== true
      ) {
        throw new Error(
          data?.detail ||
            'Moellim authentication failed.'
        );
      }

      // ========================================================
      // AUTH TOKEN
      // ========================================================

      const authToken =
        data.auth_token;

      if (
        !authToken ||
        typeof authToken !==
          'string'
      ) {
        throw new Error(
          'MUAWIN backend did not return an authentication token.'
        );
      }

      /*
       * The password is NEVER stored in localStorage.
       *
       * Only the backend-generated session token is stored.
       */
      localStorage.setItem(
        'muawin_auth_token',
        authToken
      );

      // ========================================================
      // BUILD DYNAMIC USER PROFILE
      // ========================================================

      const updatedUser: UserProfile = {
        id:
          `moellim-${cleanUsername}`,

        /*
         * Prefer the actual name returned by Moellim.
         *
         * Fall back to username rather than a hardcoded teacher.
         */
        name:
          data.name ||
          cleanUsername,

        username:
          cleanUsername,

        /*
         * These fields are UI metadata only.
         * Use backend values when available.
         */
        department:
          data.department ||
          teacherData.department,

        role:
          (data.role ||
            teacherData.role) as any,

        faculty:
          data.faculty ||
          teacherData.faculty,

        email:
          data.email ||
          '',

        moellimConnected:
          true,

        lastActive:
          'Just now',
      };

      // ========================================================
      // CONVERT LIVE MOELLIM COURSES
      // ========================================================

      const liveCourses: Course[] =
        Array.isArray(data.courses)
          ? data.courses.map(
              (
                course: any,
                index: number
              ) => {
                const courseName =
                  (
                    course.name ||
                    `Moellim Course ${
                      index + 1
                    }`
                  ).trim();

                const match =
                  course.href?.match(
                    /[?&]id=(\d+)/
                  );

                const moellimCourseId =
                  match?.[1] ||
                  `${index + 1}`;

                return {
                  id:
                    `moellim-${moellimCourseId}`,

                  code:
                    courseName,

                  title:
                    courseName,

                  section:
                    '',

                  semester:
                    'Current Semester',

                  studentsCount:
                    0,

                  creditHours:
                    0,

                  recentActivity:
                    'Available on Moellim',

                  recentActivityTime:
                    'Just now',

                  lastLectureDate:
                    undefined,

                  color:
                    'blue',
                };
              }
            )
          : [];

      if (
        liveCourses.length === 0
      ) {
        throw new Error(
          'Moellim login succeeded, but no enrolled courses were found.'
        );
      }

      const firstCourseId =
        liveCourses[0].id;

      // ========================================================
      // TEACHER SWITCH PROTECTION
      // ========================================================

      const previousUsername =
        user?.username;

      if (
        previousUsername &&
        previousUsername !==
          cleanUsername
      ) {
        console.log(
          `[AppContext] Switching teacher from ${previousUsername} to ${cleanUsername}.`
        );
      }

      /*
       * Start the new teacher with the workflow/activity state
       * belonging to that teacher.
       *
       * First try to restore that teacher's local history.
       */

      let restoredWorkflows: WorkflowItem[] =
        [];

      let restoredActivityLogs: ActivityLog[] =
        [];

      try {
        const workflowStorageKey =
          getTeacherStorageKey(
            'muawin_workflows',
            cleanUsername
          );

        const activityStorageKey =
          getTeacherStorageKey(
            'muawin_activity_logs',
            cleanUsername
          );

        const savedWorkflows =
          localStorage.getItem(
            workflowStorageKey
          );

        const savedActivityLogs =
          localStorage.getItem(
            activityStorageKey
          );

        if (savedWorkflows) {
          const parsed =
            JSON.parse(
              savedWorkflows
            );

          if (Array.isArray(parsed)) {
            restoredWorkflows =
              parsed.filter(
                (
                  workflow: WorkflowItem
                ) =>
                  !workflow.id.startsWith(
                    'local-'
                  ) &&
                  !workflow.id.startsWith(
                    'wf-lec-'
                  )
              );
          }
        }

        if (savedActivityLogs) {
          const parsed =
            JSON.parse(
              savedActivityLogs
            );

          if (Array.isArray(parsed)) {
            restoredActivityLogs =
              parsed;
          }
        }
      } catch (error) {
        console.warn(
          '[AppContext] Could not restore teacher-specific history:',
          error
        );
      }

      // ========================================================
      // PERSIST AUTHENTICATED SESSION
      // ========================================================

      /*
       * IMPORTANT:
       *
       * We keep the authenticated teacher and course roster in
       * localStorage so a browser refresh does NOT turn:
       *
       * "12 assigned courses"
       *
       * into:
       *
       * "0 assigned courses".
       *
       * The rememberMe flag is retained for compatibility with
       * the login UI, but the active MUAWIN session must remain
       * restorable across normal page reloads.
       */

      try {
        localStorage.setItem(
          'muawin_user',
          JSON.stringify(
            updatedUser
          )
        );

        localStorage.setItem(
          'muawin_courses',
          JSON.stringify(
            liveCourses
          )
        );

        localStorage.setItem(
          'muawin_selected_course',
          firstCourseId
        );

        localStorage.setItem(
          'muawin_storage_version',
          MUAWIN_STORAGE_VERSION
        );
      } catch (error) {
        console.warn(
          '[AppContext] Could not persist login state:',
          error
        );
      }

      // ========================================================
      // COMMIT AUTHENTICATED STATE
      // ========================================================

      console.log(
        '[MUAWIN FRONTEND] Authenticated teacher:',
        cleanUsername
      );

      console.log(
        '[MUAWIN FRONTEND] liveCourses:',
        liveCourses
      );

      console.log(
        '[MUAWIN FRONTEND] liveCourses.length:',
        liveCourses.length
      );

      console.log(
        '[MUAWIN FRONTEND] firstCourseId:',
        firstCourseId
      );

      setUser(
        updatedUser
      );

      setCourses(
        liveCourses
      );

      setSelectedCourseId(
        firstCourseId
      );

      setWorkflows(
        restoredWorkflows
      );

      setActivityLogs(
        restoredActivityLogs
      );

      setCoursesLoading(
        false
      );

      addToast(
        'success',
        'Authenticated',
        `Welcome back, ${updatedUser.name}`
      );

      console.log(
        '[AppContext] Dynamic Moellim authentication successful.'
      );

      console.log(
        `[AppContext] ${liveCourses.length} courses loaded for ${cleanUsername}.`
      );

      return true;
    } catch (error) {
      setCoursesLoading(false);

      /*
       * If login failed, remove only the invalid token.
       */
      try {
        localStorage.removeItem(
          'muawin_auth_token'
        );
      } catch {}

      throw error;
    }
  };

  // ============================================================
  // DEBUG — COURSE STATE
  // ============================================================

  // ============================================================
  // BACKEND WORKFLOW SYNCHRONIZATION
  // ============================================================

  // Poll only while an assignment is waiting for a lecture
  // dependency. The interval does not depend on workflows,
  // so state updates cannot repeatedly restart the timer.

  useEffect(() => {
    if (!user?.id && !user?.username) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const hasPendingAssignmentDependency =
        workflowsRef.current.some((workflow) => {
          const workflowType = String(
            (workflow as any).workflowType ||
              (workflow as any).workflow_type ||
              (workflow as any).actionType ||
              ''
          ).toLowerCase();

          const isAssignment =
            workflowType === 'assignment' ||
            workflowType === 'create_assignment' ||
            String(workflow.id || '').startsWith('awf-');

          if (!isAssignment) {
            return false;
          }

          const status = String(
            workflow.status || ''
          ).toLowerCase();

          const dependencyStatus = String(
            (workflow as any).dependency?.status || ''
          ).toLowerCase();

          return (
            status === 'waiting_for_lecture' ||
            status === 'preparing' ||
            dependencyStatus === 'waiting_for_lecture'
          );
        });

      if (hasPendingAssignmentDependency) {
        void refreshBackendWorkflows();
      }
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [user?.id, user?.username]);

  // Perform one initial sync when the teacher is authenticated.
  useEffect(() => {
    if (!user?.id && !user?.username) {
      return;
    }

    void refreshBackendWorkflows();
  }, [user?.id, user?.username]);
  // ============================================================
  // LOGOUT
  // ============================================================

  const logout = () => {
    const currentUsername =
      user?.username;

    console.log(
      '[AppContext] Logging out:',
      currentUsername ||
        'unknown teacher'
    );

    /*
     * Remove the frontend bearer token.
     *
     * This prevents subsequent workflow requests from being
     * authenticated as the previous teacher.
     */
    try {
      localStorage.removeItem(
        'muawin_auth_token'
      );
    } catch {}

    /*
     * Clear ACTIVE in-memory state.
     */
    setUser(null);

    setCourses([]);

    setSelectedCourseId(
      null
    );

    setWorkflows([]);

    setActivityLogs([]);

    setCoursesLoading(
      false
    );

    /*
     * Remove the current authentication snapshot.
     *
     * Teacher-specific workflow/activity history remains
     * stored under the teacher's username.
     */
    try {
      localStorage.removeItem(
        'muawin_user'
      );

      localStorage.removeItem(
        'muawin_courses'
      );

      localStorage.removeItem(
        'muawin_selected_course'
      );
    } catch {}

    addToast(
      'info',
      'Logged Out',
      'You have been signed out of MUAWIN.'
    );
  };

  // ============================================================
  // REAL BACKEND WORKFLOW CREATION
  // ============================================================
// ============================================================
// REAL BACKEND WORKFLOW CREATION
// ============================================================
//
// ROUTING:
// - lecture    -> /api/workflows/prepare
// - assignment -> /api/assignment-workflows/prepare
//
// This is intentionally handled here so every frontend entry
// point uses the correct backend workflow type.
// ============================================================

const addWorkflow = async (
  newWf: WorkflowItem
): Promise<WorkflowItem | null> => {
  try {
    if (!user) {
      throw new Error(
        'You must be logged in before creating a workflow.'
      );
    }

    /*
     * ----------------------------------------------------------
     * EXTRACT ORIGINAL TEACHER INSTRUCTION
     * ----------------------------------------------------------
     *
     * IMPORTANT:
     * For assignment workflows, the backend parser needs the
     * original natural-language instruction.
     *
     * Example:
     *
     * "Create a 5 marks assignment for CS7 MUAWIN (Female),
     *  Week 4, titled..."
     *
     * Do NOT reconstruct this from the workflow title because
     * that can lose important parameters such as:
     * - deadline
     * - question count
     * - question type
     * - source lecture
     */

    const instruction =
      newWf.instructionText ||
      String(
        (
          newWf.payload as any
        )?.instruction ||
        newWf.detectedIntent?.rawInstruction ||
        newWf.detectedIntent?.action ||
        newWf.title ||
        ''
      );

    if (!instruction.trim()) {
      throw new Error(
        'No teacher instruction was found for this workflow.'
      );
    }

    /*
     * ----------------------------------------------------------
     * DETERMINE WORKFLOW TYPE
     * ----------------------------------------------------------
     *
     * Assistant.tsx already provides workflowType inside
     * the payload:
     *
     * payload.workflowType = "lecture" | "assignment"
     *
     * We also check actionType/title as defensive fallbacks.
     */

    const payload =
      (newWf.payload || {}) as Record<
        string,
        any
      >;

    
      const explicitWorkflowType = String(
        payload.workflowType ||
          (newWf as any).workflowType ||
          (newWf as any).workflow_type ||
          ''
      ).toLowerCase();

      const actionText = [
        newWf.actionType || '',
        newWf.title || '',
        newWf.instructionText || '',
        payload.instruction || '',
        newWf.detectedIntent?.intent || '',
        newWf.detectedIntent?.action || '',
        newWf.detectedIntent?.rawInstruction || '',
      ].join(' ').toLowerCase();

      const hasLectureUpload =
        /\b(upload|uploading|attach|add)\b[\s\S]{0,50}\blecture\b/.test(actionText) ||
        /\blecture\b[\s\S]{0,50}\b(upload|uploading)\b/.test(actionText);

      const hasAssignmentCreation =
        /\b(create|make|generate|prepare|add|publish)\b[\s\S]{0,50}\b(assignments?|quizzes?)\b/.test(actionText) ||
        /\b(assignments?|quizzes?)\b[\s\S]{0,50}\b(create|make|generate|prepare|publish)\b/.test(actionText);

      const isCombinedWorkflow =
        explicitWorkflowType === 'combined' ||
        explicitWorkflowType === 'combined_workflow' ||
        (
          hasLectureUpload &&
          hasAssignmentCreation
        );

      const isAssignmentWorkflow =
        !isCombinedWorkflow &&
        (
          explicitWorkflowType === 'assignment' ||
          explicitWorkflowType === 'create_assignment' ||
          actionText.includes('assignment')
        );

      const isLectureWorkflow =
        !isCombinedWorkflow &&
        (
          explicitWorkflowType === 'lecture' ||
          hasLectureUpload ||
          actionText.includes('lecture upload')
        );

      console.log('[AppContext] Workflow routing:', {
        explicitWorkflowType,
        actionType: newWf.actionType,
        title: newWf.title,
        hasLectureUpload,
        hasAssignmentCreation,
        isCombinedWorkflow,
        isAssignmentWorkflow,
        isLectureWorkflow,
      });

    /*
     * ----------------------------------------------------------
     * BUILD COMMON PAYLOAD
     * ----------------------------------------------------------
     */

    const workflowPayload = {
      ...payload,
      instruction,
    };
    
    /*
    * COMBINED LECTURE + ASSIGNMENT WORKFLOW
    *
    * The workflow service routes this to:
    * /api/combined-workflows/prepare
    */
    if (isCombinedWorkflow) {
      console.log(
        '[AppContext] Routing COMBINED workflow to backend:',
        user.username
      );

      const combinedPayload = {
        ...workflowPayload,
        workflowType: 'combined',
      };

      const backendWorkflow =
        await workflowService.createWorkflow({
          ...newWf,
          instructionText: instruction,
          payload: combinedPayload,
          workflowType: 'combined',
        } as WorkflowItem);

      if (!backendWorkflow?.id) {
        throw new Error(
          'MUAWIN combined-workflow backend did not return a valid workflow.'
        );
      }

      console.log(
        '[AppContext] REAL combined workflow created:',
        backendWorkflow.id
      );

      setWorkflows((prev) => [
        backendWorkflow,
        ...prev.filter(
          (workflow) =>
            workflow.id !== backendWorkflow.id
        ),
      ]);

      addToast(
        'info',
        'Combined Workflow Prepared',
        'The lecture upload and assignment draft are ready for teacher review.'
      );

      return backendWorkflow;
    }
    /*
     * ----------------------------------------------------------
     * ASSIGNMENT WORKFLOW
     * ----------------------------------------------------------
     *
     * IMPORTANT:
     *
     * Assignment workflows MUST NOT go through
     * workflowService.createWorkflow().
     *
     * They have their own backend lifecycle:
     *
     * prepare -> approve -> execute
     *
     * and their own ID prefix:
     *
     * awf-xxxxxxxxxx
     */

    if (
      isAssignmentWorkflow &&
      !isLectureWorkflow
    ) {
      console.log(
        '[AppContext] Routing ASSIGNMENT workflow to dedicated assignment backend:',
        user.username
      );

      console.log(
        '[AppContext] Assignment instruction:',
        instruction
      );

      const response =
        await api.post(
          '/assignment-workflows/prepare',
          {
            instruction,
            workflow: {
              ...newWf,
              instructionText:
                instruction,
              payload:
                workflowPayload,
            },
          }
        );

      const backendWorkflow =
        response.data;

      if (
        !backendWorkflow ||
        !backendWorkflow.id
      ) {
        throw new Error(
          'MUAWIN assignment backend did not return a valid workflow.'
        );
      }

      console.log(
        '[AppContext] REAL assignment workflow created:',
        backendWorkflow.id
      );

      /*
       * Safety check:
       *
       * An assignment workflow must receive an awf- ID.
       * If the backend accidentally returns wf-, we stop here
       * rather than allowing a lecture workflow to execute.
       */

      if (
        !String(
          backendWorkflow.id
        ).startsWith('awf-')
      ) {
        throw new Error(
          `Backend returned an invalid assignment workflow ID: ${backendWorkflow.id}`
        );
      }

      setWorkflows((prev) => [
        backendWorkflow,

        ...prev.filter(
          (w) =>
            w.id !==
            backendWorkflow.id
        ),
      ]);

      addToast(
        'info',
        'Assignment Prepared',
        `Assignment "${backendWorkflow.title}" is ready for teacher review.`
      );

      return backendWorkflow;
    }

    /*
     * ----------------------------------------------------------
     * LECTURE / GENERAL WORKFLOW
     * ----------------------------------------------------------
     *
     * Existing lecture behavior remains unchanged.
     */

    if (
      isLectureWorkflow ||
      !explicitWorkflowType
    ) {
      console.log(
        '[AppContext] Routing LECTURE/GENERAL workflow to backend:',
        user.username
      );

      const backendWorkflow =
        await workflowService.createWorkflow(
          {
            ...newWf,

            instructionText:
              instruction,

            payload:
              workflowPayload,
          }
        );

      if (
        !backendWorkflow ||
        !backendWorkflow.id
      ) {
        throw new Error(
          'MUAWIN backend did not return a valid workflow.'
        );
      }

      console.log(
        '[AppContext] REAL backend workflow created:',
        backendWorkflow.id
      );

      setWorkflows((prev) => [
        backendWorkflow,

        ...prev.filter(
          (w) =>
            w.id !==
            backendWorkflow.id
        ),
      ]);

      addToast(
        'info',
        'Workflow Prepared',
        `Workflow "${backendWorkflow.title}" is ready for teacher review.`
      );

      return backendWorkflow;
    }

    /*
     * ----------------------------------------------------------
     * UNKNOWN WORKFLOW TYPE
     * ----------------------------------------------------------
     *
     * Do not silently send an unknown workflow to the lecture
     * endpoint. That could create the same type of bug we just
     * found.
     */

    throw new Error(
      `MUAWIN could not determine the workflow type for "${newWf.title}".`
    );
  } catch (error: any) {
    console.error(
      '[AppContext] Failed to create backend workflow:',
      error
    );

    addToast(
      'error',
      'Workflow Preparation Failed',
      error?.message ||
        'MUAWIN could not prepare the workflow.'
    );

    return null;
  }
};

  // ============================================================
  // GET WORKFLOW
  // ============================================================

  const getWorkflowById = (
    id: string
  ) => {
    return workflows.find(
      (w) => w.id === id
    );
  };

  // ============================================================
  // REAL BACKEND APPROVAL
  // ============================================================

  const approveWorkflow =
    async (
      id: string
    ): Promise<void> => {
      const targetWorkflow =
        workflows.find(
          (w) => w.id === id
        );

      if (!targetWorkflow) {
        throw new Error(
          `Workflow ${id} was not found.`
        );
      }

      if (
        id.startsWith(
          'wf-cm-'
        )
      ) {
        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  status:
                    'approved',
                }
              : w
          )
        );

        addToast(
          'success',
          'Workflow Approved',
          'Class Mode proposal approved locally for the current demo workflow.'
        );

        return;
      }

      if (
        id.startsWith(
          'local-'
        ) ||
        id.startsWith(
          'wf-lec-'
        )
      ) {
        throw new Error(
          'This workflow is frontend-only and is not connected to the MUAWIN backend.'
        );
      }

      try {
        console.log(
          `[AppContext] Calling REAL backend approval for ${id}`
        );

        const payload =
          (targetWorkflow.payload ||
            {}) as Record<
            string,
            any
          >;

        const approvalData: Record<
          string,
          any
        > = {};

        if (
          typeof payload.heading ===
            'string' &&
          payload.heading.trim()
        ) {
          approvalData.heading =
            payload.heading;
        }

        if (
          typeof payload.description ===
            'string' &&
          payload.description.trim()
        ) {
          approvalData.description =
            payload.description;
        }

        if (
          Array.isArray(
            payload.key_points
          )
        ) {
          approvalData.key_points =
            payload.key_points;
        }
        
      const combinedDraft =
        payload.combinedDraft || {};

      const assignmentDraft =
        combinedDraft.assignment || {};

      const assignmentTitle =
        payload.assignment_title ||
        payload.assignmentTitle ||
        assignmentDraft.title;

      const assignmentDescription =
        payload.assignment_description ||
        payload.assignmentDescription ||
        assignmentDraft.description;

      if (
        typeof assignmentTitle === 'string' &&
        assignmentTitle.trim()
      ) {
        approvalData.assignment_title =
          assignmentTitle;
      }

      if (
        typeof assignmentDescription === 'string' &&
        assignmentDescription.trim()
      ) {
        approvalData.assignment_description =
          assignmentDescription;
      }
        const approvedWorkflow =
  await workflowService.approveWorkflow(
    id,
    approvalData,
    targetWorkflow
  );
        if (
          !approvedWorkflow
        ) {
          throw new Error(
            'Backend did not return the approved workflow.'
          );
        }

        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === id
              ? approvedWorkflow
              : w
          )
        );

        addToast(
          'success',
          'Workflow Approved',
          'Action authorized. Ready for controlled browser execution on Moellim.'
        );
      } catch (error: any) {
        console.error(
          `[AppContext] Approval failed for ${id}:`,
          error
        );

        addToast(
          'error',
          'Approval Failed',
          error?.message ||
            'MUAWIN could not approve the workflow.'
        );

        throw error;
      }
    };

const refreshBackendWorkflows = async () => {
  if (!user?.id && !user?.username) {
    return;
  }

  try {
    // Use the existing service to normalize backend data
    // into the WorkflowItem structure used by the frontend.
    const backendWorkflows =
      await workflowService.getWorkflows();

    console.log(
      '[AppContext] Backend workflows received:',
      backendWorkflows.length
    );

    setWorkflows((current) => {
      const backendById = new Map<string, WorkflowItem>();

      backendWorkflows.forEach((workflow) => {
        if (workflow?.id) {
          backendById.set(workflow.id, workflow);
        }
      });

      // Refresh matching workflows while preserving
      // useful frontend-only fields.
      const merged = current.map((workflow) => {
        const backendWorkflow = backendById.get(workflow.id);

        if (!backendWorkflow) {
          return workflow;
        }

        return {
          ...workflow,
          ...backendWorkflow,
          payload:
            backendWorkflow.payload ?? workflow.payload,
          steps:
            backendWorkflow.steps ?? workflow.steps,
          detectedIntent:
            backendWorkflow.detectedIntent ??
            workflow.detectedIntent,
        };
      });

      // Add backend workflows that are not in frontend state.
      const existingIds = new Set(
        current.map((workflow) => workflow.id)
      );

      const newBackendWorkflows = backendWorkflows.filter(
        (workflow) =>
          workflow?.id && !existingIds.has(workflow.id)
      );

      return [...newBackendWorkflows, ...merged];
    });
  } catch (error) {
    console.error(
      '[AppContext] Failed to refresh backend workflows:',
      error
    );
  }
};
  // ============================================================
  // REAL BACKEND REJECTION
  // ============================================================

  const rejectWorkflow =
    async (
      id: string,
      reason?: string
    ): Promise<void> => {
      const targetWorkflow =
        workflows.find(
          (w) => w.id === id
        );

      if (!targetWorkflow) {
        return;
      }

      if (
        id.startsWith(
          'wf-cm-'
        )
      ) {
        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  status:
                    'rejected',
                }
              : w
          )
        );

        addToast(
          'warning',
          'Workflow Rejected',
          'The Class Mode proposal was dismissed.'
        );

        return;
      }

      if (
        id.startsWith(
          'local-'
        ) ||
        id.startsWith(
          'wf-lec-'
        )
      ) {
        addToast(
          'warning',
          'Local Workflow',
          'This old frontend-only workflow was dismissed.'
        );

        setWorkflows((prev) =>
          prev.filter(
            (w) =>
              w.id !== id
          )
        );

        return;
      }

      try {
        const rejectedWorkflow =
          await workflowService.rejectWorkflow(
            id,
            reason
          );

        if (
          rejectedWorkflow
        ) {
          setWorkflows((prev) =>
            prev.map((w) =>
              w.id === id
                ? rejectedWorkflow
                : w
            )
          );
        } else {
          setWorkflows((prev) =>
            prev.map((w) =>
              w.id === id
                ? {
                    ...w,
                    status:
                      'rejected',
                  }
                : w
            )
          );
        }

        addToast(
          'warning',
          'Workflow Rejected',
          'The proposed workflow was dismissed and will not run on Moellim.'
        );
      } catch (error: any) {
        console.error(
          `[AppContext] Rejection failed for ${id}:`,
          error
        );

        addToast(
          'error',
          'Rejection Failed',
          error?.message ||
            'MUAWIN could not reject the workflow.'
        );

        throw error;
      }
    };

  // ============================================================
  // REAL PLAYWRIGHT EXECUTION
  // ============================================================

  const executeWorkflowDirectly =
    async (
      id: string,
      onProgress?: (
        step: number,
        msg: string
      ) => void
    ): Promise<boolean> => {
      let targetWorkflow =
        workflows.find(
          (w) => w.id === id
        );

      if (!targetWorkflow) {
        addToast(
          'error',
          'Workflow Not Found',
          `MUAWIN could not find workflow ${id}.`
        );

        return false;
      }

      if (
        id.startsWith(
          'wf-cm-'
        )
      ) {
        addToast(
          'warning',
          'Class Mode Workflow',
          'Class Mode backend execution is not connected yet.'
        );

        return false;
      }

      if (
        id.startsWith(
          'local-'
        ) ||
        id.startsWith(
          'wf-lec-'
        )
      ) {
        addToast(
          'error',
          'Backend Workflow Required',
          'This workflow is not connected to the real Moellim automation backend.'
        );

        return false;
      }

      try {
        if (
          !user
        ) {
          throw new Error(
            'Your MUAWIN session has expired. Please log in again.'
          );
        }

        /*
         * Ensure a bearer token still exists before attempting
         * backend execution.
         */
        const authToken =
          localStorage.getItem(
            'muawin_auth_token'
          );

        if (!authToken) {
          throw new Error(
            'Your MUAWIN authentication session is no longer available. Please log in again.'
          );
        }

if (
  targetWorkflow.status ===
  'waiting_approval'
) {
  onProgress?.(
    0,
    'Confirming teacher approval with MUAWIN backend...'
  );

  const payload =
    (targetWorkflow.payload ||
      {}) as Record<
      string,
      any
    >;

  const approvalData: Record<
    string,
    any
  > = {};

  if (
    typeof payload.heading ===
      'string' &&
    payload.heading.trim()
  ) {
    approvalData.heading =
      payload.heading;
  }

  if (
    typeof payload.description ===
      'string' &&
    payload.description.trim()
  ) {
    approvalData.description =
      payload.description;
  }

  if (
    Array.isArray(
      payload.key_points
    )
  ) {
    approvalData.key_points =
      payload.key_points;
  }

  const approvedWorkflow =
    await workflowService.approveWorkflow(
      id,
      approvalData,
      targetWorkflow
    );

  if (
    !approvedWorkflow
  ) {
    throw new Error(
      'The MUAWIN backend did not confirm teacher approval.'
    );
  }

  targetWorkflow =
    approvedWorkflow;

  setWorkflows((prev) =>
    prev.map((w) =>
      w.id === id
        ? approvedWorkflow
        : w
    )
  );
}

        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  status:
                    'running',
                }
              : w
          )
        );

        onProgress?.(
          0,
          'Executing approved MUAWIN workflow...'
        );

        const result =
          await workflowService.executeWorkflow(
            targetWorkflow,
            (
              step,
              msg
            ) => {
              onProgress?.(
                step,
                msg
              );
            }
          );

        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === id
              ? result.updatedWorkflow
              : w
          )
        );

        if (
          result.success &&
          result.verificationLog
        ) {
          setActivityLogs((prev) => {
            if (
              prev.some(
                (log) =>
                  log.id ===
                  result
                    .verificationLog
                    .id
              )
            ) {
              return prev;
            }

            return [
              result.verificationLog,
              ...prev,
            ];
          });
        }

        if (
          result.success
        ) {
          addToast(
            'success',
            'Execution Completed',
            `Successfully published and verified on Moellim (${result.updatedWorkflow.courseName}).`
          );

          return true;
        }

        addToast(
          'warning',
          'Execution Completed',
          'The browser workflow completed, but Moellim verification was not confirmed.'
        );

        return false;
      } catch (error: any) {
        console.error(
          `[AppContext] Execution failed for ${id}:`,
          error
        );

        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === id
              ? {
                  ...w,
                  status:
                    'failed',
                }
              : w
          )
        );

        onProgress?.(
          5,
          `Execution failed: ${
            error?.message ||
            'Unknown error'
          }`
        );

        addToast(
          'error',
          'Execution Error',
          error?.message ||
            'Moellim browser automation failed. Please retry.'
        );

        return false;
      }
    };

  // ============================================================
  // LECTURE
  // ============================================================

  const startLecture = (
    courseId?: string,
    section?: string,
    topic?: string
  ) => {
    const targetCourseId =
      courseId ||
      selectedCourseId ||
      courses[0]?.id;

    const course =
      courses.find(
        (c) =>
          c.id ===
          targetCourseId
      ) ||
      courses[0];

    if (!course) {
      return;
    }

    const newSession: LectureSessionData =
      {
        id:
          'lec-' +
          Date.now(),

        courseId:
          course.id,

        courseName:
          `${course.code} — ${course.title}`,

        section:
          section ||
          course.section,

        lectureNumber:
          8,

        topic:
          topic ||
          `${course.title} Advanced Topics`,

        startTime:
          new Date().toLocaleTimeString(
            [],
            {
              hour: '2-digit',
              minute: '2-digit',
            }
          ),

        durationSeconds:
          15,

        status:
          'live',

        transcriptChunks: [
          {
            id:
              'chunk-1',

            timestamp:
              '00:00:10',

            speaker:
              user?.name ||
              'MUAWIN Teacher',

            text:
              `Welcome students to ${course.title} (${course.section}). Today we are exploring core methodologies and syllabus commitments.`,
          },
        ],

        extractedTopics: [
          course.title,
          'Methodological Principles',
          'Assessment Guidelines',
        ],

        keyPoints: [
          `Active lab participation is mandatory for all students enrolled in ${course.code}.`,
          'Ensure timely submission of upcoming homework modules on Moellim.',
        ],

        detectedActions: [
          {
            id:
              'da-' +
              Date.now(),

            type:
              'Create Assignment',

            topic:
              `${course.title} Comprehensive Evaluation Assignment`,

            dueDateCandidate:
              '28 September 2026',

            description:
              `Formulate a structured analysis report for ${course.code} covering discussed principles.`,

            confidence:
              0.95,

            status:
              'pending_review',
          },
        ],
      };

    setCurrentLectureSession(
      newSession
    );

    addToast(
      'info',
      'Lecture Session Started',
      `Now capturing audio for ${course.code} (${course.section}).`
    );
  };

  const updateLectureSession =
    (
      updates: Partial<LectureSessionData>
    ) => {
      setCurrentLectureSession(
        (prev) =>
          prev
            ? {
                ...prev,
                ...updates,
              }
            : null
      );
    };

  const endLectureSession =
    () => {
      if (
        currentLectureSession
      ) {
        setCurrentLectureSession({
          ...currentLectureSession,
          status:
            'ended',
        });

        addToast(
          'info',
          'Lecture Session Concluded',
          'Audio capture finalized. Ready for teacher verification.'
        );
      }
    };

  // ============================================================
  // LECTURE VERIFICATION
  // ============================================================

  const verifyAndSaveLecture =
    (
      session: LectureSessionData,
      createWorkflowsFromTasks = true
    ) => {
      const nowStr =
        'Today, ' +
        new Date().toLocaleTimeString(
          [],
          {
            hour: '2-digit',
            minute: '2-digit',
          }
        );

      const lectureLog: ActivityLog =
        {
          id:
            'log-' +
            Date.now(),

          timestamp:
            nowStr,

          courseCode:
            session.courseName.split(
              ' — '
            )[0] ||
            'Course',

          courseTitle:
            session.courseName.split(
              ' — '
            )[1] ||
            'Lecture',

          action:
            'Lecture Processed',

          workflowName:
            `Lecture Session Workflow (Lecture 0${session.lectureNumber})`,

          status:
            'Verified',

          operator:
            `${
              user?.name ||
              'MUAWIN Teacher'
            } (Verified)`,

          details:
            `Lecture verified: ${session.extractedTopics.length} topics, ${session.keyPoints.length} key points, ${session.detectedActions.length} actions confirmed.`,

          moellimRef:
            'LMS-LEC-' +
            Math.floor(
              1000 +
                Math.random() *
                  9000
            ),
        };

      setActivityLogs(
        (prev) => [
          lectureLog,
          ...prev,
        ]
      );

      if (
        createWorkflowsFromTasks &&
        session.detectedActions
          .length > 0
      ) {
        session.detectedActions.forEach(
          (task) => {
            const wfId =
              'wf-' +
              Math.floor(
                1000 +
                  Math.random() *
                    9000
              );

            const newWorkflow: WorkflowItem =
              {
                id: wfId,

                title:
                  `${task.type}: ${task.topic}`,

                actionType:
                  task.type,

                courseId:
                  session.courseId,

                courseCode:
                  session.courseName.split(
                    ' — '
                  )[0] ||
                  'Course',

                courseName:
                  session.courseName.split(
                    ' — '
                  )[1] ||
                  'Lecture',

                source:
                  `Lecture 0${session.lectureNumber} Verified Transcript`,

                requestedBy:
                  'Lecture Analysis',

                createdAt:
                  nowStr,

                status:
                  'waiting_approval',

                currentStepIndex:
                  4,

                instructionText:
                  task.description,

                detectedIntent:
                  {
                    intent:
                      task.type,

                    course:
                      session.courseName,

                    source:
                      `Lecture 0${session.lectureNumber}`,

                    action:
                      `Create ${task.type} on Moellim based on verified lecture session`,

                    confidence:
                      task.confidence,
                  },

                steps: [
                  {
                    id: 1,

                    title:
                      'Extract from Audio',

                    description:
                      'Transcribed verbal instruction during lecture',

                    status:
                      'completed',
                  },

                  {
                    id: 2,

                    title:
                      'Teacher Verification',

                    description:
                      'Confirmed by instructor during post-lecture review',

                    status:
                      'completed',
                  },

                  {
                    id: 3,

                    title:
                      'Synthesize Activity Payload',

                    description:
                      'Generated questions and target due date',

                    status:
                      'completed',
                  },

                  {
                    id: 4,

                    title:
                      'Prepare Moellim Action',

                    description:
                      'Ready for browser automation stage',

                    status:
                      'completed',
                  },

                  {
                    id: 5,

                    title:
                      'Teacher Approval',

                    description:
                      'Final human authorization required before execution',

                    status:
                      'in_progress',
                  },
                ],

                payload: {
                  title:
                    task.topic,

                  description:
                    task.description,

                  questions: [
                    'Analyze the core challenge discussed during the session.',
                    'Provide a concrete proposal adhering to standard conventions.',
                    'Submit your typed findings before the designated deadline.',
                  ],

                  dueDate:
                    task.dueDateCandidate ||
                    '25 September 2026, 11:59 PM',

                  totalMarks:
                    15,

                  submissionType:
                    'Online Text / PDF Upload',

                  allowLateSubmissions:
                    false,
                },
              };

            setWorkflows(
              (prev) => [
                newWorkflow,
                ...prev,
              ]
            );
          }
        );
      }

      setCurrentLectureSession(
        {
          ...session,
          status:
            'verified',
        }
      );

      addToast(
        'success',
        'Lecture Verified & Saved',
        'Extracted insights verified and recorded to Moellim academic logbook.'
      );
    };

  // ============================================================
  // STATS
  // ============================================================

  const pendingApprovalsCount =
    workflows.filter(
      (w) =>
        w.status ===
        'waiting_approval'
    ).length;

  const completedWorkflowsCount =
    workflows.filter(
      (w) =>
        w.status ===
        'completed'
    ).length;

  const stats = {
    activeCourses:
      courses.length,

    pendingApprovals:
      pendingApprovalsCount,

    completedWorkflows:
      completedWorkflowsCount,

    lecturesProcessed:
      currentLectureSession
        ?.status ===
      'verified'
        ? 1
        : 0,
  };

  // ============================================================
  // PROVIDER
  // ============================================================

  return (
    <AppContext.Provider
      value={{
        user,

        courses,

        coursesLoading,

        selectedCourseId,

        selectedCourse,

        selectCourse,

        workflows,

        activityLogs,

        currentLectureSession,

        toasts,

        demoMode,

        setDemoMode,

        login,

        logout,

        addToast,

        dismissToast,

        addWorkflow,

        getWorkflowById,

        approveWorkflow,

        rejectWorkflow,

        executeWorkflowDirectly,

        startLecture,

        updateLectureSession,

        endLectureSession,

        verifyAndSaveLecture,

        stats,

        teacherSchedule,

        activeScheduleClass,

        selectScheduleClass,

        simulatedMinutes,

        simulatedTimeString,

        setSimulatedMinutes,

        jumpSimulatedPreset,

        classModeStatus,

        upcomingWarningActive,

        dismissUpcomingWarning,

        manualOverrideStopped,

        stopClassModeManual,

        resumeClassModeManual,

        activeClassContent,

        stageClassModeAction,

        elapsedLectureSeconds,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// ============================================================
// HOOK
// ============================================================

export const useApp = () => {
  const context =
    useContext(AppContext);

  if (!context) {
    throw new Error(
      'useApp must be used within an AppProvider'
    );
  }

  return context;
};