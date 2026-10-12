import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ClassroomFields } from './ClassroomFields';
import { loginStudent } from './api';
import { AuthFrame, FormError, useSubmission } from './FormParts';
import { studentReturnTo, useAcceptAccount } from './queries';
import { HttpError } from '../../lib/http';
import type { ClassroomSelection } from './types';
export function StudentLoginPage() {
  const location = useLocation();
  const saved = location.state as (ClassroomSelection & { studentNumber?: number }) | null;
  const [selection, setSelection] = useState<ClassroomSelection>({
    schoolId: saved?.schoolId ?? '',
    gradeLabel: saved?.gradeLabel ?? '',
    classNumber: saved?.classNumber ?? 0,
  });
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();
  const accept = useAcceptAccount();
  const submit = useSubmission();
  return (
    <AuthFrame title="학생 로그인" description="학교와 우리 반을 선택하고 로그인해 주세요.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void submit.run(async () => {
            try {
              const me = await loginStudent({
                ...selection,
                studentNumber: Number(data.get('studentNumber')),
                password: String(data.get('password')),
              });
              await accept(me);
              setSuccess(true);
              navigate(studentReturnTo(new URLSearchParams(location.search).get('returnTo')), {
                replace: true,
              });
            } catch (error) {
              if (error instanceof HttpError && error.status === 401)
                throw new HttpError(401, {
                  code: error.body.code,
                  message: '학교·학년·반·번호 또는 비밀번호를 확인해 주세요.',
                  fieldErrors: {},
                });
              throw error;
            }
          });
        }}
      >
        <fieldset disabled={submit.pending}>
          <ClassroomFields value={selection} onChange={setSelection} />
          <label htmlFor="number">번호</label>
          <input
            id="number"
            name="studentNumber"
            defaultValue={saved?.studentNumber}
            inputMode="numeric"
            pattern="[0-9]+"
            required
            autoComplete="username"
          />
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
          />
          <FormError message={submit.error} />
          <button type="submit">{submit.pending ? '로그인 중…' : '로그인'}</button>
        </fieldset>
      </form>
      {success ? <p role="status">로그인되었습니다.</p> : null}
      <p className="form-links">
        처음이라면 <Link to="/signup">회원가입</Link>
      </p>
      <Link className="quiet-link" to="/staff/login">
        교사·관리자 로그인
      </Link>
    </AuthFrame>
  );
}
