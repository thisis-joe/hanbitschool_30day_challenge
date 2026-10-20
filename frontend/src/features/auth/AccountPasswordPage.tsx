import { Link, useNavigate } from 'react-router-dom';
import { changePassword } from './api';
import { accountPath, useAcceptAccount, useCurrentAccount } from './queries';
import { AuthFrame, FormError, useSubmission } from './FormParts';
import { HttpError } from '../../lib/http';
export function AccountPasswordPage() {
  const { data: me } = useCurrentAccount();
  const accept = useAcceptAccount();
  const navigate = useNavigate();
  const submit = useSubmission();
  return (
    <AuthFrame
      title="비밀번호 변경"
      description={
        me?.role !== 'STUDENT' && me?.mustChangePassword
          ? '처음 로그인했어요. 새 비밀번호를 정해 주세요.'
          : '새 비밀번호로 내 계정을 지켜 주세요.'
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void submit.run(async () => {
            const next = String(data.get('newPassword'));
            if (next !== data.get('confirmation'))
              throw new HttpError(400, {
                code: 'VALIDATION_ERROR',
                message: '새 비밀번호 확인이 일치하지 않습니다.',
                fieldErrors: {},
              });
            const account = await changePassword({
              currentPassword: String(data.get('currentPassword')),
              newPassword: next,
            });
            await accept(account);
            navigate(accountPath(account), { replace: true });
          });
        }}
      >
        <fieldset disabled={submit.pending}>
          <label htmlFor="current-password">현재 비밀번호</label>
          <input
            id="current-password"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <label htmlFor="new-password">새 비밀번호</label>
          <input
            id="new-password"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
            aria-describedby="new-password-help"
          />
          <small id="new-password-help">8자 이상으로 입력해 주세요.</small>
          <label htmlFor="confirmation">새 비밀번호 확인</label>
          <input
            id="confirmation"
            name="confirmation"
            type="password"
            autoComplete="new-password"
            required
          />
          <FormError message={submit.error} />
          <div className="form-actions">
            <button type="submit">{submit.pending ? '변경 중…' : '비밀번호 변경'}</button>
            {me && (me.role === 'STUDENT' || !me.mustChangePassword) && !submit.pending ? (
              <Link className="button secondary" to={accountPath(me)}>
                취소
              </Link>
            ) : null}
          </div>
        </fieldset>
      </form>
    </AuthFrame>
  );
}
