import { ActivityLog } from '../types';

export interface ActivityDataRecord extends ActivityLog {
  course: string;
  workflowId: string;
}

/**
 * ACTIVITY LOG MOCK DATA
 * Represents completed and audited agentic operations executed on behalf of Dr. Hajra Murtaza.
 *
 * Includes realistic activities:
 *  - Lecture uploaded
 *  - Assignment created
 *  - Quiz created
 *  - Lecture completed
 *  - Reminder created
 *  - Workflow completed
 *  - Workflow failed
 *
 * In future backend integration:
 *   Python Backend / Audit Log Store
 *   → GET /api/activity-logs
 *   → React Service Layer (activityService)
 */
export const activityData: ActivityDataRecord[] = [
  {
    id: 'act-log-001',
    workflowId: 'wf-104',
    workflowName: 'Lecture Upload & Assignment Publishing Workflow',
    timestamp: 'Today, 10:15 AM',
    action: 'Lecture uploaded',
    course: 'Parallel and Distributed Computing',
    courseCode: 'CS7 PDC',
    courseTitle: 'Parallel and Distributed Computing',
    status: 'Verified',
    operator: 'Dr. Hajra Murtaza (via MUAWIN)',
    details: 'Lecture_2_Parallel_Computing.pptx retrieved from Google Drive and uploaded to Moellim Week 2 resources folder.',
    moellimRef: 'MOEL-RES-4921'
  },
  {
    id: 'act-log-002',
    workflowId: 'wf-104',
    workflowName: 'Lecture Upload & Assignment Publishing Workflow',
    timestamp: 'Today, 10:16 AM',
    action: 'Assignment created',
    course: 'Parallel and Distributed Computing',
    courseCode: 'CS7 PDC',
    courseTitle: 'Parallel and Distributed Computing',
    status: 'Completed',
    operator: 'Dr. Hajra Murtaza (via MUAWIN)',
    details: 'Assignment 1 on MPI Ring Communication with Deadlock Avoidance published to Moellim Section F. Due Oct 2nd, 20 marks.',
    moellimRef: 'MOEL-ASG-5812'
  },
  {
    id: 'act-log-003',
    workflowId: 'wf-102',
    workflowName: 'Quiz Announcement Workflow',
    timestamp: 'Today, 08:55 AM',
    action: 'Quiz created',
    course: 'Artificial Intelligence',
    courseCode: 'CS6 AI',
    courseTitle: 'Artificial Intelligence',
    status: 'Completed',
    operator: 'Dr. Hajra Murtaza (via MUAWIN)',
    details: 'Quiz 2 on Multi-Layer Neural Networks & Backpropagation scheduled for Friday, 25 Sep in Hall C-204.',
    moellimRef: 'MOEL-QZ-3104'
  },
  {
    id: 'act-log-004',
    workflowId: 'wf-lec-008',
    workflowName: 'Lecture Session Workflow',
    timestamp: 'Yesterday, 01:05 PM',
    action: 'Lecture completed',
    course: 'Machine Learning',
    courseCode: 'CS5 ML',
    courseTitle: 'Machine Learning',
    status: 'Completed',
    operator: 'MUAWIN Agent (Class Mode)',
    details: 'Lecture 08 session on Gradient Descent Optimization concluded. Duration 54 minutes. Audio transcribed and topics indexed.',
    moellimRef: 'LMS-LEC-9118'
  },
  {
    id: 'act-log-005',
    workflowId: 'wf-102',
    workflowName: 'Announcement Workflow',
    timestamp: 'Yesterday, 11:30 AM',
    action: 'Reminder created',
    course: 'Artificial Intelligence',
    courseCode: 'CS6 AI',
    courseTitle: 'Artificial Intelligence',
    status: 'Completed',
    operator: 'Dr. Hajra Murtaza (via MUAWIN)',
    details: 'Reminder notification dispatched to 42 enrolled students regarding Quiz 2 topic checklist & required stationery.',
    moellimRef: 'MOEL-ANN-4192'
  },
  {
    id: 'act-log-006',
    workflowId: 'wf-103',
    workflowName: 'Resource Sync Workflow',
    timestamp: '16 Sep 2026, 02:47 PM',
    action: 'Workflow completed',
    course: 'Machine Learning',
    courseCode: 'CS5 ML',
    courseTitle: 'Machine Learning',
    status: 'Verified',
    operator: 'Dr. Hajra Murtaza (via MUAWIN)',
    details: 'Multi-step workflow completed: Published gradient descent slides & Jupyter demo notebook with student access verification.',
    moellimRef: 'MOEL-WF-8821'
  },
  {
    id: 'act-log-007',
    workflowId: 'wf-fail-091',
    workflowName: 'Attendance & Attachment Sync Pipeline',
    timestamp: '15 Sep 2026, 04:12 PM',
    action: 'Workflow failed',
    course: 'Human Computer Interaction',
    courseCode: 'CS5 HCI',
    courseTitle: 'Human Computer Interaction',
    status: 'Failed',
    operator: 'MUAWIN Agent (Supervised)',
    details: 'Automated Moellim sync session timed out while uploading media attachments. Safe rollback executed; no incomplete draft was published.',
    moellimRef: 'MOEL-ERR-2041'
  }
];

export const initialActivityLogs = activityData;
