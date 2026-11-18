import { ClassScheduleItem, DetectedAction } from '../types';

export interface ScheduleDataRecord extends ClassScheduleItem {
  courseName: string;
  date: string;
  classModeEnabled: boolean;
  status: 'upcoming' | 'live' | 'completed' | 'scheduled';
}

export interface CourseLectureSessionContent {
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
}

/**
 * SCHEDULE MOCK DATA
 * Represents the assigned class timetable for Dr. Hajra Murtaza on Riphah Moellim.
 * Powers MUAWIN Class Mode (auto-start, live listening, auto-stop, 5-minute warning).
 *
 * In future backend integration:
 *   Moellim Timetable
 *   → Playwright Session
 *   → Python Backend (GET /api/schedule)
 *   → React Service Layer
 */
export const scheduleData: ScheduleDataRecord[] = [
  {
    id: 'sched-ai-01',
    courseId: 'cs6-ai',
    courseCode: 'CS6 — AI',
    courseTitle: 'Artificial Intelligence',
    courseName: 'Artificial Intelligence',
    section: 'Section F',
    date: '2026-09-24',
    dayOfWeek: 'Monday & Wednesday',
    startTime: '10:00 AM',
    endTime: '11:30 AM',
    startMinutes: 600, // 10:00 AM = 600 mins
    endMinutes: 690,   // 11:30 AM = 690 mins
    room: 'Hall C-204 / Computing Lab 2',
    classModeEnabled: true,
    status: 'scheduled',
    lectureNumber: 10,
    topic: 'Neural Networks: Feedforward Architecture & Backpropagation',
    semester: 'Fall 2026'
  },
  {
    id: 'sched-pdc-02',
    courseId: 'cs7-pdc',
    courseCode: 'CS7 — PDC',
    courseTitle: 'Parallel and Distributed Computing',
    courseName: 'Parallel and Distributed Computing',
    section: 'Section F',
    date: '2026-09-24',
    dayOfWeek: 'Monday & Wednesday',
    startTime: '12:00 PM',
    endTime: '01:30 PM',
    startMinutes: 720, // 12:00 PM = 720 mins
    endMinutes: 810,   // 01:30 PM = 810 mins
    room: 'Distributed Systems Lab 3',
    classModeEnabled: true,
    status: 'scheduled',
    lectureNumber: 2,
    topic: 'Distributed Memory Architectures & Message Passing Interface (MPI)',
    semester: 'Fall 2026'
  },
  {
    id: 'sched-hci-03',
    courseId: 'cs5-hci',
    courseCode: 'CS5 — HCI',
    courseTitle: 'Human Computer Interaction',
    courseName: 'Human Computer Interaction',
    section: 'Section B',
    date: '2026-09-25',
    dayOfWeek: 'Tuesday & Thursday',
    startTime: '02:00 PM',
    endTime: '03:30 PM',
    startMinutes: 840,
    endMinutes: 930,
    room: 'Design Studio B-108',
    classModeEnabled: true,
    status: 'scheduled',
    lectureNumber: 9,
    topic: 'Jakob Nielsen’s Usability Heuristics & Cognitive Walkthroughs',
    semester: 'Fall 2026'
  },
  {
    id: 'sched-ml-04',
    courseId: 'cs5-ml',
    courseCode: 'CS5 — ML',
    courseTitle: 'Machine Learning',
    courseName: 'Machine Learning',
    section: 'Section A',
    date: '2026-09-25',
    dayOfWeek: 'Tuesday & Thursday',
    startTime: '04:00 PM',
    endTime: '05:30 PM',
    startMinutes: 960,
    endMinutes: 1050,
    room: 'Lecture Hall A-102',
    classModeEnabled: true,
    status: 'scheduled',
    lectureNumber: 8,
    topic: 'Gradient Descent Optimization & Regularization Techniques',
    semester: 'Fall 2026'
  }
];

export const MOCK_TEACHER_SCHEDULE: ClassScheduleItem[] = scheduleData;

