import type { Distinction, TeacherLearningSummary, TeacherStudentRow } from './types';

export function rate(value: number | null) {
  return value === null ? '—' : `${Math.round(value * 100)}%`;
}
function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stats-metric">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
function DistinctionChart({
  facts,
  interpretations,
}: {
  facts: Distinction;
  interpretations: Distinction;
}) {
  return (
    <figure className="stats-card stats-distinction">
      <figcaption>사실(O)·해석(X) 구분 — 첫 답변 정답률</figcaption>
      {(
        [
          ['사실(O)', facts],
          ['해석(X)', interpretations],
        ] as const
      ).map(([label, item]) => (
        <div key={label}>
          <span>{label}</span>
          {item.accuracy === null ? (
            <span>응답 없음</span>
          ) : (
            <meter
              min="0"
              max="1"
              value={item.accuracy}
              aria-label={`${label} 정답률 ${rate(item.accuracy)}, 응답 ${item.answered}개 중 정답 ${item.correct}개`}
            />
          )}
          <strong>{rate(item.accuracy)}</strong>
          <small>
            응답 {item.answered}개 · 정답 {item.correct}개
          </small>
        </div>
      ))}
    </figure>
  );
}
export function ClassSummaryCharts({ summary }: { summary: TeacherLearningSummary }) {
  const distribution = [
    ['미참여', summary.studentCount - summary.participatingCount],
    ['학습 중', summary.participatingCount - summary.completeCount],
    ['완료', summary.completeCount],
  ] as const;
  return (
    <section aria-label="학급 요약" className="stats-summary">
      <dl className="stats-metrics">
        <Metric label="가입 학생" value={`${summary.studentCount}명`} />
        <Metric label="첫 응답" value={`${summary.answered}개`} />
        <Metric label="첫 정답률" value={rate(summary.accuracy)} />
        <Metric label="미개선 오답" value={`${summary.pendingWrong}개`} />
      </dl>
      <div className="stats-chart-grid">
        <figure className="stats-card">
          <figcaption>학생 학습 분포 — 학급 전체 {summary.studentCount}명</figcaption>
          <div className="stats-distribution">
            {distribution.map(([label, count]) => (
              <div key={label}>
                <span>{label}</span>
                <meter
                  min="0"
                  max={summary.studentCount || 1}
                  value={count}
                  aria-label={`${label} ${count}명 / 전체 ${summary.studentCount}명`}
                />
                <strong>{count}명</strong>
              </div>
            ))}
          </div>
        </figure>
        <DistinctionChart facts={summary.facts} interpretations={summary.interpretations} />
      </div>
      <p>
        첫 정답 {summary.correct}개 · 선택 오답 {summary.choiceWrong}개 · 시간초과{' '}
        {summary.timedOut}개 · 미응답 {summary.unanswered}개
      </p>
      <p>
        첫 오답 {summary.wrong}개 중 복습 개선 {summary.reviewedWrong}개. 미개선 오답은 첫 오답 중
        아직 개선되지 않은 문항 수이며, 학생의 개인 복습 큐 수가 아닙니다.
      </p>
    </section>
  );
}
export function StudentSummaryCharts({
  student,
  facts,
  interpretations,
}: {
  student: TeacherStudentRow;
  facts: Distinction;
  interpretations: Distinction;
}) {
  return (
    <section aria-label="학생 요약">
      <dl className="stats-metrics">
        <Metric label="첫 응답" value={`${student.answered} / 150개`} />
        <Metric label="첫 정답률" value={rate(student.accuracy)} />
        <Metric label="통과 회차" value={`${student.passedDayCount} / 30회`} />
        <Metric label="미개선 오답" value={`${student.pendingWrong}개`} />
      </dl>
      <p>
        첫 정답 {student.correct}개 · 첫 오답 {student.wrong}개 (시간초과 {student.timedOut}개 포함)
        · 복습 개선 {student.reviewedWrong}개
      </p>
      <p>
        미개선 오답은 학생의 개인 복습 큐 수가 아닙니다. 복습 개선은 첫 답변 정답률을 변경하지
        않습니다.
      </p>
      <DistinctionChart facts={facts} interpretations={interpretations} />
    </section>
  );
}
