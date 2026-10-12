import { request } from '../../lib/http';
import type {
  CreateTeacherCommand,
  TeacherIssued,
  TeacherSummary,
  CreateClassroomCommand,
  ClassroomSummary,
  StudentRosterRow,
} from './types';
export const issueTeacher = (c: CreateTeacherCommand) =>
  request<TeacherIssued>('/api/admin/teachers', { method: 'POST', body: JSON.stringify(c) });
export const getTeachers = () => request<TeacherSummary[]>('/api/admin/teachers');
export const createClassroom = (c: CreateClassroomCommand) =>
  request<ClassroomSummary>('/api/staff/classrooms', { method: 'POST', body: JSON.stringify(c) });
export const getStaffClassrooms = (scope: 'MINE' | 'SCHOOL') =>
  request<ClassroomSummary[]>('/api/staff/classrooms?scope=' + scope);
export const getRoster = (id: string) =>
  request<StudentRosterRow[]>('/api/staff/classrooms/' + encodeURIComponent(id) + '/students');
