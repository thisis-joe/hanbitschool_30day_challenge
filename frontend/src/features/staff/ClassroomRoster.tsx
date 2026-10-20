import { useQuery } from '@tanstack/react-query';
import { useCurrentAccount } from '../auth/queries';
import { errorMessage } from '../../lib/http';
import { getRoster } from './api';
export function ClassroomRoster({ classroomId }: { classroomId: string }) {
  const { data: me } = useCurrentAccount();
  const roster = useQuery({
    queryKey: ['staff', 'roster', me?.accountId, classroomId],
    queryFn: () => getRoster(classroomId),
    enabled: !!me && me.role !== 'STUDENT',
  });
  return (
    <section className="roster">
      <h3>가입 학생 명단</h3>
      {roster.isPending ? <p role="status">명단을 불러오고 있습니다.</p> : null}
      {roster.isError ? (
        <>
          <p role="alert">{errorMessage(roster.error)}</p>
          <button
            className="secondary"
            disabled={roster.isFetching}
            onClick={() => void roster.refetch()}
          >
            명단 다시 불러오기
          </button>
        </>
      ) : null}
      {roster.data?.length === 0 ? <p>아직 가입한 학생이 없습니다.</p> : null}
      <ul className="plain-list">
        {roster.data?.map((s) => (
          <li className="roster-row" key={s.accountId}>
            <span>{s.studentNumber}번</span>
            <strong>{s.name}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
