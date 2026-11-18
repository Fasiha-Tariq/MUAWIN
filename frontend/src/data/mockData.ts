import { Course, UserProfile, WorkflowItem, ActivityLog, LectureSessionData } from '../types';

export const mockTeacherProfile: UserProfile = {
  id: 'usr-riphah-8492',
  name: 'Dr. Hajra Murtaza',
  username: 'hajra.murtaza',
  department: 'Faculty of Computing & Applied Sciences',
  role: 'Course Instructor',
  faculty: 'Riphah International University',
  email: 'hajra.murtaza@riphah.edu.pk',
  moellimConnected: true,
  lastActive: 'Today, 09:32 AM'
};

export const mockCourses: Course[] = [
  {
    id: 'cs6-ai',
    code: 'CS6 — AI',
    title: 'Artificial Intelligence',
    section: 'Section F',
    semester: 'Fall 2026',
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
    section: 'Section B',
    semester: 'Fall 2026',
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
    section: 'Section A',
    semester: 'Fall 2026',
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
    section: 'Section F',
    semester: 'Fall 2026',
    studentsCount: 42,
    creditHours: 3,
    recentActivity: 'Lecture 02 uploaded & assignment queued',
    recentActivityTime: 'Today, 10:15 AM',
    lastLectureDate: '19 Sep 2026',
    color: 'border-purple-500 text-purple-700 bg-purple-50'
  }
];

export const initialWorkflows: WorkflowItem[] = [
  {
    id: 'wf-101',
    title: 'Create Usability Principles Assignment',
    actionType: 'Create Assignment',
    courseId: 'cs5-hci',
    courseCode: 'CS5 HCI',
    courseName: 'Human Computer Interaction',
    source: 'Lecture 08 — Usability Heuristics',
    requestedBy: 'Teacher Instruction',
    createdAt: '17 Sep 2026, 09:10 AM',
    status: 'waiting_approval',
    currentStepIndex: 4,
    instructionText: "Create an assignment from today's HCI lecture on usability principles.",
    detectedIntent: {
      intent: 'Create Assignment',
      course: 'CS5 — Human Computer Interaction',
      source: "Today's Lecture (Lecture 08)",
      action: 'Generate assignment and publish on Moellim',
      confidence: 0.98
    },
    steps: [
      { id: 1, title: 'Identify Course', description: 'Matched CS5 — Human Computer Interaction (Section B)', status: 'completed', timestamp: '09:10 AM' },
      { id: 2, title: 'Retrieve Lecture Content', description: "Extracted concepts & questions from today's lecture transcript", status: 'completed', timestamp: '09:11 AM' },
      { id: 3, title: 'Generate Assignment', description: 'Formulated 3 structured conceptual questions & assessment rubric', status: 'completed', timestamp: '09:11 AM' },
      { id: 4, title: 'Prepare Moellim Action', description: 'Pre-formatted payload for Moellim course assignment submission', status: 'completed', timestamp: '09:12 AM' },
      { id: 5, title: 'Teacher Approval', description: 'Awaiting human authorization before committing changes to Moellim', status: 'in_progress', timestamp: 'Pending' }
    ],
    payload: {
      title: 'Usability Principles & Heuristic Evaluation',
      description: 'Answer the following questions based on the concepts discussed in Lecture 08. Submissions must be formatted in PDF.',
      questions: [
        'Define system usability according to Nielsen Norman criteria.',
        'Explain the major 5 usability heuristics with real-world mobile UI examples.',
        'Compare Heuristic Evaluation versus Think-Aloud Cognitive Walkthrough testing methods.'
      ],
      dueDate: '25 September 2026, 11:59 PM',
      totalMarks: 20,
      submissionType: 'File submission (PDF only)',
      allowLateSubmissions: false
    }
  },
  {
    id: 'wf-102',
    title: 'Quiz 2 Reminder & Topic Checklist',
    actionType: 'Create Reminder',
    courseId: 'cs6-ai',
    courseCode: 'CS6 AI',
    courseName: 'Artificial Intelligence',
    source: 'Lecture 09 — Neural Networks Intro',
    requestedBy: 'Lecture Analysis',
    createdAt: '17 Sep 2026, 08:52 AM',
    status: 'waiting_approval',
    currentStepIndex: 4,
    instructionText: 'Detected verbal teacher prompt: "Remember class, our second quiz will be next Friday on neural networks."',
    detectedIntent: {
      intent: 'Create Reminder',
      course: 'CS6 — Artificial Intelligence',
      source: 'Lecture 09 In-Class Audio',
      action: 'Post announcement on Moellim Notice Board and send portal notifications',
      confidence: 0.95
    },
    steps: [
      { id: 1, title: 'Audio Detection', description: 'Detected date & quiz keyword during lecture analysis', status: 'completed' },
      { id: 2, title: 'Validate Academic Calendar', description: 'Verified target date Friday, 25 Sep against semester timetable', status: 'completed' },
      { id: 3, title: 'Draft Announcement', description: 'Created notification body with covered scope & materials', status: 'completed' },
      { id: 4, title: 'Prepare Moellim Action', description: 'Ready to post to Moellim Announcements forum', status: 'completed' },
      { id: 5, title: 'Teacher Approval', description: 'Required to authorize sending notification to 42 enrolled students', status: 'in_progress' }
    ],
    payload: {
      title: 'Reminder: Quiz 2 on Neural Networks (Perceptrons & Multi-Layer Networks)',
      targetGroup: 'All Enrolled Students (Section F)',
      reminderDate: '25 September 2026, 09:00 AM',
      message: 'Students are advised to prepare topics covered in Lectures 06 to 09. Bring standard stationery and calculators.'
    }
  },
  {
    id: 'wf-103',
    title: 'Publish Lecture Slides & Reading Links',
    actionType: 'Upload Lecture Notes',
    courseId: 'cs5-ml',
    courseCode: 'CS5 ML',
    courseName: 'Machine Learning',
    source: 'Lecture 08 Session Materials',
    requestedBy: 'Teacher Instruction',
    createdAt: '16 Sep 2026, 02:40 PM',
    status: 'completed',
    currentStepIndex: 5,
    instructionText: 'Upload gradient descent notes and notebook to Moellim CS5 ML.',
    detectedIntent: {
      intent: 'Upload Lecture Notes',
      course: 'CS5 — Machine Learning',
      source: 'Verified Lecture Assets',
      action: 'Upload PDF and Jupyter Notebook to Course Resources',
      confidence: 0.99
    },
    steps: [
      { id: 1, title: 'Identify Course', description: 'Matched CS5 — Machine Learning (Section A)', status: 'completed' },
      { id: 2, title: 'Inspect Artifacts', description: 'Verified gradient_descent_slides.pdf and lab_demo.ipynb', status: 'completed' },
      { id: 3, title: 'Format Moellim Resource Entry', description: 'Configured folder structure in Week 4 section', status: 'completed' },
      { id: 4, title: 'Teacher Authorization', description: 'Approved by Dr. Hajra Murtaza on 16 Sep, 02:45 PM', status: 'completed' },
      { id: 5, title: 'Controlled Execution & Verification', description: 'Successfully published and verified live on Moellim', status: 'completed' }
    ],
    verificationResult: {
      verifiedAt: '16 Sep 2026, 02:47 PM',
      moellimUrl: 'https://moellim.riphah.edu.pk/course/view.php?id=3842&section=4',
      verificationStatus: 'Verified',
      notes: 'Resource verified accessible to enrolled students in section A.'
    }
  }
];

