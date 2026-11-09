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
import { PixelIcon } from './PixelIcon';
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
      <header className="site-header">
        <Link className="brand" to="/">
          <img className="brand-mark" src="/brand/school-mark.svg" width="24" height="24" alt="" />
          <span>사실일까? 해석일까?</span>
        </Link>
        <nav className="site-menu" aria-label="주 메뉴">
          {me?.role === 'STUDENT' ? (
            <NavLink to="/student/account">
              <PixelIcon name="badge" />내 정보
            </NavLink>
          ) : null}
          {staff && !me.mustChangePassword ? (
            <>
              <NavLink to="/staff/classrooms">
                <PixelIcon name="board" />
                학급
              </NavLink>
              {me.role === 'ADMIN' ? (
                <NavLink to="/admin/teachers">
                  <PixelIcon name="people" />
                  교사 계정
                </NavLink>
              ) : null}
            </>
          ) : null}
          {me ? (
            <>
              <NavLink to="/account/password">
                <PixelIcon name="key" />
                비밀번호 변경
              </NavLink>
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
                <PixelIcon name="exit" />
                로그아웃
              </button>
            </>
          ) : (
            <Link to="/signup">
              <PixelIcon name="signup" />
              회원가입
            </Link>
          )}
        </nav>
      </header>
      {me?.role === 'STUDENT' ? <StudentGameNav /> : null}
      <main id="main-content" tabIndex={-1}>
        <FormError message={submit.error} />
        <AppRoutes />
      </main>
    </>
  );
}