export const mockLectureSessionContent: Record<string, CourseLectureSessionContent> = {
  'cs6-ai': {
    transcripts: [
      {
        id: 't-ai-1',
        timestamp: '10:01 AM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'Good morning everyone. Welcome to CS6 Artificial Intelligence, Section F. Today we are delving into artificial neural networks and how gradient descent enables backpropagation.'
      },
      {
        id: 't-ai-2',
        timestamp: '10:15 AM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'Notice that single perceptrons cannot solve non-linearly separable problems like XOR. We need hidden layers and non-linear activation functions such as ReLU and Sigmoid.'
      },
      {
        id: 't-ai-3',
        timestamp: '10:28 AM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'Important reminder for all students: Quiz 2 will be conducted next Friday at 09:00 AM sharp in Hall C-204, covering perceptrons, loss functions, and backpropagation equations.'
      },
      {
        id: 't-ai-4',
        timestamp: '10:48 AM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'For your practical coursework, Assignment 2 is now assigned: Implement backpropagation from scratch in Python without high-level frameworks. Due date is October 8th at 11:59 PM on Moellim, 20 marks total.'
      },
      {
        id: 't-ai-5',
        timestamp: '11:15 AM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'To conclude today: always remember that weight updates are proportional to the negative gradient of the loss function. Review the chain rule derivations in Section 4.3 before Wednesday.'
      }
    ],
    extractedTopics: [
      'Multi-Layer Perceptrons (MLPs)',
      'Backpropagation Algorithm',
      'Chain Rule in Gradient Computation',
      'Activation Functions (Sigmoid, ReLU)',
      'Cross-Entropy Loss Surface',
      'Learning Rate & Convergence'
    ],
    keyPoints: [
      'Single-layer perceptrons fail on XOR; non-linear activation functions in hidden layers enable universal function approximation.',
      'Backpropagation computes partial derivatives of error with respect to each weight via chain rule backwards from output.',
      'Gradient vanishing can occur with deep sigmoid networks; ReLU activation mitigates this issue.',
      'Assigned Assignment 2 due October 8th, 20 marks total on Moellim.'
    ],
    importantConcepts: [
      'Backpropagation through Time',
      'Vanishing Gradient Problem',
      'Loss Surface Convexity',
      'Weight Initialization Matrix'
    ],
    detectedActions: [
      {
        id: 'act-ai-01',
        type: 'Create Assignment',
        topic: 'Assignment 2: Backpropagation from Scratch in Python',
        dueDateCandidate: '08 October 2026, 11:59 PM',
        description: 'Implement a two-layer neural network with backpropagation from scratch in Python without deep learning frameworks. Total 20 marks.',
        confidence: 0.96,
        status: 'pending_review'
      },
      {
        id: 'act-ai-02',
        type: 'Create Reminder',
        topic: 'Quiz 2 on Perceptrons & Backpropagation Equations',
        dueDateCandidate: '02 October 2026, 09:00 AM',
        description: 'In-class Quiz 2 scheduled for Friday morning in Hall C-204 covering neural networks foundational concepts.',
        confidence: 0.92,
        status: 'pending_review'
      }
    ]
  },
  'cs7-pdc': {
    transcripts: [
      {
        id: 't-pdc-1',
        timestamp: '12:02 PM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'Welcome to Parallel and Distributed Computing, Section F. Today is Lecture 02 on distributed memory architectures and MPI message passing fundamentals.'
      },
      {
        id: 't-pdc-2',
        timestamp: '12:20 PM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'In shared memory architectures like OpenMP, processors share a unified address space. In distributed memory, each node has its private memory and communication is done strictly via message passing.'
      },
      {
        id: 't-pdc-3',
        timestamp: '12:50 PM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'I will be uploading the Lecture 2 slides to Moellim today. Also, Assignment 1 is due next Friday October 2nd on MPI point-to-point ring communication, total 20 marks.'
      }
    ],
    extractedTopics: [
      'Distributed Memory Architectures',
      'Message Passing Interface (MPI)',
      'Point-to-Point Communication (MPI_Send, MPI_Recv)',
      'Deadlock Prevention in Ring Topologies',
      'Shared vs Distributed Memory Tradeoffs'
    ],
    keyPoints: [
      'Distributed computing nodes communicate exclusively over high-speed interconnects via explicit network packets.',
      'MPI_Send and MPI_Recv can cause deadlocks if cyclic dependencies are introduced without buffering.',
      'Lecture 02 slides uploaded to Moellim course portal.',
      'Assignment 1 on MPI Ring Communication due October 2nd, 20 marks.'
    ],
    importantConcepts: [
      'Amdahl’s Law vs Gustafson’s Law',
      'MPI Communicators & Ranks',
      'Blocking vs Non-blocking Primitives',
      'Distributed Memory Scaling'
    ],
    detectedActions: [
      {
        id: 'act-pdc-01',
        type: 'Create Assignment',
        topic: 'Assignment 1: MPI Ring Communication with Deadlock Avoidance',
        dueDateCandidate: '02 October 2026, 11:59 PM',
        description: 'Write an MPI C/C++ program that passes a token in a ring of N processes and verifies deadlock-free completion. Total 20 marks.',
        confidence: 0.97,
        status: 'pending_review'
      },
      {
        id: 'act-pdc-02',
        type: 'Upload Lecture Notes',
        topic: 'Upload Lecture 02 Distributed Memory Slides',
        dueDateCandidate: 'Today, 05:00 PM',
        description: 'Upload Lecture_02_Parallel_Computing.pptx to Moellim Week 2 resources folder.',
        confidence: 0.94,
        status: 'pending_review'
      }
    ]
  },
  'cs5-hci': {
    transcripts: [
      {
        id: 't-hci-1',
        timestamp: '02:05 PM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'Welcome to Human Computer Interaction. Today we analyze usability evaluation methods and Jakob Nielsen’s heuristics.'
      },
      {
        id: 't-hci-2',
        timestamp: '02:35 PM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'Remember that heuristic evaluation by experts catches up to 75% of usability issues before actual end-user testing.'
      }
    ],
    extractedTopics: ['Heuristic Evaluation', 'User Error Prevention', 'Nielsen Norman Heuristics'],
    keyPoints: ['Evaluations should precede beta deployment.', 'Error prevention is superior to error recovery.'],
    importantConcepts: ['Cognitive Friction', 'Mental Models', 'Affordances & Signifiers'],
    detectedActions: [
      {
        id: 'act-hci-01',
        type: 'Create Assignment',
        topic: 'Assignment 2: Usability Heuristics Mobile App Audit',
        dueDateCandidate: '05 October 2026, 11:59 PM',
        description: 'Audit an existing educational portal mobile app using all 10 Nielsen heuristics. 20 marks.',
        confidence: 0.95,
        status: 'pending_review'
      }
    ]
  },
  'cs5-ml': {
    transcripts: [
      {
        id: 't-ml-1',
        timestamp: '04:05 PM',
        speaker: 'Dr. Hajra Murtaza',
        text: 'Good afternoon. Today in Machine Learning Section A we examine Gradient Descent optimization and L1/L2 regularization.'
      }
    ],
    extractedTopics: ['Gradient Descent', 'Lasso vs Ridge Regularization', 'Learning Rate Tuning'],
    keyPoints: ['L1 regularization promotes sparsity, L2 prevents overfitting on high-weight features.'],
    importantConcepts: ['Hyperparameter Tuning', 'Bias-Variance Dilemma'],
    detectedActions: [
      {
        id: 'act-ml-01',
        type: 'Create Assignment',
        topic: 'Assignment 1: Linear Regression & Regularization in NumPy',
        dueDateCandidate: '07 October 2026, 11:59 PM',
        description: 'Implement Ridge and Lasso regression from scratch in Python NumPy. 20 marks.',
        confidence: 0.96,
        status: 'pending_review'
      }
    ]
  }
};