export const initialActivityLogs: ActivityLog[] = [
  {
    id: 'log-801',
    timestamp: '17 Sep 2026, 08:55 AM',
    courseCode: 'CS6 AI',
    courseTitle: 'Artificial Intelligence',
    action: 'Lecture Processed',
    workflowName: 'Lecture Session Workflow (Lecture 09)',
    status: 'Verified',
    operator: 'MUAWIN Agent (Supervised)',
    details: 'Extracted 6 topics, 14 key takeaways, and queued 1 reminder for teacher review.',
    moellimRef: 'LMS-LEC-9241'
  },
  {
    id: 'log-802',
    timestamp: '16 Sep 2026, 03:20 PM',
    courseCode: 'CS6 AI',
    courseTitle: 'Artificial Intelligence',
    action: 'Assignment Created',
    workflowName: 'Assignment Publishing Workflow',
    status: 'Completed',
    operator: 'Dr. Hajra Murtaza (via MUAWIN)',
    details: 'Published Assignment 1: A* Search Implementation in Pacman Environment.',
    moellimRef: 'MOEL-ASG-5510'
  },
  {
    id: 'log-803',
    timestamp: '16 Sep 2026, 02:47 PM',
    courseCode: 'CS5 ML',
    courseTitle: 'Machine Learning',
    action: 'Lecture Notes Uploaded',
    workflowName: 'Resource Sync Workflow',
    status: 'Verified',
    operator: 'Dr. Hajra Murtaza (via MUAWIN)',
    details: 'Uploaded Gradient Descent slides & interactive notebook to Week 4 section.',
    moellimRef: 'MOEL-RES-3842'
  },
  {
    id: 'log-804',
    timestamp: '16 Sep 2026, 01:05 PM',
    courseCode: 'CS5 ML',
    courseTitle: 'Machine Learning',
    action: 'Lecture Completed',
    workflowName: 'Lecture Session Workflow',
    status: 'Completed',
    operator: 'MUAWIN Agent',
    details: 'Lecture 08 session concluded. Duration 54 minutes. Transcript parsed.',
    moellimRef: 'LMS-LEC-9118'
  },
  {
    id: 'log-805',
    timestamp: '15 Sep 2026, 11:30 AM',
    courseCode: 'CS7 PDC',
    courseTitle: 'Parallel and Distributed Computing',
    action: 'Quiz Reminder Posted',
    workflowName: 'Announcement Workflow',
    status: 'Completed',
    operator: 'Dr. Hajra Murtaza (via MUAWIN)',
    details: 'Notification dispatched to 42 students regarding MPI point-to-point communication lab quiz.',
    moellimRef: 'MOEL-ANN-4192'
  },
  {
    id: 'log-806',
    timestamp: '14 Sep 2026, 10:15 AM',
    courseCode: 'CS5 HCI',
    courseTitle: 'Human Computer Interaction',
    action: 'Attendance Synchronized',
    workflowName: 'Attendance Recording Workflow',
    status: 'Verified',
    operator: 'Dr. Hajra Murtaza (via MUAWIN)',
    details: 'Marked 36 Present, 2 Absent in Moellim Attendance Register.',
    moellimRef: 'MOEL-ATT-7721'
  }
];

