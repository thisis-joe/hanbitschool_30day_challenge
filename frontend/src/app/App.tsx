import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
      <header className={`site-header${me?.role === 'STUDENT' ? ' student-header' : ''}`}>
        <Link className="brand" to="/">
          한빛학교<span>배움터</span>
        </Link>
        <nav aria-label="주 메뉴">
          {me?.role === 'STUDENT' ? (
            <>
              <Link to="/student/account">내 정보</Link>
            </>
          ) : null}
          {staff && !me.mustChangePassword ? (
            <>
              <Link to="/staff/classrooms">학급</Link>
              {me.role === 'ADMIN' ? <Link to="/admin/teachers">교사 계정</Link> : null}
            </>
          ) : null}
          {me ? (
            <>
              <Link to="/account/password">비밀번호 변경</Link>
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
      <main id="main-content">
        <FormError message={submit.error} />
        <AppRoutes />
      </main>
      <footer>한빛학교와 함께하는 배움</footer>
    </>
  );
}
