import { Navigate } from 'react-router-dom';
import { accountPath, useCurrentAccount } from '../features/auth/queries';
import { errorMessage } from '../lib/http';

export function HomeRedirect() {
  const session = useCurrentAccount();
  if (session.isPending) return <p role="status">계정을 확인하고 있습니다.</p>;
  if (session.isError)
    return (
      <div className="notice">
        <p role="alert">{errorMessage(session.error)}</p>
        <button onClick={() => void session.refetch()}>다시 시도</button>
      </div>
    );
  return <Navigate replace to={session.data ? accountPath(session.data) : '/login'} />;
}
