import { request } from '../../../lib/http';
import type {
  AnswerListQuery,
  PageResult,
  QuestionListQuery,
  StudentListQuery,
  TeacherQuestionDetail,
  TeacherQuestionRow,
  TeacherStudentDetail,
  TeacherStudentsPage,
} from './types';

const base = (classroomId: string) =>
  `/api/staff/classrooms/${encodeURIComponent(classroomId)}/learning`;
function searchParams(query: StudentListQuery | QuestionListQuery | AnswerListQuery) {
  return new URLSearchParams(Object.entries(query).map(([key, value]) => [key, String(value)]));
}
export const getTeacherStudents = (
  classroomId: string,
  query: StudentListQuery,
  signal?: AbortSignal,
) =>
  request<TeacherStudentsPage>(`${base(classroomId)}/students?${searchParams(query)}`, { signal });
export const getTeacherStudent = (
  classroomId: string,
  studentId: string,
  query: AnswerListQuery,
  signal?: AbortSignal,
) =>
  request<TeacherStudentDetail>(
    `${base(classroomId)}/students/${encodeURIComponent(studentId)}?${searchParams(query)}`,
    { signal },
  );
export const getTeacherQuestions = (
  classroomId: string,
  query: QuestionListQuery,
  signal?: AbortSignal,
) =>
  request<PageResult<TeacherQuestionRow>>(`${base(classroomId)}/questions?${searchParams(query)}`, {
    signal,
  });
export const getTeacherQuestion = (classroomId: string, questionId: number, signal?: AbortSignal) =>
  request<TeacherQuestionDetail>(`${base(classroomId)}/questions/${questionId}`, { signal });
