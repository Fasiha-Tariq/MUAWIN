import React from 'react';
import { Course } from '../../types';
import { Users, Clock, ArrowRight, BookOpen, CheckCircle2, Mic2, Sparkles, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface CourseCardProps {
  course: Course;
  isSelected?: boolean;
  onSelect?: () => void;
  onViewLectures?: (course: Course) => void;
}

export const CourseCard: React.FC<CourseCardProps> = ({ 
  course, 
  isSelected = false, 
  onSelect,
  onViewLectures 
}) => {
  const navigate = useNavigate();

  return (
    <div 
      className={`rounded-xl p-5 border transition-all duration-150 flex flex-col justify-between relative cursor-pointer ${
        isSelected 
          ? 'bg-blue-50/40 border-blue-500 shadow-md ring-2 ring-blue-500/20' 
          : 'bg-white border-slate-200/90 shadow-xs hover:shadow-md hover:border-slate-300'
      }`}
      onClick={onSelect}
    >
      {/* Selected Active Context Pill */}
      {isSelected && (
        <div className="absolute -top-2.5 right-4 bg-blue-600 text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          <span>Active Context</span>
        </div>
      )}

      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 shrink-0">
                {course.code}
              </span>
              <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded shrink-0">
                {course.section}
              </span>
            </div>
            <h4 className="text-sm font-bold text-slate-900 mt-2 tracking-tight break-words leading-snug">
              {course.title}
            </h4>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{course.studentsCount} Students Enrolled</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span>{course.creditHours} Credits</span>
          </span>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 min-w-0">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Moellim Progress & Last Activity</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-700 min-w-0">
            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="truncate flex-1">{course.recentActivity}</span>
            <span className="text-slate-400 shrink-0">•</span>
            <span className="text-slate-500 shrink-0 text-[11px]">{course.recentActivityTime}</span>
          </div>
        </div>
      </div>

      <div className="mt-5 pt-3 border-t border-slate-100/80 flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isSelected ? (
            <span className="text-[11px] font-bold text-blue-700 bg-blue-100/60 px-2 py-1 rounded-lg">
              Selected Working Course
            </span>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              className="text-xs font-semibold text-slate-700 hover:text-blue-700 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 transition-colors cursor-pointer"
            >
              Select Course
            </button>
          )}

          {onViewLectures && (
            <button
              type="button"
              onClick={() => onViewLectures(course)}
              className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-2 py-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Lectures
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              if (onSelect) onSelect();
              navigate('/assistant', { state: { courseId: course.id, courseName: course.title } });
            }}
            title="Ask AI Assistant about this course"
            className="p-2 text-blue-600 hover:bg-blue-100/60 rounded-lg transition-colors cursor-pointer"
            aria-label={`Ask AI Assistant about ${course.code}`}
          >
            <Sparkles className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (onSelect) onSelect();
              navigate('/lecture', { state: { courseId: course.id } });
            }}
            className="text-xs font-bold text-slate-800 hover:text-white px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-900 transition-all flex items-center gap-1 cursor-pointer"
          >
            <Mic2 className="w-3.5 h-3.5 text-rose-500" />
            <span>Class Mode</span>
          </button>
        </div>
      </div>
    </div>
  );
};

