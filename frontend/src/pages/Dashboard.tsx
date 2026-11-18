import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Mic2,
  CheckSquare,
  BookOpen,
  FileText,
  Clock,
  CheckCircle2,
  Activity,
  ShieldCheck,
  Calendar,
  X,
} from 'lucide-react';

import { useApp } from '../context/AppContext';
import { QuickActionCard } from '../components/dashboard/QuickActionCard';
import { StatCard } from '../components/common/StatCard';
import { CourseCard } from '../components/dashboard/CourseCard';
import { PendingApprovalsMini } from '../components/dashboard/PendingApprovalsMini';
import { RecentActivityList } from '../components/dashboard/RecentActivityList';
import { ClassModeStatusCard } from '../components/dashboard/ClassModeStatusCard';

import { Course } from '../types';
import {
  lectureService,
  CourseLectureSyllabusItem as CourseLecture,
} from '../services/lectureService';

export const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const {
    user,
    courses,
    coursesLoading,
    selectedCourse,
    selectCourse,
    workflows,
    activityLogs,
    stats,
  } = useApp();
  console.log(
  '[DASHBOARD] courses:',
  courses
);

console.log(
  '[DASHBOARD] courses.length:',
  courses.length
);

console.log(
  '[DASHBOARD] coursesLoading:',
  coursesLoading
);
  const [lecturesModalCourse, setLecturesModalCourse] =
    useState<Course | null>(null);

  const [courseLectures, setCourseLectures] =
    useState<CourseLecture[]>([]);

  const [loadingLectures, setLoadingLectures] =
    useState(false);

  // ---------------------------------------------------------
  // Open lecture history for a selected course
  // ---------------------------------------------------------
  const handleOpenLectures = async (course: Course) => {
    setLecturesModalCourse(course);
    setCourseLectures([]);
    setLoadingLectures(true);

    try {
      const list = await lectureService.getCourseLectures(course.id);
      setCourseLectures(list);
    } catch (error) {
      console.error(
        '[Dashboard] Failed to load course lectures:',
        error
      );
      setCourseLectures([]);
    } finally {
      setLoadingLectures(false);
    }
  };

  // ---------------------------------------------------------
  // Close lecture modal
  // ---------------------------------------------------------
  const handleCloseLectures = () => {
    setLecturesModalCourse(null);
    setCourseLectures([]);
    setLoadingLectures(false);
  };

  // ---------------------------------------------------------
  // Loading skeleton for courses
  // ---------------------------------------------------------
  const CourseLoadingSkeleton = () => (
    <>
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm animate-pulse"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-3 flex-1">
              <div className="h-4 bg-slate-200 rounded w-24" />
              <div className="h-5 bg-slate-200 rounded w-3/4" />
              <div className="h-3 bg-slate-200 rounded w-1/2" />
            </div>

            <div className="w-10 h-10 bg-slate-200 rounded-xl" />
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="h-3 bg-slate-200 rounded w-2/3" />
          </div>
        </div>
      ))}
    </>
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* =====================================================
          PAGE HEADING & TEACHER IDENTITY
      ====================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200/80 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-wider flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Moellim Teacher Portal</span>
            </span>

            <span className="text-xs text-slate-400">•</span>

            <span className="text-xs font-medium text-slate-500">
              {user?.id}
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
            Welcome, {user?.name || 'Teacher'}
          </h2>

          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {user?.department} •{' '}
            {coursesLoading
              ? 'Loading your assigned courses from Moellim...'
              : `Showing your ${courses.length} assigned courses on Moellim`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-xs flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Riphah International University</span>
          </span>
        </div>
      </div>
{/* =====================================================
          ACTIVE COURSE CONTEXT
      ====================================================== */}
      {selectedCourse && !coursesLoading && (
        <div className="bg-gradient-to-r from-blue-50/90 via-indigo-50/70 to-white text-slate-900 rounded-2xl p-4 sm:p-5 shadow-sm border border-blue-200/80 relative overflow-hidden">
          <div className="absolute right-0 top-0 w-80 h-full bg-blue-500/[0.04] skew-x-12 pointer-events-none" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-extrabold uppercase tracking-wider bg-blue-100/80 text-blue-700 border border-blue-200 px-2 py-0.5 rounded">
                  Current Active Course Context
                </span>

                <span className="text-xs text-slate-500 font-medium">
                  {selectedCourse.section || 'Current Section'} •{' '}
                  {selectedCourse.studentsCount} Students
                </span>
              </div>

              <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight break-words">
                {selectedCourse.code} — {selectedCourse.title}
              </h3>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={() => navigate('/lecture')}
                className="px-3.5 py-2 text-xs font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:text-slate-900 rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Mic2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Class Mode</span>
              </button>

              <button
                onClick={() =>
                  navigate('/assistant', {
                    state: {
                      courseId: selectedCourse.id,
                      courseName: selectedCourse.title,
                    },
                  })
                }
                className="px-3.5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>Ask MUAWIN</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          AUTOMATIC SCHEDULED CLASS MODE
      ====================================================== */}
      <ClassModeStatusCard />

      

      

      {/* =====================================================
          ACADEMIC WORKFLOW METRICS
      ====================================================== */}
      
      {/* =====================================================
          PENDING APPROVALS + RECENT ACTIVITY
      ====================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <PendingApprovalsMini workflows={workflows} />
        <RecentActivityList logs={activityLogs} />
      </div>

      {/* =====================================================
          ASSIGNED COURSES
      ====================================================== */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                My Assigned Courses
              </h3>

              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                {coursesLoading ? 'Loading...' : `${courses.length} Sections`}
              </span>
            </div>

            <p className="text-xs text-slate-500 mt-0.5">
              {coursesLoading
                ? 'Retrieving your assigned courses from Riphah Moellim...'
                : `Only displaying courses assigned to ${user?.name || 'the logged-in teacher'} on Riphah Moellim. Click any course to set it as active working context.`}
            </p>
          </div>

          <div className="text-xs text-slate-400 hidden sm:block">
            Live Moellim Course Roster
          </div>
        </div>

        {/* ---------------------------------------------------
            COURSE LOADING
        ---------------------------------------------------- */}
        {coursesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <CourseLoadingSkeleton />
          </div>
        ) : courses.length > 0 ? (
          /* -------------------------------------------------
             COURSE CARDS
          -------------------------------------------------- */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                isSelected={selectedCourse?.id === course.id}
                onSelect={() => selectCourse(course.id)}
                onViewLectures={handleOpenLectures}
              />
            ))}
          </div>
        ) : (
          /* -------------------------------------------------
             EMPTY COURSE STATE
          -------------------------------------------------- */
          <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
              <BookOpen className="w-6 h-6 text-slate-400" />
            </div>

            <h4 className="text-sm font-bold text-slate-900">
              No Assigned Courses Found
            </h4>

            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              MUAWIN could not find any courses assigned to this
              teacher on Moellim. Please verify the Moellim account
              and course assignment.
            </p>
          </div>
        )}
      </div>

      {/* =====================================================
          COURSE LECTURES MODAL
      ====================================================== */}
      {lecturesModalCourse && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="min-w-0 pr-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded shrink-0">
                    {lecturesModalCourse.code}
                  </span>

                  {lecturesModalCourse.section && (
                    <span className="text-xs text-slate-500 font-semibold">
                      {lecturesModalCourse.section}
                    </span>
                  )}
                </div>

                <h4 className="text-sm font-bold text-slate-900 mt-1 truncate">
                  {lecturesModalCourse.title}
                </h4>
              </div>

              <button
                onClick={handleCloseLectures}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition-colors shrink-0"
                aria-label="Close lecture history"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1 min-h-0">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Recorded & Scheduled Lecture Sessions
              </p>

              {loadingLectures ? (
                <div className="py-8 text-center">
                  <div className="flex justify-center mb-3">
                    <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                  </div>

                  <p className="text-xs text-slate-500">
                    Loading course syllabus and lecture schedule
                    from Moellim...
                  </p>
                </div>
              ) : courseLectures.length === 0 ? (
                <div className="py-8 text-center">
                  <BookOpen className="w-8 h-8 mx-auto text-slate-300 mb-2" />

                  <p className="text-xs text-slate-500">
                    No lectures recorded yet for this course.
                  </p>
                </div>
              ) : (
                courseLectures.map((lec) => (
                  <div
                    key={lec.id}
                    className="p-3.5 rounded-xl border border-slate-200/80 hover:border-slate-300 bg-white transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-slate-800 whitespace-nowrap">
                          Lecture{' '}
                          {lec.lectureNumber
                            .toString()
                            .padStart(2, '0')}
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            lec.status === 'Completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {lec.status}
                        </span>
                      </div>

                      <span className="text-xs text-slate-400 flex items-center gap-1 whitespace-nowrap">
                        <Calendar className="w-3 h-3" />
                        <span>{lec.date}</span>
                      </span>
                    </div>

                    <h5 className="text-xs font-bold text-slate-900">
                      {lec.topic}
                    </h5>

                    <p className="text-[11px] text-slate-500">
                      {lec.summary}
                    </p>

                    <div className="flex items-center justify-between gap-3 pt-2 mt-2 border-t border-slate-100 text-[11px]">
                      <span className="text-slate-500">
                        {lec.tasksExtracted > 0
                          ? `${lec.tasksExtracted} tasks identified`
                          : 'No action items'}
                      </span>

                      {lec.status === 'Upcoming' ? (
                        <button
                          onClick={() => {
                            selectCourse(lecturesModalCourse.id);
                            setLecturesModalCourse(null);

                            navigate('/lecture', {
                              state: {
                                courseId:
                                  lecturesModalCourse.id,
                              },
                            });
                          }}
                          className="font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 whitespace-nowrap"
                        >
                          <Mic2 className="w-3 h-3 text-rose-500" />
                          <span>Start This Session</span>
                        </button>
                      ) : (
                        <span className="text-emerald-700 font-semibold flex items-center gap-1 whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Synced to Moellim</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                onClick={() => {
                  selectCourse(lecturesModalCourse.id);
                  setLecturesModalCourse(null);
                }}
                className="text-xs font-bold text-blue-700 hover:underline"
              >
                Set as Active Working Course
              </button>

              <button
                onClick={handleCloseLectures}
                className="px-4 py-2 text-xs font-bold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
