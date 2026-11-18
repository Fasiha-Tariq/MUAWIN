import { WorkflowItem } from '../types';

export interface ApprovalRecord {
  id: string;
  workflowId: string;
  type: 'lecture_upload' | 'create_assignment' | 'create_quiz' | 'lecture_completed' | 'create_reminder';
  title: string;
  course: string;
  courseId: string;
  courseCode: string;
  description: string;
  actions: string[];
  status: 'pending' | 'approved' | 'rejected' | 'executing' | 'completed';
  createdAt: string;
  requiresTeacherApproval: boolean;
  payload?: Record<string, any>;
}

/**
 * APPROVAL MOCK DATA
 * Represents items awaiting human-in-the-loop teacher authorization before Moellim automation.
 *
 * In future backend integration:
 *   Python Backend / Workflow Planner
 *   → GET /api/approvals
 *   → React Service Layer
 */
export const approvalData: ApprovalRecord[] = [
  {
    id: 'approval-001',
    workflowId: 'wf-101',
    type: 'create_assignment',
    title: 'Create Usability Principles Assignment',
    course: 'Human Computer Interaction',
    courseId: 'cs5-hci',
    courseCode: 'CS5 HCI',
    description: 'Answer the following questions based on the concepts discussed in Lecture 08. Submissions must be formatted in PDF.',
    actions: [
      'Extract conceptual questions from Lecture 08 transcript',
      'Format assignment description and 3 Nielsen heuristic assessment questions',
      'Stage Moellim submission box with deadline 25 Sep 2026, 11:59 PM',
      'Await instructor authorization before publishing to Section B'
    ],
    status: 'pending',
    createdAt: '17 Sep 2026, 09:10 AM',
    requiresTeacherApproval: true,
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
    id: 'approval-002',
    workflowId: 'wf-102',
    type: 'create_reminder',
    title: 'Quiz 2 Reminder & Topic Checklist',
    course: 'Artificial Intelligence',
    courseId: 'cs6-ai',
    courseCode: 'CS6 AI',
    description: 'Post notification to 42 enrolled students regarding Quiz 2 on Neural Networks (Perceptrons & Multi-Layer Networks).',
    actions: [
      'Validate quiz date with academic calendar (Friday, 25 Sep)',
      'Draft reminder announcement body with topic checklist',
      'Prepare announcement posting for Moellim Course Notice Board'
    ],
    status: 'pending',
    createdAt: '17 Sep 2026, 08:52 AM',
    requiresTeacherApproval: true,
    payload: {
      title: 'Reminder: Quiz 2 on Neural Networks (Perceptrons & Multi-Layer Networks)',
      targetGroup: 'All Enrolled Students (Section F)',
      reminderDate: '25 September 2026, 09:00 AM',
      message: 'Students are advised to prepare topics covered in Lectures 06 to 09. Bring standard stationery and calculators.'
    }
  },
  {
    id: 'approval-003',
    workflowId: 'wf-104',
    type: 'lecture_upload',
    title: 'Upload Lecture 2 and Create Assignment',
    course: 'Parallel and Distributed Computing',
    courseId: 'cs7-pdc',
    courseCode: 'CS7 PDC',
    description: 'Upload Lecture_2_Parallel_Computing.pptx from Google Drive to Moellim resources and create Assignment 1 on MPI Ring Passing.',
    actions: [
      'Retrieve Lecture_2_Parallel_Computing.pptx from Google Drive',
      'Navigate to PDC Section F Week 2 folder on Moellim',
      'Upload presentation slides file',
      'Create Assignment 1: MPI Token Ring with Deadlock Avoidance (20 Marks)',
      'Request teacher approval'
    ],
    status: 'pending',
    createdAt: 'Today, 10:00 AM',
    requiresTeacherApproval: true,
    payload: {
      title: 'Assignment 1: MPI Ring Communication with Deadlock Avoidance',
      targetSection: 'CS7 PDC (Section F)',
      dueDate: '02 October 2026, 11:59 PM',
      totalMarks: 20,
      submissionType: 'Source code & PDF report'
    }
  }
];
