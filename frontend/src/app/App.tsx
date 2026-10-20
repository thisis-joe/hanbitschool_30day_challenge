import { useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AppRoutes } from './router';
import { useCurrentAccount, useAcceptAccount, replaceAccountCache } from '../features/auth/queries';
import { logout } from '../features/auth/api';
import { FormError, useSubmission } from '../features/auth/FormParts';
import { refreshCsrf, setUnauthorizedHandler } from '../lib/http';
import { clearAllPendingCommands } from '../features/learning/pendingCommands';
import { StudentGameNav } from '../features/game/StudentGameNav';
export function App() {
  const client = useQueryClient();
  const session = useCurrentAccount();
  const accept = useAcceptAccount();
  const navigate = useNavigate();
  const submit = useSubmission();
  useEffect(() => {
    void refreshCsrf().catch(() => {});
    setUnauthorizedHandler(() => {
      clearAllPendingCommands();
      void client.cancelQueries();
      replaceAccountCache(client, null);
    });
    return () => setUnauthorizedHandler(undefined);
  }, [client]);
  const me = session.data;
  const staff = me && me.role !== 'STUDENT';
  return (
    <>
      <a className="skip-link" href="#main-content">
        본문으로 바로가기
      </a>
      <header className={`site-header${me?.role === 'STUDENT' ? ' student-header' : ''}`}>
        <Link className="brand" to="/">
          한빛학교<span>배움터</span>
        </Link>
        <nav aria-label="주 메뉴">
          {me?.role === 'STUDENT' ? (
            <>
              <NavLink to="/student/account">내 정보</NavLink>
            </>
          ) : null}
          {staff && !me.mustChangePassword ? (
            <>
              <NavLink to="/staff/classrooms">학급</NavLink>
              {me.role === 'ADMIN' ? <NavLink to="/admin/teachers">교사 계정</NavLink> : null}
            </>
          ) : null}
          {me ? (
            <>
              <NavLink to="/account/password">비밀번호 변경</NavLink>
              <button
                className="nav-button"
                disabled={submit.pending}
                onClick={() =>
                  void submit.run(async () => {
                    await logout();
                    await accept(null);
                    navigate(staff ? '/staff/login' : '/login', { replace: true });
                  })
                }
              >
                로그아웃
              </button>
            </>
          ) : (
            <Link to="/signup">회원가입</Link>
          )}
        </nav>
      </header>
      {me?.role === 'STUDENT' ? <StudentGameNav /> : null}
      <main id="main-content" tabIndex={-1}>
        <FormError message={submit.error} />
        <AppRoutes />
      </main>
      <footer>한빛학교와 함께하는 배움</footer>
    </>
  );
}
