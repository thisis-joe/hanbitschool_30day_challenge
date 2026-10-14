import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '../../auth/queries';
import { request } from '../../../lib/http';
import type { ClassroomSummary } from '../types';
import {
  getTeacherQuestion,
  getTeacherQuestions,
  getTeacherStudent,
  getTeacherStudents,
} from './api';
import type { AnswerListQuery, QuestionListQuery, StudentListQuery } from './types';

export const teacherLearningKeys = {
  classroom: (accountId: string | undefined, classroomId: string) =>
    ['teacher-learning', accountId, classroomId, 'classroom'] as const,
  students: (accountId: string | undefined, classroomId: string, query: StudentListQuery) =>
    ['teacher-learning', accountId, classroomId, 'students', query] as const,
  student: (
    accountId: string | undefined,
    classroomId: string,
    studentId: string,
    query: AnswerListQuery,
  ) => ['teacher-learning', accountId, classroomId, 'student', studentId, query] as const,
  questions: (accountId: string | undefined, classroomId: string, query: QuestionListQuery) =>
    ['teacher-learning', accountId, classroomId, 'questions', query] as const,
  question: (accountId: string | undefined, classroomId: string, questionId: number | null) =>
    ['teacher-learning', accountId, classroomId, 'question', questionId] as const,
};
function useStaffOwner() {
  const { data: me } = useCurrentAccount();
  return {
    accountId: me?.accountId,
    enabled: !!me && (me.role === 'TEACHER' || me.role === 'ADMIN') && !me.mustChangePassword,
  };
}
export function useTeacherClassroom(classroomId: string) {
  const owner = useStaffOwner();
  return useQuery({
    queryKey: teacherLearningKeys.classroom(owner.accountId, classroomId),
    queryFn: ({ signal }) =>
      request<ClassroomSummary[]>('/api/staff/classrooms?scope=SCHOOL', { signal }),
    select: (rows) => rows.find((row) => row.id === classroomId),
    enabled: owner.enabled && !!classroomId,
  });
}
export function useTeacherStudents(classroomId: string, query: StudentListQuery) {
  const owner = useStaffOwner();
  return useQuery({
    queryKey: teacherLearningKeys.students(owner.accountId, classroomId, query),
    queryFn: ({ signal }) => getTeacherStudents(classroomId, query, signal),
    enabled: owner.enabled && !!classroomId,
    retry: false,
  });
}
export function useTeacherStudent(classroomId: string, studentId: string, query: AnswerListQuery) {
  const owner = useStaffOwner();
  return useQuery({
    queryKey: teacherLearningKeys.student(owner.accountId, classroomId, studentId, query),
    queryFn: ({ signal }) => getTeacherStudent(classroomId, studentId, query, signal),
    enabled: owner.enabled && !!classroomId && !!studentId,
    retry: false,
  });
}
export function useTeacherQuestions(classroomId: string, query: QuestionListQuery, active = true) {
  const owner = useStaffOwner();
  return useQuery({
    queryKey: teacherLearningKeys.questions(owner.accountId, classroomId, query),
    queryFn: ({ signal }) => getTeacherQuestions(classroomId, query, signal),
    enabled: owner.enabled && !!classroomId && active,
    retry: false,
  });
}
export function useTeacherQuestion(classroomId: string, questionId: number | null) {
  const owner = useStaffOwner();
  return useQuery({
    queryKey: teacherLearningKeys.question(owner.accountId, classroomId, questionId),
    queryFn: ({ signal }) => getTeacherQuestion(classroomId, questionId!, signal),
    enabled: owner.enabled && !!classroomId && questionId !== null,
    retry: false,
  });
}
