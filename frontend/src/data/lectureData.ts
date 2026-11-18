export interface LectureFileRecord {
  id: string;
  courseId: string;
  title: string;
  fileName: string;
  source: 'Google Drive' | 'Local Storage' | 'Moellim Repository';
  sourceFolder: string;
  uploadedAt: string;
  status: 'available' | 'synced' | 'pending_upload';
  fileSizeBytes?: number;
}

export interface CourseLectureSyllabusItem {
  id: string;
  courseId: string;
  lectureNumber: number;
  topic: string;
  date: string;
  status: 'Completed' | 'Upcoming' | 'Draft';
  hasTranscription: boolean;
  tasksExtracted: number;
  summary: string;
}

/**
 * LECTURE MOCK DATA
 * Represents lecture presentation slides, files, and Moellim syllabus history.
 *
 * In future backend integration:
 *   Google Drive API / Moellim File Manager
 *   → Python Backend (GET /api/courses/:id/lectures)
 *   → React Service Layer
 */
export const lectureFilesData: LectureFileRecord[] = [
  {
    id: 'lecture-002',
    courseId: 'cs7-pdc',
    title: 'Lecture 2: Distributed Memory & MPI',
    fileName: 'Lecture_2_Parallel_Computing.pptx',
    source: 'Google Drive',
    sourceFolder: 'PDC Course Materials / Fall 2026',
    uploadedAt: '2026-09-24',
    status: 'available',
    fileSizeBytes: 4829100
  },
  {
    id: 'lecture-001',
    courseId: 'cs7-pdc',
    title: 'Lecture 1: Introduction to Parallel Computing Architectures',
    fileName: 'Lecture_1_PDC_Overview.pptx',
    source: 'Google Drive',
    sourceFolder: 'PDC Course Materials / Fall 2026',
    uploadedAt: '2026-09-17',
    status: 'synced',
    fileSizeBytes: 3512800
  },
  {
    id: 'lecture-ai-010',
    courseId: 'cs6-ai',
    title: 'Lecture 10: Multi-Layer Neural Networks & Backpropagation',
    fileName: 'CS6_Lecture_10_Backpropagation.pptx',
    source: 'Google Drive',
    sourceFolder: 'AI Course Materials / Fall 2026',
    uploadedAt: '2026-09-24',
    status: 'available',
    fileSizeBytes: 6124000
  },
  {
    id: 'lecture-hci-008',
    courseId: 'cs5-hci',
    title: 'Lecture 8: Usability Principles & Nielsen Heuristics',
    fileName: 'HCI_Lecture_08_Heuristics.pdf',
    source: 'Google Drive',
    sourceFolder: 'HCI Lecture Slides / Fall 2026',
    uploadedAt: '2026-09-17',
    status: 'synced',
    fileSizeBytes: 2891000
  },
  {
    id: 'lecture-ml-008',
    courseId: 'cs5-ml',
    title: 'Lecture 8: Gradient Descent & Regularization',
    fileName: 'ML_Lecture_08_Gradient_Descent.pdf',
    source: 'Google Drive',
    sourceFolder: 'ML Course Vault / Fall 2026',
    uploadedAt: '2026-09-16',
    status: 'synced',
    fileSizeBytes: 5210000
  }
];

export const courseSyllabusLecturesData: Record<string, CourseLectureSyllabusItem[]> = {
  'cs6-ai': [
    {
      id: 'ai-lec-10',
      courseId: 'cs6-ai',
      lectureNumber: 10,
      topic: 'Neural Networks: Feedforward Architecture & Backpropagation',
      date: '24 Sep 2026',
      status: 'Upcoming',
      hasTranscription: false,
      tasksExtracted: 2,
      summary: 'Scheduled in-class session covering multi-layer perceptrons and gradient backpropagation equations.'
    },
    {
      id: 'ai-lec-09',
      courseId: 'cs6-ai',
      lectureNumber: 9,
      topic: 'Single-Layer Perceptrons & Decision Boundaries',
      date: '17 Sep 2026',
      status: 'Completed',
      hasTranscription: true,
      tasksExtracted: 1,
      summary: 'Introduced biological vs artificial neurons, linearly separable classes, and perceptron convergence theorem.'
    },
    {
      id: 'ai-lec-08',
      courseId: 'cs6-ai',
      lectureNumber: 8,
      topic: 'Adversarial Search: Minimax Algorithm & Alpha-Beta Pruning',
      date: '15 Sep 2026',
      status: 'Completed',
      hasTranscription: true,
      tasksExtracted: 1,
      summary: 'Covered game trees, zero-sum games, evaluation functions, and alpha-beta cutoff conditions.'
    }
  ],
  'cs7-pdc': [
    {
      id: 'pdc-lec-02',
      courseId: 'cs7-pdc',
      lectureNumber: 2,
      topic: 'Distributed Memory Architectures & Message Passing Interface (MPI)',
      date: '24 Sep 2026',
      status: 'Upcoming',
      hasTranscription: false,
      tasksExtracted: 2,
      summary: 'Explores MPI communicator initialization, rank assignment, and ring token passing communication topologies.'
    },
    {
      id: 'pdc-lec-01',
      courseId: 'cs7-pdc',
      lectureNumber: 1,
      topic: 'Introduction to High Performance Computing & Flynn’s Taxonomy',
      date: '17 Sep 2026',
      status: 'Completed',
      hasTranscription: true,
      tasksExtracted: 0,
      summary: 'Overview of modern parallel hardware, SIMD, MIMD, and shared vs distributed memory distinctions.'
    }
  ],
  'cs5-hci': [
    {
      id: 'hci-lec-09',
      courseId: 'cs5-hci',
      lectureNumber: 9,
      topic: 'Jakob Nielsen’s Usability Heuristics & Cognitive Walkthroughs',
      date: '25 Sep 2026',
      status: 'Upcoming',
      hasTranscription: false,
      tasksExtracted: 1,
      summary: 'Expert heuristic evaluation protocols and structured mobile app usability inspection.'
    },
    {
      id: 'hci-lec-08',
      courseId: 'cs5-hci',
      lectureNumber: 8,
      topic: 'Usability Engineering Lifecycle & User-Centered Design',
      date: '17 Sep 2026',
      status: 'Completed',
      hasTranscription: true,
      tasksExtracted: 1,
      summary: 'Analyzed iterative design loops, user mental models, and Nielsen heuristic inspection criteria.'
    }
  ],
  'cs5-ml': [
    {
      id: 'ml-lec-08',
      courseId: 'cs5-ml',
      lectureNumber: 8,
      topic: 'Gradient Descent Optimization & Regularization Techniques',
      date: '16 Sep 2026',
      status: 'Completed',
      hasTranscription: true,
      tasksExtracted: 1,
      summary: 'Analyzed cost functions, learning rate schedules, and Lasso vs Ridge regularization tradeoffs.'
    }
  ]
};

// Aliases for backwards compatibility
export const mockLecturesData = lectureFilesData;
