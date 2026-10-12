import { TeacherAccountsPage } from '../features/staff/TeacherAccountsPage';
import { ClassroomsPage } from '../features/staff/ClassroomsPage';
import { Routes, Route } from 'react-router-dom';
import { HomeRedirect } from './HomeRedirect';
import { RequireRole } from './RequireRole';
import { StudentSignupPage } from '../features/auth/StudentSignupPage';
import { StudentLoginPage } from '../features/auth/StudentLoginPage';
import { StaffLoginPage } from '../features/auth/StaffLoginPage';
import { StudentAccountPage } from '../features/auth/StudentAccountPage';
import { AccountPasswordPage } from '../features/auth/AccountPasswordPage';
import { LearningDashboardPage } from '../features/learning/LearningDashboardPage';
import { PersonalQuestionsPage } from '../features/learning/PersonalQuestionsPage';
import { LearningSessionPage } from '../features/learning/LearningSessionPage';
import { LearningResultPage } from '../features/learning/LearningResultPage';
import '../features/learning/learning.css';
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<RequireRole allowed={['ADMIN']} />}>
        <Route path="/admin/teachers" element={<TeacherAccountsPage />} />
      </Route>
      <Route element={<RequireRole allowed={['TEACHER', 'ADMIN']} />}>
        <Route path="/staff/classrooms" element={<ClassroomsPage />} />
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/signup" element={<StudentSignupPage />} />
      <Route path="/login" element={<StudentLoginPage />} />
      <Route path="/staff/login" element={<StaffLoginPage />} />
      <Route element={<RequireRole allowed={['STUDENT']} />}>
        <Route path="/student/account" element={<StudentAccountPage />} />
        <Route path="/student/learning" element={<LearningDashboardPage />} />
        <Route path="/student/questions" element={<PersonalQuestionsPage />} />
        <Route path="/student/learning/sessions/:sessionId" element={<LearningSessionPage />} />
        <Route
          path="/student/learning/sessions/:sessionId/result"
          element={<LearningResultPage />}
        />
      </Route>
      <Route
        element={<RequireRole allowed={['STUDENT', 'TEACHER', 'ADMIN']} allowPasswordChange />}
      >
        <Route path="/account/password" element={<AccountPasswordPage />} />
      </Route>
      <Route
        path="*"
        element={
          <section className="notice">
            <h1>페이지를 찾을 수 없습니다.</h1>
            <a href="/login">로그인 화면</a>
          </section>
        }
      />
    </Routes>
  );
}
