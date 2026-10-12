export interface CreateTeacherCommand {
  name: string;
  staffLoginId: string;
}
export interface TeacherIssued {
  accountId: string;
  staffLoginId: string;
  name: string;
  initialPassword: string;
}
export interface TeacherSummary {
  accountId: string;
  name: string;
  staffLoginId: string;
  mustChangePassword: boolean;
}
export interface CreateClassroomCommand {
  gradeLabel: string;
  classNumber: number;
  startDate: string;
}
export interface ClassroomSummary {
  id: string;
  gradeLabel: string;
  classNumber: number;
  startDate: string;
  studentCount: number;
  canManage: boolean;
  joinCode: string | null;
}
export interface StudentRosterRow {
  accountId: string;
  gradeLabel: string;
  classNumber: number;
  studentNumber: number;
  name: string;
}
