import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginStaff } from './api';
import { AuthFrame, FormError, useSubmission } from './FormParts';
import { accountPath, useAcceptAccount } from './queries';
import { HttpError } from '../../lib/http';
export function StaffLoginPage() {
  const navigate = useNavigate();
  const accept = useAcceptAccount();
  const submit = useSubmission();
  const [success, setSuccess] = useState(false);
  return (
    <AuthFrame title="교직원 로그인" description="발급받은 아이디와 비밀번호로 로그인해 주세요.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void submit.run(async () => {
            try {
              const me = await loginStaff({
                staffLoginId: String(data.get('staffLoginId')),
                password: String(data.get('password')),
              });
              await accept(me);
              setSuccess(true);
              navigate(accountPath(me), { replace: true });
            } catch (error) {
              if (error instanceof HttpError && error.status === 401)
                throw new HttpError(401, {
                  code: error.body.code,
                  message: '아이디 또는 비밀번호를 확인해 주세요.',
                  fieldErrors: {},
                });
              throw error;
            }
          });
        }}
      >
        <fieldset disabled={submit.pending}>
          <label htmlFor="staff-id">교직원 아이디</label>
          <input
            id="staff-id"
            name="staffLoginId"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
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
      <Link className="quiet-link" to="/login">
        학생 로그인으로 돌아가기
      </Link>
    </AuthFrame>
  );
}
