export type Role = 'STUDENT' | 'TEACHER' | 'ADMIN';
export interface StudentMe {
  accountId: string;
  role: 'STUDENT';
  schoolId: string;
  schoolName: string;
  classroomId: string;
  gradeLabel: string;
  classNumber: number;
  studentNumber: number;
  name: string;
  nickname: string;
}
export interface StaffMe {
  accountId: string;
  role: 'TEACHER' | 'ADMIN';
  schoolId: string;
  schoolName: string;
  name: string;
  staffLoginId: string;
  mustChangePassword: boolean;
}
export type AccountMe = StudentMe | StaffMe;
export interface SchoolOption {
  id: string;
  name: string;
}
export interface ClassroomOption {
  id: string;
  gradeLabel: string;
  classNumber: number;
}
export interface ApiError {
  code: string;
  message: string;
  fieldErrors: Record<string, string>;
}
export interface ClassroomSelection {
  schoolId: string;
  gradeLabel: string;
  classNumber: number;
}
export interface StudentLoginCommand extends ClassroomSelection {
  studentNumber: number;
  password: string;
}
export interface StudentRegistrationCommand extends StudentLoginCommand {
  name: string;
  nickname: string;
  classCode: string;
}
export interface StaffLoginCommand {
  staffLoginId: string;
  password: string;
}
export interface ChangePasswordCommand {
  currentPassword: string;
  newPassword: string;
}
export interface ResolveClassroomCommand extends ClassroomSelection {
  classCode: string;
}
