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
import { activityService } from '../services/activityService';
import { lectureService } from '../services/lectureService';
import { api } from '../services/api';


/*
|--------------------------------------------------------------------------
| MUAWIN STORAGE VERSION
|--------------------------------------------------------------------------
*/

const MUAWIN_STORAGE_VERSION = 'real-backend-v2';

interface AppContextType {
  user: UserProfile | null;

  courses: Course[];
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

export const AppProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {

  // ============================================================
  // USER
  // ============================================================

  const [user, setUser] =
    useState<UserProfile | null>(() => {
      try {
        const stored =
          localStorage.getItem(
            'muawin_user'
          );

        if (stored) {
          return JSON.parse(stored);
        }
      } catch (error) {
        console.warn(
          '[AppContext] Could not restore user:',
          error
        );
      }

      return null;
    });


  // ============================================================
  // COURSES — REAL MOELLIM COURSES
  // ============================================================

  const [courses, setCourses] =
    useState<Course[]>(() => {
      try {
        const savedCourses =
          localStorage.getItem(
            'muawin_courses'
          );

        if (!savedCourses) {
          return [];
        }

        const parsed =
          JSON.parse(savedCourses);

        if (Array.isArray(parsed)) {
          console.log(
            '[AppContext] Restored saved Moellim courses:',
            parsed
          );

          return parsed;
        }
      } catch (error) {
        console.warn(
          '[AppContext] Could not restore Moellim courses:',
          error
        );
      }

      return [];
    });


  const [
    selectedCourseId,
    setSelectedCourseId,
  ] = useState<string | null>(() => {
    try {
      const stored =
        localStorage.getItem(
          'muawin_selected_course'
        );

      return stored || null;
    } catch {
      return null;
    }
  });


  const selectedCourse =
    useMemo(() => {
      if (!selectedCourseId) {
        return courses[0] || null;
      }

      return (
        courses.find(
          (course) =>
            course.id ===
            selectedCourseId
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
    console.log(
      '[AppContext] Selecting course:',
      courseId
    );

    setSelectedCourseId(
      courseId
    );

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
  // COURSE SELECTION
  // ============================================================

  // Courses are loaded directly by the real Moellim login flow.
  // Do not continuously synchronize courses/selection in an effect:
  // login() already sets both values, and logout() clears both values.
  // Keeping this state flow explicit prevents render/update loops.

  // ============================================================
  // WORKFLOWS
  // ============================================================

  const [
    workflows,
    setWorkflows,
  ] = useState<WorkflowItem[]>(() => {
    try {
      const storageVersion =
        localStorage.getItem(
          'muawin_storage_version'
        );

      if (
        storageVersion !==
        MUAWIN_STORAGE_VERSION
      ) {
        localStorage.removeItem(
          'muawin_workflows'
        );

        localStorage.removeItem(
          'muawin_activity_logs'
        );

        localStorage.setItem(
          'muawin_storage_version',
          MUAWIN_STORAGE_VERSION
        );

        return [];
      }

      const saved =
        localStorage.getItem(
          'muawin_workflows'
        );

      if (saved) {
        const parsed =
          JSON.parse(saved);

        if (Array.isArray(parsed)) {
          return parsed.filter(
            (workflow) =>
              workflow &&
              typeof workflow.id ===
                'string' &&
              !workflow.id.startsWith(
                'local-'
              ) &&
              !workflow.id.startsWith(
                'wf-lec-'
              )
          );
        }
      }
    } catch (error) {
      console.warn(
        '[AppContext] Could not restore workflows:',
        error
      );
    }

    return [];
  });


  // ============================================================
  // ACTIVITY LOGS
  // ============================================================

  const [
    activityLogs,
    setActivityLogs,
  ] =
    useState<ActivityLog[]>(() => {
      try {
        const saved =
          localStorage.getItem(
            'muawin_activity_logs'
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
  // AUTOMATIC CLASS MODE
  // ============================================================

  const teacherSchedule =
    scheduleData;

  const [
    activeScheduleId,
    setActiveScheduleId,
  ] =
    useState<string>(
      'sched-ai-01'
    );

  const [
    simulatedMinutes,
    setSimulatedMinutes,
  ] =
    useState<number>(595);

  const [
    warningDismissed,
    setWarningDismissed,
  ] =
    useState<boolean>(false);

  const [
    manualOverrideStopped,
    setManualOverrideStopped,
  ] =
    useState<boolean>(false);

  const [
    elapsedLectureSeconds,
    setElapsedLectureSeconds,
  ] =
    useState<number>(0);

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
    }, [simulatedMinutes]);

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
    let interval: any =
      null;

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
  }, [classModeStatus]);


  // ============================================================
  // TOASTS
  // ============================================================

  const [
    toasts,
    setToasts,
  ] =
    useState<ToastMessage[]>([]);

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
      timestamp: Date.now(),
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
    }

    else if (
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
    }

    else if (
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
    }

    else if (
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
    }

    else if (
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
      id: `wf-cm-${Date.now()}`,

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
        'MUAWIN Agent (Class Mode)',

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
  // LOCAL STORAGE
  // ============================================================

  useEffect(() => {
    try {
      localStorage.setItem(
        'muawin_workflows',
        JSON.stringify(
          workflows
        )
      );
    } catch {}
  }, [workflows]);

  useEffect(() => {
    try {
      localStorage.setItem(
        'muawin_activity_logs',
        JSON.stringify(
          activityLogs
        )
      );
    } catch {}
  }, [activityLogs]);


  // ============================================================
  // LOGIN — REAL MOELLIM AUTHENTICATION
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

    console.log(
      '[AppContext] Authenticating with real Moellim backend...'
    );

    /*
     * REAL BACKEND CALL
     *
     * POST /api/auth/login
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


    // ==========================================================
    // DEBUG — RAW BACKEND RESPONSE
    // ==========================================================

    console.log(
      '[AppContext] LOGIN RESPONSE:',
      data
    );

    console.log(
      '[AppContext] COURSES FROM BACKEND:',
      data?.courses
    );


    if (
      !data ||
      data.authenticated !== true
    ) {
      throw new Error(
        data?.detail ||
          'Moellim authentication failed.'
      );
    }


    // ==========================================================
    // BUILD USER PROFILE
    // ==========================================================

    /*
     * The backend currently returns:
     *
     * authenticated
     * username
     * courses
     *
     * If the backend later returns the actual
     * teacher name, data.name will automatically
     * be used.
     *
     * Until then, teacherData.name remains the
     * fallback.
     */
    const updatedUser: UserProfile =
  {
    id:
      `moellim-${cleanUsername}`,

    name:
      data.name ||
      `Moellim User ${cleanUsername}`,

    username:
      cleanUsername,
    

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
          teacherData.email,

        moellimConnected:
          true,

        lastActive:
          'Just now',
      };


    console.log(
      '[AppContext] USER PROFILE:',
      updatedUser
    );


    // ==========================================================
    // CONVERT REAL MOELLIM COURSES
    // ==========================================================

    const liveCourses: Course[] =
      Array.isArray(
        data.courses
      )
        ? data.courses.map(
            (
              course: any,
              index: number
            ) => {

              const courseName =
                (
                  course?.name ||
                  `Moellim Course ${
                    index + 1
                  }`
                ).trim();


              const href =
                String(
                  course?.href ||
                  ''
                );


              const match =
                href.match(
                  /[?&]id=(\d+)/
                );


              const moellimCourseId =
                match?.[1] ||
                `${index + 1}`;


              const convertedCourse: Course =
                {
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


              console.log(
                `[AppContext] Converted Moellim course ${index + 1}:`,
                convertedCourse
              );


              return convertedCourse;
            }
          )
        : [];


    // ==========================================================
    // DEBUG — FINAL COURSE ARRAY
    // ==========================================================

    console.log(
      '[AppContext] LIVE MUAWIN COURSES:',
      liveCourses
    );

    console.log(
      `[AppContext] LIVE COURSE COUNT: ${liveCourses.length}`
    );


    // ==========================================================
    // REQUIRE COURSES
    // ==========================================================

    if (
      liveCourses.length === 0
    ) {
      throw new Error(
        'Moellim login succeeded, but no enrolled courses were found.'
      );
    }


    // ==========================================================
    // UPDATE REACT STATE
    // ==========================================================

    console.log(
      '[AppContext] Setting authenticated user...'
    );

    setUser(
      updatedUser
    );


    console.log(
      '[AppContext] Setting live Moellim courses...'
    );

    setCourses(
      liveCourses
    );


    const firstCourseId =
      liveCourses[0]?.id ||
      null;


    console.log(
      '[AppContext] First course selected:',
      firstCourseId
    );


    setSelectedCourseId(
      firstCourseId
    );


    // ==========================================================
    // PERSIST LOGIN STATE
    // ==========================================================

    try {

      if (rememberMe) {

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


        if (firstCourseId) {
          localStorage.setItem(
            'muawin_selected_course',
            firstCourseId
          );
        }

      } else {

        localStorage.removeItem(
          'muawin_user'
        );

        localStorage.removeItem(
          'muawin_courses'
        );

        localStorage.removeItem(
          'muawin_selected_course'
        );
      }


      /*
       * Old fake frontend token is no longer used.
       */

      localStorage.removeItem(
        'muawin_auth_token'
      );

    } catch (error) {

      console.warn(
        '[AppContext] Could not persist login state:',
        error
      );

    }


    // ==========================================================
    // SUCCESS
    // ==========================================================

    addToast(
      'success',
      'Authenticated',
      `Welcome back, ${updatedUser.name}`
    );


    console.log(
      '[AppContext] Moellim authentication successful.'
    );

    console.log(
      `[AppContext] ${liveCourses.length} live Moellim courses loaded.`
    );


    return true;
  };


  // ============================================================
  // LOGOUT
  // ============================================================

  const logout = () => {

    console.log(
      '[AppContext] Logging out...'
    );

    setUser(null);

    setCourses([]);

    setSelectedCourseId(
      null
    );

    setWorkflows([]);

    try {

      localStorage.removeItem(
        'muawin_user'
      );

      localStorage.removeItem(
        'muawin_courses'
      );

      localStorage.removeItem(
        'muawin_auth_token'
      );

      localStorage.removeItem(
        'muawin_selected_course'
      );

      localStorage.removeItem(
        'muawin_workflows'
      );

      localStorage.removeItem(
        'muawin_activity_logs'
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

  const addWorkflow = async (
    newWf: WorkflowItem
  ): Promise<WorkflowItem | null> => {
    try {
      const instruction =
        newWf.instructionText ||
        String(
          (
            newWf.payload as any
          )?.instruction ||
          newWf.detectedIntent
            ?.action ||
          newWf.title ||
          ''
        );

      if (
        !instruction.trim()
      ) {
        throw new Error(
          'No teacher instruction was found for this workflow.'
        );
      }

      console.log(
        '[AppContext] Creating REAL backend workflow:',
        instruction
      );

      const backendWorkflow =
        await workflowService.createWorkflow(
          {
            ...newWf,

            instructionText:
              instruction,

            payload: {
              ...(newWf.payload ||
                {}),
              instruction,
            },
          }
        );

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

        const approvedWorkflow =
          await workflowService.approveWorkflow(
            id,
            approvalData
          );

        if (
          !approvedWorkflow
        ) {
          throw new Error(
            'Backend did not return the approved workflow.'
          );
        }

        console.log(
          '[AppContext] Backend approval successful:',
          approvedWorkflow.id,
          approvedWorkflow.status
        );

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

        console.log(
          `[AppContext] Calling REAL backend rejection for ${id}`
        );

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
          targetWorkflow.status ===
          'waiting_approval'
        ) {

          console.log(
            `[AppContext] Workflow ${id} is still waiting locally. Ensuring backend approval before execution.`
          );

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
              approvalData
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

          console.log(
            `[AppContext] Backend confirmed approval for ${id}.`
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

    const isHCI =
      course.id ===
      'cs5-hci';

    const isAI =
      course.id ===
      'cs6-ai';

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
          isAI
            ? 10
            : isHCI
              ? 9
              : 8,

        topic:
          topic ||
          (
            isHCI
              ? 'Quantitative Usability Testing & Metrics (SUS / NASA-TLX)'
              : isAI
                ? 'Neural Networks: Backpropagation & Optimization'
                : `${course.title} Advanced Topics`
          ),

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
              'Dr. Hajra Murtaza',

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
            'CS5 HCI',

          courseTitle:
            session.courseName.split(
              ' — '
            )[1] ||
            'Human Computer Interaction',

          action:
            'Lecture Processed',

          workflowName:
            `Lecture Session Workflow (Lecture 0${session.lectureNumber})`,

          status:
            'Verified',

          operator:
            `${
              user?.name ||
              'Dr. Hajra Murtaza'
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
                  'CS5 HCI',

                courseName:
                  session.courseName.split(
                    ' — '
                  )[1] ||
                  'Human Computer Interaction',

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