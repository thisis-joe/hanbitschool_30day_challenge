import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '../auth/queries';
import { FormError, useSubmission } from '../auth/FormParts';
import { errorMessage } from '../../lib/http';
import { getTeachers, issueTeacher } from './api';
import type { TeacherIssued } from './types';
export function TeacherAccountsPage() {
  const { data: me } = useCurrentAccount();
  const [issued, setIssued] = useState<TeacherIssued>();
  const [copyMessage, setCopyMessage] = useState<string>();
  const submit = useSubmission();
  const list = useQuery({
    queryKey: ['staff', 'teachers', me?.accountId],
    queryFn: getTeachers,
    enabled: me?.role === 'ADMIN',
  });
  if (me?.role !== 'ADMIN') return null;
  return (
    <section className="workspace">
      <h1>교사 계정 관리</h1>
      <p className="description">{me.schoolName}의 선생님에게 계정을 발급합니다.</p>
      <div className="staff-grid">
        <section>
          <h2 className="section-title">교사 계정 발급</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              void submit.run(async () => {
                setIssued(undefined);
                setCopyMessage(undefined);
                const result = await issueTeacher({
                  name: String(data.get('name')),
                  staffLoginId: String(data.get('staffLoginId')),
                });
                setIssued(result);
                form.reset();
                await list.refetch();
              });
            }}
          >
            <fieldset disabled={submit.pending}>
              <label htmlFor="teacher-name">교사 이름</label>
              <input id="teacher-name" name="name" autoComplete="off" required />
              <label htmlFor="teacher-id">교직원 아이디</label>
              <input
                id="teacher-id"
                name="staffLoginId"
                autoComplete="off"
                spellCheck={false}
                required
                aria-describedby="id-help"
              />
              <small id="id-help">영문 소문자·숫자와 . _ -를 사용할 수 있습니다.</small>
              <FormError message={submit.error} />
              <button type="submit">{submit.pending ? '발급 중…' : '교사 계정 발급'}</button>
            </fieldset>
          </form>
          {issued ? (
            <section className="issued-result" aria-label="발급 결과">
              <h3>계정을 발급했습니다.</h3>
              <p>
                {issued.name} 선생님 / {issued.staffLoginId}
              </p>
              <label htmlFor="initial-password">초기 비밀번호</label>
              <input
                id="initial-password"
                type="password"
                readOnly
                value={issued.initialPassword}
                autoComplete="off"
              />
              <small>이 화면을 닫으면 다시 볼 수 없습니다. 선생님에게 전달해 주세요.</small>
              <button
                className="secondary"
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(issued.initialPassword).then(
                    () => setCopyMessage('복사했습니다.'),
                    () => setCopyMessage('복사할 수 없습니다. 비밀번호를 선택해 복사해 주세요.'),
                  );
                }}
              >
                초기 비밀번호 복사
              </button>
              {copyMessage ? <p role="status">{copyMessage}</p> : null}
            </section>
          ) : null}
        </section>
        <section>
          <h2 className="section-title">교사 계정 목록</h2>
          {list.isPending ? <p role="status">목록을 불러오고 있습니다.</p> : null}
          {list.isError ? <p role="alert">{errorMessage(list.error)}</p> : null}
          {list.data?.length === 0 ? <p>아직 발급한 교사 계정이 없습니다.</p> : null}
          <ul className="plain-list">
            {list.data?.map((t) => (
              <li className="teacher-row" key={t.accountId}>
                <div>
                  <strong>{t.name}</strong>
                  <p>{t.staffLoginId}</p>
                </div>
                <span className="status-tag">
                  {t.mustChangePassword ? '첫 로그인 전' : '사용 중'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
