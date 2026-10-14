import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentAccount } from '../auth/queries';
import { FormError, useSubmission } from '../auth/FormParts';
import { errorMessage } from '../../lib/http';
import { getStaffClassrooms, createClassroom } from './api';
import { ClassroomRoster } from './ClassroomRoster';
export function ClassroomsPage() {
  const { data: me } = useCurrentAccount();
  const client = useQueryClient();
  const [scope, setScope] = useState<'MINE' | 'SCHOOL'>('MINE');
  const [selected, setSelected] = useState<string>();
  const [success, setSuccess] = useState(false);
  const submit = useSubmission();
  const list = useQuery({
    queryKey: ['staff', 'classrooms', me?.accountId, scope],
    queryFn: () => getStaffClassrooms(scope),
    enabled: !!me && me.role !== 'STUDENT',
  });
  if (!me || me.role === 'STUDENT') return null;
  return (
    <section className="workspace">
      <h1>우리 학교 학급</h1>
      <p className="description">{me.schoolName}의 학급과 가입 학생을 확인합니다.</p>
      <details className="class-create" open>
        <summary>새 학급 만들기</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = new FormData(form);
            void submit.run(async () => {
              setSuccess(false);
              await createClassroom({
                gradeLabel: String(data.get('gradeLabel')),
                classNumber: Number(data.get('classNumber')),
                startDate: String(data.get('startDate')),
              });
              form.reset();
              setSuccess(true);
              await client.invalidateQueries({ queryKey: ['staff', 'classrooms', me.accountId] });
            });
          }}
        >
          <fieldset className="class-form" disabled={submit.pending}>
            <div>
              <label htmlFor="grade-label">학년 표시</label>
              <input id="grade-label" name="gradeLabel" placeholder="예: 1학년, 중1" required />
            </div>
            <div>
              <label htmlFor="class-number">반 번호</label>
              <input id="class-number" name="classNumber" type="number" min="1" max="99" required />
            </div>
            <div>
              <label htmlFor="start-date">시작일</label>
              <input id="start-date" name="startDate" type="date" required />
            </div>
            <button type="submit">{submit.pending ? '만드는 중…' : '학급 만들기'}</button>
          </fieldset>
          <FormError message={submit.error} />
          {success ? <p role="status">학급을 만들었습니다.</p> : null}
        </form>
      </details>
      <div className="scope-controls" aria-label="학급 조회 범위">
        <button
          className={scope === 'MINE' ? '' : 'secondary'}
          aria-pressed={scope === 'MINE'}
          onClick={() => {
            setScope('MINE');
            setSelected(undefined);
          }}
        >
          담당 학급
        </button>
        <button
          className={scope === 'SCHOOL' ? '' : 'secondary'}
          aria-pressed={scope === 'SCHOOL'}
          onClick={() => {
            setScope('SCHOOL');
            setSelected(undefined);
          }}
        >
          학교 전체
        </button>
      </div>
      {list.isPending ? <p role="status">학급을 불러오고 있습니다.</p> : null}
      {list.isError ? <p role="alert">{errorMessage(list.error)}</p> : null}
      {list.data?.length === 0 ? (
        <p>학급이 없습니다. 새 학급을 만들어 학생을 초대해 주세요.</p>
      ) : null}
      <ul className="plain-list">
        {list.data?.map((c) => (
          <li className="class-row" key={c.id}>
            <div className="class-row-main">
              <div>
                <h2 className="class-title">
                  {c.gradeLabel} {c.classNumber}반
                </h2>
                <p>
                  시작일 {c.startDate} / 가입 학생 {c.studentCount}명
                </p>
                <Link
                  className="button secondary"
                  to={`/staff/classrooms/${encodeURIComponent(c.id)}/learning`}
                >
                  학습 통계
                </Link>
              </div>
              <button
                className="secondary"
                aria-expanded={selected === c.id}
                onClick={() => setSelected(selected === c.id ? undefined : c.id)}
              >
                명단 보기
              </button>
            </div>
            {c.canManage && c.joinCode ? (
              <div className="join-code">
                <label htmlFor={'code-' + c.id}>
                  {c.gradeLabel} {c.classNumber}반 가입 코드
                </label>
                <input id={'code-' + c.id} readOnly value={c.joinCode} />
                <small>학생에게 이 코드와 학교·학년·반을 알려 주세요.</small>
              </div>
            ) : null}
            {selected === c.id ? <ClassroomRoster classroomId={c.id} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
