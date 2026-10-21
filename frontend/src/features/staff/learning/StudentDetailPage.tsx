import { useCallback, useRef } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useCurrentAccount } from '../../auth/queries';
import { GameAvatar } from '../../game/GameAvatar';
import { errorMessage } from '../../../lib/http';
import { useRouteHeadingFocus } from '../../../lib/useRouteHeadingFocus';
import { useTeacherClassroom, useTeacherStudent } from './queries';
import { numberParam, studentStatusLabel } from './StatisticsPage';
import { StudentSummaryCharts } from './StatisticsCharts';
import { QuestionDetailDialog } from './QuestionDetailDialog';
import type { AnswerListQuery, TeacherAnswerState, TeacherDayRow } from './types';
import './stats.css';

const dayLabels: Record<TeacherDayRow['state'], string> = {
  NOT_STARTED: '미시작',
  IN_PROGRESS: '진행 중',
  RETRY_REQUIRED: '재도전 필요',
  PASSED: '통과',
};
const answerLabels: Record<TeacherAnswerState, string> = {
  UNANSWERED: '미응답',
  CORRECT: '정답',
  WRONG: '선택 오답',
  TIMED_OUT: '시간초과',
};
type ListContext = { listUrl: string; ownerId: string; classroomId: string };
export function StudentDetailPage() {
  const { classroomId = '', studentId = '' } = useParams();
  const { data: me } = useCurrentAccount();
  if (!me || (me.role !== 'TEACHER' && me.role !== 'ADMIN') || me.mustChangePassword) return null;
  return (
    <StudentWorkspace
      key={`${me.accountId}:${classroomId}:${studentId}`}
      accountId={me.accountId}
      classroomId={classroomId}
      studentId={studentId}
    />
  );
}
function StudentWorkspace({
  accountId,
  classroomId,
  studentId,
}: {
  accountId: string;
  classroomId: string;
  studentId: string;
}) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const basePath = `/staff/classrooms/${encodeURIComponent(classroomId)}/learning`;
  const candidate = location.state as Partial<ListContext> | null;
  const listUrl =
    candidate?.ownerId === accountId &&
    candidate.classroomId === classroomId &&
    typeof candidate.listUrl === 'string' &&
    (candidate.listUrl === basePath || candidate.listUrl.startsWith(basePath + '?'))
      ? candidate.listUrl
      : basePath;
  const listContext: ListContext = { listUrl, ownerId: accountId, classroomId };
  const query: AnswerListQuery = {
    day: numberParam(params.get('day'), 0, 30),
    filter: (params.get('filter') ?? 'WRONG') as AnswerListQuery['filter'],
    page: numberParam(params.get('page')),
    size: 8,
  };
  const classroom = useTeacherClassroom(classroomId);
  const detail = useTeacherStudent(classroomId, studentId, query);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const questionId = numberParam(params.get('question'), 0, 150) || null;
  const change = (key: string, value: string) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(key, value);
        if (key === 'day' || key === 'filter') next.delete('page');
        return next;
      },
      { state: listContext },
    );
  };
  const closeQuestion = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('question');
        return next;
      },
      { replace: true, state: { listUrl, ownerId: accountId, classroomId } },
    );
  }, [setParams, listUrl, accountId, classroomId]);
  const data = detail.data;
  const heading = useRouteHeadingFocus(accountId, !!data, questionId !== null);
  return (
    <section className="workspace teacher-stats">
      <Link to={listUrl}>목록으로 돌아가기</Link>
      <header className="stats-header">
        <div>
          <p className="stats-eyebrow">STUDENT · LEARNING DETAILS</p>
          <p>
            {classroom.data
              ? `${classroom.data.gradeLabel} ${classroom.data.classNumber}반`
              : '학급'}{' '}
            · 학생 학습 상세
          </p>
          <a href="#student-answers">답변 문항 바로가기 ↓</a>
          {data ? (
            <div className="stats-student-heading">
              <GameAvatar characterId={data.student.characterId} />
              <div>
                <h1 ref={heading} tabIndex={-1}>
                  {data.student.studentNumber}번 {data.student.name}
                </h1>
                <p>{studentStatusLabel[data.student.status]}</p>
              </div>
            </div>
          ) : (
            <h1>학생 학습 상세</h1>
          )}
        </div>
        <span className="stats-readonly">교사용 조회</span>
      </header>
      {classroom.isError ? (
        <div>
          <p role="alert">{errorMessage(classroom.error)}</p>
          <button onClick={() => void classroom.refetch()}>학급 정보 다시 시도</button>
        </div>
      ) : null}
      {detail.isPending ? <p role="status">학생 통계를 불러오고 있습니다.</p> : null}
      {detail.isError ? (
        <div>
          <p role="alert">{errorMessage(detail.error)}</p>
          <button onClick={() => void detail.refetch()}>다시 시도</button>
        </div>
      ) : null}
      {data ? (
        <>
          <nav className="stats-neighbors" aria-label="학급 학생 이동">
            {data.previousStudentId === null ? (
              <button disabled>이전 학생</button>
            ) : (
              <Link
                to={`${basePath}/students/${encodeURIComponent(data.previousStudentId)}`}
                state={listContext}
              >
                이전 학생
              </Link>
            )}
            <span>
              학급 전체 번호순 · {data.ordinal} / {data.totalStudents}
            </span>
            {data.nextStudentId === null ? (
              <button disabled>다음 학생</button>
            ) : (
              <Link
                to={`${basePath}/students/${encodeURIComponent(data.nextStudentId)}`}
                state={listContext}
              >
                다음 학생
              </Link>
            )}
          </nav>
          <StudentSummaryCharts
            student={data.student}
            facts={data.facts}
            interpretations={data.interpretations}
          />
          <section className="stats-card" aria-label="30회차 학습 현황">
            <h2>30회차 학습 현황</h2>
            <p>현재 회차 상태와 통과 시각입니다. 첫 답변 수와 현재 상태는 서로 다른 지표입니다.</p>
            <div className="stats-day-grid">
              {data.days.map((day) => (
                <div key={day.dayNumber}>
                  <button
                    className={`stats-day stats-day-${day.state.toLowerCase()}`}
                    aria-pressed={query.day === day.dayNumber}
                    aria-describedby={`stats-day-${day.dayNumber}`}
                    onClick={() => {
                      change('day', String(day.dayNumber));
                      answerHeading.current?.focus();
                    }}
                  >
                    <strong>{day.dayNumber}회차</strong>
                    <span>{dayLabels[day.state]}</span>
                    <small>첫 응답 {day.answered} / 5</small>
                  </button>
                  <span id={`stats-day-${day.dayNumber}`} className="stats-sr-only">
                    첫 정답 {day.correct}개, 시간초과 {day.timedOut}개.{' '}
                    {day.passedAt
                      ? `통과 시각 ${new Date(day.passedAt).toLocaleString('ko-KR')}`
                      : '통과 기록 없음'}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="stats-card">
            <h2 id="student-answers" ref={answerHeading} tabIndex={-1}>
              첫 답변 문항
            </h2>
            <div className="stats-filters">
              <label>
                답변 회차
                <select
                  aria-label="답변 회차"
                  value={query.day}
                  onChange={(e) => change('day', e.target.value)}
                >
                  <option value="0">전체 회차</option>
                  {Array.from({ length: 30 }, (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {i + 1}회차
                    </option>
                  ))}
                </select>
              </label>
              <label>
                답변 필터
                <select
                  aria-label="답변 필터"
                  value={query.filter}
                  onChange={(e) => change('filter', e.target.value)}
                >
                  <option value="WRONG">첫 오답 (시간초과 포함)</option>
                  <option value="TIMEOUT">시간초과</option>
                  <option value="ALL">모든 첫 답변</option>
                  <option value="UNANSWERED">미응답</option>
                </select>
              </label>
            </div>
            {detail.isPlaceholderData ? (
              <p role="status">답변 목록을 갱신하고 있습니다. 잠시 이전 결과를 표시합니다.</p>
            ) : null}
            <p className="stats-scroll-hint">표를 좌우로 밀어 나머지 항목을 확인하세요.</p>
            <div
              className="stats-table-scroll"
              tabIndex={0}
              role="region"
              aria-label="학생 문항 표 가로 스크롤"
              aria-busy={detail.isFetching}
            >
              <table aria-label="학생 첫 답변">
                <caption>
                  선택한 조건의 문항 {data.answers.total}개 · 반복 답변은 포함하지 않습니다.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">문항</th>
                    <th scope="col">첫 선택</th>
                    <th scope="col">정답</th>
                    <th scope="col">첫 결과</th>
                    <th scope="col">복습 개선</th>
                    <th scope="col">첫 답변 시각</th>
                  </tr>
                </thead>
                <tbody>
                  {data.answers.items.map((answer) => (
                    <tr key={answer.questionId}>
                      <th scope="row">
                        <button
                          className="secondary stats-question-text"
                          aria-label={`${answer.questionId}번 문항 상세`}
                          onClick={() => change('question', String(answer.questionId))}
                        >
                          {answer.questionId}번 · {answer.dayNumber}회차 <span>{answer.text}</span>
                        </button>
                      </th>
                      <td>{answer.firstChoice ?? '—'}</td>
                      <td>{answer.correctChoice}</td>
                      <td>{answerLabels[answer.outcome]}</td>
                      <td>
                        {answer.reviewedWrong
                          ? '개선됨'
                          : answer.outcome === 'WRONG' || answer.outcome === 'TIMED_OUT'
                            ? '미개선 오답'
                            : '—'}
                      </td>
                      <td>
                        {answer.firstAnsweredAt ? (
                          <time dateTime={answer.firstAnsweredAt}>
                            {new Date(answer.firstAnsweredAt).toLocaleString('ko-KR')}
                          </time>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.answers.items.length === 0 ? <p>선택한 조건의 문항이 없습니다.</p> : null}
            <div className="stats-pagination" aria-label="답변 페이지">
              <button
                aria-label="이전 페이지"
                className="secondary"
                disabled={detail.isFetching || query.page === 0}
                onClick={() => change('page', String(query.page - 1))}
              >
                이전
              </button>
              <span>
                {data.answers.page + 1} /{' '}
                {Math.max(1, Math.ceil(data.answers.total / data.answers.size))} 페이지
              </span>
              <button
                aria-label="다음 페이지"
                className="secondary"
                disabled={
                  detail.isFetching || (query.page + 1) * data.answers.size >= data.answers.total
                }
                onClick={() => change('page', String(query.page + 1))}
              >
                다음
              </button>
            </div>
          </section>
        </>
      ) : null}
      <QuestionDetailDialog
        classroomId={classroomId}
        questionId={questionId}
        onClose={closeQuestion}
      />
    </section>
  );
}