export const sampleLectureSession: LectureSessionData = {
  id: 'lec-live-01',
  courseId: 'cs5-hci',
  courseName: 'CS5 — Human Computer Interaction',
  section: 'Section B',
  lectureNumber: 8,
  topic: 'Usability Principles and Heuristics',
  startTime: '10:00 AM',
  durationSeconds: 1458, // ~24 mins 18 secs
  status: 'live',
  transcriptChunks: [
    {
      id: 'tc-1',
      timestamp: '00:01:15',
      speaker: 'Dr. Hajra Murtaza',
      text: 'Good morning everyone. Today we are discussing usability principles and how they directly dictate the design of modern interactive systems.'
    },
    {
      id: 'tc-2',
      timestamp: '00:04:42',
      speaker: 'Dr. Hajra Murtaza',
      text: 'The first core principle is visibility of system status. The system should always keep users informed about what is going on, through appropriate feedback within reasonable time.'
    },
    {
      id: 'tc-3',
      timestamp: '00:09:20',
      speaker: 'Dr. Hajra Murtaza',
      text: 'Next, look at consistency and standards. Users should not have to wonder whether different words, situations, or actions mean the same thing in your university portal or mobile app.'
    },
    {
      id: 'tc-4',
      timestamp: '00:15:35',
      speaker: 'Dr. Hajra Murtaza',
      text: 'Now, please pay close attention: I will be assigning a practical evaluation task based on these usability heuristics. You will need to analyze two evaluation methods by September 25th.'
    },
    {
      id: 'tc-5',
      timestamp: '00:21:10',
      speaker: 'Dr. Hajra Murtaza',
      text: 'Remember that user error prevention is always superior to nice error messages. Let us now examine cognitive walkthroughs in detail.'
    }
  ],
  extractedTopics: [
    'Usability Heuristics',
    'System Visibility & Status',
    'Feedback Loops',
    'Consistency & Standards',
    'Heuristic Evaluation Methods',
    'Error Prevention vs Error Recovery'
  ],
  keyPoints: [
    'System must provide immediate, unambiguous visual feedback for every user interaction.',
    'Follow platform conventions so users do not experience cognitive friction.',
    'Evaluation methods: Compare Nielsen Heuristic inspection with Think-Aloud protocols.',
    'Assigned practical task due on 25 September for Section B students.'
  ],
  detectedActions: [
    {
      id: 'da-01',
      type: 'Create Assignment',
      topic: 'Usability Evaluation & Principles Analysis',
      dueDateCandidate: '25 September 2026',
      description: 'Teacher verbally mandated a practical evaluation assignment covering usability principles with due date 25 Sep.',
      confidence: 0.96,
      status: 'pending_review'
    },
    {
      id: 'da-02',
      type: 'Create Reminder',
      topic: 'Read Chapter 4 on Cognitive Walkthroughs',
      dueDateCandidate: '22 September 2026',
      description: 'Instructed students to complete required reading before the next lab session.',
      confidence: 0.88,
      status: 'pending_review'
    }
  ]
};
