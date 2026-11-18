
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Clock,
  CheckCircle2,
  XCircle,
  Play,
  AlertTriangle,
  Filter,
  Calendar,
  FileText,
  BookOpen,
  Layers,
  ListChecks,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { WorkflowItem } from '../types';

type AnyRecord = Record<string, any>;

const asRecord = (value: unknown): AnyRecord =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnyRecord)
    : {};

const firstValue = (...values: unknown[]): unknown =>
  values.find(
    (value) =>
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ''
  );

const displayText = (
  value: unknown,
  fallback = 'Not specified'
): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => displayText(item)).join(', ');
  }

  return fallback;
};

const normalizeCourseName = (value: unknown): string =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\((female|male)\)\s*$/i, '')
    .replace(/\s+/g, ' ');

const getWorkflowDrafts = (workflow: WorkflowItem) => {
  const payload = asRecord(workflow.payload);
  const backendDraft = asRecord(payload.backendDraft);
  const combinedDraft = asRecord(payload.combinedDraft);
  const parsed = asRecord(payload.backendParsed);

  const lecture = asRecord(
    firstValue(
      combinedDraft.lecture,
      backendDraft.lecture,
      payload.lectureDraft
    )
  );

  const assignment = asRecord(
    firstValue(
      combinedDraft.assignment,
      backendDraft.assignment,
      payload.assignmentDraft
    )
  );

  const workflowType = String(
    firstValue(
      payload.workflowType,
      (workflow as any).workflowType,
      parsed.workflow_type,
      ''
    )
  ).toLowerCase();

  const isCombined =
    workflowType === 'combined' ||
    workflowType === 'combined_workflow' ||
    (Object.keys(lecture).length > 0 &&
      Object.keys(assignment).length > 0);

  return {
    payload,
    lecture,
    assignment,
    isCombined,
  };
};

