import { request } from '../../lib/http';
import type {
  AccountMe,
  StudentMe,
  StaffMe,
  SchoolOption,
  ClassroomOption,
  StudentRegistrationCommand,
  StudentLoginCommand,
  StaffLoginCommand,
  ChangePasswordCommand,
  ResolveClassroomCommand,
} from './types';
const post = <T>(path: string, body: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });
export const getSchools = () => request<SchoolOption[]>('/api/public/schools');
export const getClassrooms = (school: string) =>
  request<ClassroomOption[]>('/api/public/schools/' + encodeURIComponent(school) + '/classrooms');
export const resolveClassroom = (c: ResolveClassroomCommand) =>
  post<ClassroomOption>('/api/public/classrooms/resolve', c);
export const registerStudent = (c: StudentRegistrationCommand) =>
  post<StudentMe>('/api/auth/students/register', c);
export const loginStudent = (c: StudentLoginCommand) =>
  post<StudentMe>('/api/auth/students/login', c);
export const loginStaff = (c: StaffLoginCommand) => post<StaffMe>('/api/auth/staff/login', c);
export async function getMe(): Promise<AccountMe> {
  const me = await request<AccountMe>('/api/auth/me');
  if (!me || !['STUDENT', 'TEACHER', 'ADMIN'].includes(me.role))
    throw new Error('계정 정보를 확인할 수 없습니다.');
  return me;
}
export const changePassword = (c: ChangePasswordCommand) =>
  post<AccountMe>('/api/auth/password', c);
export const logout = () => post<void>('/api/auth/logout', {});
