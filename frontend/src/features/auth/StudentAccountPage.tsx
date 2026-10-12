import { Link, useNavigate } from 'react-router-dom';
import { logout } from './api';
import { useCurrentAccount, useAcceptAccount } from './queries';
import { FormError, useSubmission } from './FormParts';
export function StudentAccountPage() {
  const { data: me } = useCurrentAccount();
  const accept = useAcceptAccount();
  const navigate = useNavigate();
  const submit = useSubmission();
  if (me?.role !== 'STUDENT') return null;
  return (
    <section className="account-panel">
      <p className="school-label">{me.schoolName}</p>
      <h1>{me.nickname}</h1>
      <p className="description">{me.name} 학생, 반가워요.</p>
      <dl className="account-details">
        <div>
          <dt>학년</dt>
          <dd>{me.gradeLabel}</dd>
        </div>
        <div>
          <dt>반</dt>
          <dd>{me.classNumber}반</dd>
        </div>
        <div>
          <dt>번호</dt>
          <dd>{me.studentNumber}번</dd>
        </div>
      </dl>
      <div className="actions">
        <Link className="button secondary" to="/account/password">
          비밀번호 변경
        </Link>
        <button
          className="secondary"
          disabled={submit.pending}
          onClick={() =>
            void submit.run(async () => {
              await logout();
              await accept(null);
              navigate('/login', { replace: true });
            })
          }
        >
          로그아웃
        </button>
      </div>
      <FormError message={submit.error} />
    </section>
  );
}