export const Approvals: React.FC = () => {
  const navigate = useNavigate();

  const {
    courses,
    workflows,
    rejectWorkflow,
    executeWorkflowDirectly,
    addToast,
  } = useApp();

  const [activeCourseFilter, setActiveCourseFilter] =
    useState<string>('all');

  const [executingWorkflowId, setExecutingWorkflowId] =
    useState<string | null>(null);

  const [executionLog, setExecutionLog] = useState<{
    step: number;
    message: string;
  } | null>(null);

  const [rejectingWorkflow, setRejectingWorkflow] =
    useState<WorkflowItem | null>(null);

  const [rejectionReason, setRejectionReason] = useState('');

  // Only show workflows belonging to the teacher's assigned courses.
  const workflowBelongsToTeacherCourse = (
    workflow: WorkflowItem
  ): boolean => {
    const payload = asRecord(workflow.payload);

    const workflowCourseId = String(
      workflow.courseId || ''
    )
      .trim()
      .toLowerCase();

    const workflowRawId = workflowCourseId.replace(
      /^moellim-/,
      ''
    );

    const workflowCourseNames = [
      workflow.courseCode,
      (workflow as any).courseName,
      (workflow as any).course_id,
      (workflow as any).course_code,
      payload.course,
      payload.courseName,
      payload.course_id,
      payload.course_code,
    ]
      .map(normalizeCourseName)
      .filter(Boolean);

    return courses.some((course) => {
      const courseId = String(course.id || '')
        .trim()
        .toLowerCase();

      const rawCourseId = courseId.replace(
        /^moellim-/,
        ''
      );

      if (
        workflowCourseId &&
        workflowCourseId !== 'moellim-course' &&
        (workflowCourseId === courseId ||
          workflowRawId === rawCourseId)
      ) {
        return true;
      }

      const courseNames = [
        course.code,
        course.title,
      ]
        .map(normalizeCourseName)
        .filter(Boolean);

      return workflowCourseNames.some((name) =>
        courseNames.includes(name)
      );
    });
  };

  const pendingWorkflows = workflows.filter((workflow) => {
    if (!workflowBelongsToTeacherCourse(workflow)) {
      return false;
    }

    const approvalStatus = String(
      workflow.status || ''
    ).toLowerCase();

    if (
      ![
        'waiting_approval',
        'pending_approval',
        'needs_approval',
        'pending',
        'approved',
        'executing',
      ].includes(approvalStatus)
    ) {
      return false;
    }

    if (activeCourseFilter !== 'all') {
      const selectedCourse = courses.find(
        (course) => course.id === activeCourseFilter
      );

      if (!selectedCourse) {
        return false;
      }

      const payload = asRecord(workflow.payload);

      const workflowCourseId = String(
        workflow.courseId || ''
      )
        .trim()
        .toLowerCase();

      const selectedCourseId = String(
        selectedCourse.id || ''
      )
        .trim()
        .toLowerCase();

      const workflowRawId = workflowCourseId.replace(
        /^moellim-/,
        ''
      );

      const selectedRawId = selectedCourseId.replace(
        /^moellim-/,
        ''
      );

      const idMatches =
        !!workflowCourseId &&
        (workflowCourseId === selectedCourseId ||
          workflowRawId === selectedRawId);

      const workflowNames = [
        workflow.courseCode,
        (workflow as any).courseName,
        (workflow as any).course_id,
        (workflow as any).course_code,
        payload.course,
        payload.courseName,
        payload.course_id,
        payload.course_code,
      ]
        .map(normalizeCourseName)
        .filter(Boolean);

      const selectedNames = [
        selectedCourse.code,
        selectedCourse.title,
      ]
        .map(normalizeCourseName)
        .filter(Boolean);

      const nameMatches = workflowNames.some((name) =>
        selectedNames.includes(name)
      );

      if (!idMatches && !nameMatches) {
        return false;
      }
    }

    return true;
  });

  const waitingDependencyWorkflows = workflows.filter(
    (workflow) => {
      if (!workflowBelongsToTeacherCourse(workflow)) {
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
        dependencyStatus === 'waiting_for_lecture'
      );
    }
  );

  const handleAuthorize = async (workflow: WorkflowItem) => {
    setExecutingWorkflowId(workflow.id);

    setExecutionLog({
      step: 1,
      message:
        'Starting supervised Moellim browser automation...',
    });

    try {
      const success = await executeWorkflowDirectly(
        workflow.id,
        (step, message) => {
          setExecutionLog({ step, message });
        }
      );

      if (success) {
        addToast(
          'success',
          'Executed on Moellim',
          `Workflow "${workflow.title}" completed successfully.`
        );
      }
    } catch (error) {
      console.error(
        '[Approvals] Workflow execution failed:',
        error
      );

      addToast(
        'error',
        'Execution Failed',
        'MUAWIN could not complete the workflow. Check the backend logs before retrying.'
      );
    } finally {
      setExecutingWorkflowId(null);
      setExecutionLog(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingWorkflow) return;

    try {
      await rejectWorkflow(
        rejectingWorkflow.id,
        rejectionReason
      );

      setRejectingWorkflow(null);
      setRejectionReason('');
    } catch (error) {
      console.error(
        '[Approvals] Could not reject workflow:',
        error
      );
      // Keep the rejection dialog open so the teacher can retry.
    }
  };

  const renderDetail = (
    label: string,
    value: unknown,
    fallback = 'Not specified'
  ) => (
    <div className="min-w-0">
      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="mt-1 block break-words text-xs font-semibold text-slate-800">
        {displayText(value, fallback)}
      </span>
    </div>
  );

  const renderBulletList = (
    items: unknown,
    emptyMessage: string
  ) => {
    if (!Array.isArray(items) || items.length === 0) {
      return (
        <p className="text-xs text-slate-500">
          {emptyMessage}
        </p>
      );
    }

    return (
      <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-700">
        {items.map((item: any, index: number) => (
          <li key={index}>
            {typeof item === 'object' && item !== null
              ? displayText(
                  firstValue(
                    item.question,
                    item.text,
                    item.content,
                    item.title,
                    JSON.stringify(item)
                  )
                )
              : String(item)}
          </li>
        ))}
      </ul>
    );
  };

  return (
    <div className="mx-auto max-w-5xl animate-in fade-in duration-200 space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div>

          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">
            Pending Approvals
          </h2>

          <p className="mt-0.5 text-xs text-slate-500">
            Review the proposed content and target course before
            authorizing actions on Moellim.
          </p>
        </div>

        <span className="rounded-xl border border-amber-200 bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900">
          {pendingWorkflows.length} Action
          {pendingWorkflows.length === 1 ? '' : 's'} Pending
        </span>
      </div>

      {/* Course filter */}
      <div className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <span className="text-xs font-bold text-slate-700">
            Filter by Assigned Course
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCourseFilter('all')}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
              activeCourseFilter === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All My Courses ({courses.length})
          </button>

          {courses.map((course) => (
            <button
              key={course.id}
              onClick={() => setActiveCourseFilter(course.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${
                activeCourseFilter === course.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {course.code} ({course.section})
            </button>
          ))}
        </div>
      </div>

      {/* Workflows waiting for a prerequisite */}
      {waitingDependencyWorkflows.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-amber-700" />
            <h3 className="font-semibold text-amber-900">
              Waiting for Prerequisites
            </h3>
          </div>

          <div className="mt-3 space-y-2">
            {waitingDependencyWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className="rounded-lg bg-white p-3"
              >
                <p className="text-sm font-semibold text-slate-800">
                  {workflow.title}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Waiting for the required lecture to complete
                  before the dependent assignment workflow can
                  continue.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending approvals */}
      {pendingWorkflows.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-6 w-6" />
          </div>

          <h3 className="text-base font-bold text-slate-900">
            All Clear! No Pending Approvals
          </h3>

          <p className="mx-auto max-w-md text-xs text-slate-500">
            There are no workflows awaiting approval for your
            assigned courses. Start a task from the AI Assistant
            to prepare a new workflow.
          </p>

          <div className="flex justify-center gap-2 pt-2">
            <button
              onClick={() => navigate('/assistant')}
              className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-blue-700"
            >
              Ask MUAWIN
            </button>

            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {pendingWorkflows.map((workflow) => {
            const isCurrentlyExecuting =
              executingWorkflowId === workflow.id;

            const {
              payload,
              lecture,
              assignment,
              isCombined,
            } = getWorkflowDrafts(workflow);
            const backendDraft = asRecord(payload.backendDraft);

            const lectureHeading = firstValue(
              lecture.heading,
              lecture.title,
              lecture.name,
              payload.heading
            );

            const lectureDescription = firstValue(
              lecture.description,
              lecture.summary,
              lecture.content,
              payload.description
            );

            const keyPoints = firstValue(
              lecture.key_points,
              lecture.keyPoints,
              lecture.topics,
              lecture.highlights
            );

            const assignmentTitle = firstValue(
              assignment.title,
              assignment.assignment_title,
              payload.assignment_title,
              payload.assignmentTitle
            );

            const assignmentDescription = firstValue(
              assignment.description,
              assignment.instructions,
              assignment.intro
            );

            const assignmentQuestions = firstValue(
              assignment.questions,
              assignment.items
            );

            const assignmentMarks = firstValue(
              assignment.total_marks,
              assignment.totalMarks,
              assignment.marks,
              assignment.max_marks,
              assignment.max_grade
            );

            const assignmentDeadline = firstValue(
              assignment.deadline,
              assignment.due_date,
              assignment.dueDate,
              assignment.due_datetime,
              assignment.duedate
            );

            const lectureWeek = firstValue(
              lecture.week,
              lecture.week_number,
              lecture.weekNumber,
              backendDraft.week
            );

            const assignmentWeek = firstValue(
              assignment.week,
              assignment.week_number,
              assignment.weekNumber,
              backendDraft.week
            );

            return (
              <div
                key={workflow.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs transition-all"
              >
                {/* Workflow header */}
                <div className="flex flex-col justify-between gap-2 border-b border-slate-200/80 bg-slate-50/90 p-4 sm:flex-row sm:items-center">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                      {workflow.courseCode || 'Course'}
                    </span>

                    <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700">
                      {isCombined
                        ? 'Lecture + Assignment'
                        : workflow.actionType}
                    </span>

                    {isCombined && (
                      <span className="rounded bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-800">
                        Combined Workflow
                      </span>
                    )}

                    <span className="text-[11px] text-slate-400">
                      Source: {workflow.requestedBy || 'MUAWIN'}
                    </span>
                  </div>

                  <span className="flex items-center gap-1 text-xs text-slate-500">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    Created at {workflow.createdAt || 'Recently'}
                  </span>
                </div>

                <div className="space-y-4 p-5">
                  {/* Main workflow description */}
                  <div>
                    <h4 className="text-base font-bold text-slate-900">
                      {workflow.title}
                    </h4>

                    <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">
                      {displayText(
                        firstValue(
                          payload.description,
                          payload.message,
                          payload.instruction,
                          (workflow as any).instructionText
                        ),
                        'Review the proposed workflow details below before execution.'
                      )}
                    </p>
                  </div>

                  {/* General workflow details */}
                  <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200/70 bg-slate-50 p-3.5 text-xs sm:grid-cols-2 lg:grid-cols-3">
                    {renderDetail(
                      'Target Course',
                      firstValue(
                        payload.course,
                        payload.courseName,
                        workflow.courseCode
                      )
                    )}

                    {renderDetail(
                      'Target Section',
                      firstValue(
                        payload.targetSection,
                        workflow.courseCode
                      )
                    )}

                    {payload.dueDate &&
                      renderDetail(
                        'Due Date',
                        payload.dueDate
                      )}

                    {payload.totalMarks !== undefined &&
                      renderDetail(
                        'Assessment Marks',
                        `${payload.totalMarks} marks`
                      )}

                    {payload.submissionType &&
                      renderDetail(
                        'Submission Mode',
                        payload.submissionType
                      )}
                  </div>

                  {/* Combined lecture and assignment preview */}
                  {isCombined && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                        <Layers className="h-5 w-5 text-violet-600" />
                        <h5 className="text-sm font-bold text-slate-900">
                          Combined Workflow Review
                        </h5>
                      </div>

                      {/* Lecture draft */}
                      <section className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
                        <div className="flex items-center gap-2">
                          <BookOpen className="h-5 w-5 text-blue-700" />
                          <div>
                            <h6 className="text-sm font-bold text-blue-950">
                              1. Lecture Upload
                            </h6>
                            <p className="text-[11px] text-blue-800">
                              Review the lecture content before upload.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {renderDetail(
                            'Lecture Heading',
                            lectureHeading,
                            'Lecture heading not provided'
                          )}

                          {renderDetail(
                            'Target Week',
                            lectureWeek
                              ? `Week ${lectureWeek}`
                              : firstValue(
                                  payload.week,
                                  payload.targetWeek
                                )
                              ? `Week ${firstValue(
                                  payload.week,
                                  payload.targetWeek
                                )}`
                              : undefined
                          )}

                          {renderDetail(
                            'Lecture File',
                            firstValue(
                              lecture.file_name,
                              lecture.fileName,
                              lecture.filename,
                              lecture.material_name,
                              lecture.materialName,
                              payload.fileName,
                              backendDraft.file_name
                            )
                          )}

                          {renderDetail(
                            'Source Material',
                            firstValue(
                              lecture.source_label,
                              lecture.sourceLabel,
                              assignment.source_label,
                              assignment.sourceLabel,
                              lecture.source,
                              lecture.file_path,
                              lecture.filePath,
                              backendDraft.file_name
                            )
                          )}
                        </div>

                        {lectureDescription !== undefined && (
                          <div className="rounded-lg border border-blue-100 bg-white p-3">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Lecture Description / Summary
                            </p>
                            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                              {displayText(lectureDescription)}
                            </p>
                          </div>
                        )}

                        {keyPoints !== undefined && (
                          <div className="rounded-lg border border-blue-100 bg-white p-3">
                            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Key Points
                            </p>
                            {renderBulletList(
                              keyPoints,
                              'No key points supplied.'
                            )}
                          </div>
                        )}

                        {Object.keys(lecture).length === 0 && (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                            The combined workflow was detected, but
                            the lecture draft was not found in the
                            expected response fields. Check the
                            backend response and workflowService
                            normalization.
                          </p>
                        )}
                      </section>

                      {/* Assignment draft */}
                      <section className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                        <div className="flex items-center gap-2">
                          <ListChecks className="h-5 w-5 text-violet-700" />
                          <div>
                            <h6 className="text-sm font-bold text-violet-950">
                              2. Assignment Creation
                            </h6>
                            <p className="text-[11px] text-violet-800">
                              Review the assignment before it is
                              created on Moellim.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {renderDetail(
                            'Assignment Title',
                            assignmentTitle,
                            'Assignment title not provided'
                          )}

                          {renderDetail(
                            'Total Marks',
                            assignmentMarks !== undefined
                              ? `${assignmentMarks} marks`
                              : undefined
                          )}

                          {renderDetail(
                            'Target Week',
                            assignmentWeek
                              ? `Week ${assignmentWeek}`
                              : undefined
                          )}

                          {renderDetail(
                            'Deadline',
                            assignmentDeadline
                          )}

                          {renderDetail(
                            'Question Count',
                            Array.isArray(assignmentQuestions)
                              ? assignmentQuestions.length
                              : firstValue(
                                  assignment.question_count,
                                  assignment.questionCount
                                )
                          )}
                        </div>

                        {assignmentDescription !== undefined && (
                          <div className="rounded-lg border border-violet-100 bg-white p-3">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                              Assignment Instructions
                            </p>
                            <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700">
                              {displayText(assignmentDescription)}
                            </p>
                          </div>
                        )}

                        {Array.isArray(assignmentQuestions) &&
                          assignmentQuestions.length > 0 && (
                            <div className="rounded-lg border border-violet-100 bg-white p-3">
                              <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                <FileText className="h-3.5 w-3.5" />
                                Proposed Questions
                              </p>

                              <ol className="list-decimal space-y-3 pl-5">
                                {assignmentQuestions.map(
                                  (question: any, index: number) => {
                                    const questionRecord =
                                      asRecord(question);

                                    const questionText =
                                      typeof question === 'string'
                                        ? question
                                        : firstValue(
                                            questionRecord.question,
                                            questionRecord.text,
                                            questionRecord.content,
                                            questionRecord.prompt,
                                            questionRecord.title
                                          );

                                    return (
                                      <li
                                        key={index}
                                        className="break-words text-xs leading-relaxed text-slate-700"
                                      >
                                        <p>
                                          {displayText(
                                            questionText,
                                            'Question text unavailable'
                                          )}
                                        </p>

                                        {(questionRecord.marks !==
                                          undefined ||
                                          questionRecord.type) && (
                                          <p className="mt-1 text-[10px] font-semibold text-slate-500">
                                            {questionRecord.type
                                              ? `${questionRecord.type}`
                                              : ''}
                                            {questionRecord.type &&
                                            questionRecord.marks !==
                                              undefined
                                              ? ' Ã‚Â· '
                                              : ''}
                                            {questionRecord.marks !==
                                            undefined
                                              ? `${questionRecord.marks} marks`
                                              : ''}
                                          </p>
                                        )}
                                      </li>
                                    );
                                  }
                                )}
                              </ol>
                            </div>
                          )}

                        {Object.keys(assignment).length === 0 && (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                            The combined workflow was detected, but
                            the assignment draft was not found in
                            the expected response fields. Check the
                            backend response and workflowService
                            normalization.
                          </p>
                        )}
                      </section>

                      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
                        <strong>Teacher approval required:</strong>{' '}
                        Review both sections above before authorizing
                        execution. Verify the target course, week,
                        lecture file, assignment questions, marks,
                        and deadline.
                      </p>
                    </div>
                  )}

                  {/* Live execution feedback */}
                  {isCurrentlyExecuting && executionLog && (
                    <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-600" />
                        Moellim Automation in Progress
                      </div>

                      <p className="font-mono text-xs text-blue-800">
                        Step {executionLog.step}: {executionLog.message}
                      </p>
                    </div>
                  )}

                  {/* Approval actions */}
                  <div className="flex flex-col justify-between gap-3 border-t border-slate-100 pt-3 sm:flex-row sm:items-center">
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      <span>
                        Authorization starts controlled browser
                        automation on Moellim.
                      </span>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                      <button
                        onClick={() => setRejectingWorkflow(workflow)}
                        disabled={isCurrentlyExecuting}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 px-4 py-2.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject
                      </button>

                      <button
                        onClick={() => handleAuthorize(workflow)}
                        disabled={isCurrentlyExecuting}
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        {isCurrentlyExecuting
                          ? 'Executing...'
                          : 'Authorize & Execute on Moellim'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Rejection confirmation modal */}
      {rejectingWorkflow && (
        <div className="fixed inset-0 z-50 flex animate-in items-center justify-center bg-slate-900/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md animate-in rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600">
                <AlertTriangle className="h-5 w-5" />
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Reject Workflow Proposal?
                </h4>
                <p className="text-xs text-slate-500">
                  {rejectingWorkflow.title}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs font-bold text-slate-700">
                Instructor Justification (Optional)
              </label>

              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(event) =>
                  setRejectionReason(event.target.value)
                }
                placeholder="Explain why you are rejecting this workflow..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-xs focus:outline-blue-600"
              />
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
              <button
                onClick={() => {
                  setRejectingWorkflow(null);
                  setRejectionReason('');
                }}
                className="rounded-xl px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmReject}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


