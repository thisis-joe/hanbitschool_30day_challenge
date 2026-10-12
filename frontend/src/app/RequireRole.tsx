import type { ReactNode } from 'react';
import { Navigate, Outlet, Link, useLocation } from 'react-router-dom';
import { studentReturnTo, useCurrentAccount } from '../features/auth/queries';
import type { Role } from '../features/auth/types';
import { errorMessage } from '../lib/http';
export function RequireRole({
  allowed,
  children,
  allowPasswordChange = false,
}: {
  allowed: Role[];
  children?: ReactNode;
  allowPasswordChange?: boolean;
}) {
  const session = useCurrentAccount();
  const location = useLocation();
  if (session.isPending) return <p role="status">계정을 확인하고 있습니다.</p>;
  if (session.isError)
    return (
      <div className="notice">
        <p role="alert">{errorMessage(session.error)}</p>
        <button onClick={() => void session.refetch()}>다시 시도</button>
      </div>
    );
  const me = session.data;
  if (!me)
    return (
      <Navigate
        replace
        to={
          allowed.includes('STUDENT')
            ? `/login?returnTo=${encodeURIComponent(studentReturnTo(location.pathname + location.search))}`
            : '/staff/login'
        }
      />
    );
  if (me.role !== 'STUDENT' && me.mustChangePassword && !allowPasswordChange)
    return <Navigate replace to="/account/password" />;
  if (!allowed.includes(me.role))
    return (
      <div className="notice">
        <p role="alert">접근 권한이 없습니다.</p>
        <Link to={me.role === 'STUDENT' ? '/student/learning' : '/staff/classrooms'}>
          내 화면으로 돌아가기
        </Link>
      </div>
    );
  return children ?? <Outlet />;
}
