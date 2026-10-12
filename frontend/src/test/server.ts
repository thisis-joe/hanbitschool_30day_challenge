import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
export const student = {
  accountId: 'student-a',
  role: 'STUDENT',
  schoolId: 'school-a',
  schoolName: '한빛학교',
  classroomId: 'class-a',
  gradeLabel: '1학년',
  classNumber: 1,
  studentNumber: 1,
  name: '김민수',
  nickname: '숲친구',
};
export const teacher = {
  accountId: 'teacher-a',
  role: 'TEACHER',
  schoolId: 'school-a',
  schoolName: '한빛학교',
  name: '교사',
  staffLoginId: 'teacher.a',
  mustChangePassword: false,
};
export const server = setupServer(
  http.get('*/api/student/learning/questions', () => HttpResponse.json([])),
  http.get('*/api/auth/csrf', () =>
    HttpResponse.json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' }),
  ),
  http.get('*/api/auth/me', () =>
    HttpResponse.json(
      { code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.', fieldErrors: {} },
      { status: 401 },
    ),
  ),
  http.get('*/api/public/schools', () =>
    HttpResponse.json([
      { id: 'school-a', name: '한빛학교' },
      { id: 'school-b', name: '다른학교' },
    ]),
  ),
  http.get('*/api/public/schools/:id/classrooms', ({ params }) =>
    HttpResponse.json(
      params.id === 'school-a'
        ? [
            { id: 'class-a', gradeLabel: '1학년', classNumber: 1 },
            { id: 'class-b', gradeLabel: '2학년', classNumber: 2 },
          ]
        : [{ id: 'class-c', gradeLabel: '중1', classNumber: 3 }],
    ),
  ),
  http.post('*/api/public/classrooms/resolve', () =>
    HttpResponse.json({ id: 'class-a', gradeLabel: '1학년', classNumber: 1 }),
  ),
);
