import { useCallback } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { useCurrentAccount } from '../../auth/queries';
import { GameAvatar } from '../../game/GameAvatar';
import { errorMessage } from '../../../lib/http';
import { useTeacherClassroom, useTeacherQuestions, useTeacherStudents } from './queries';
import { ClassSummaryCharts, rate } from './StatisticsCharts';
import { QuestionDetailDialog } from './QuestionDetailDialog';
import type { QuestionListQuery, StudentListQuery } from './types';
import './stats.css';

export function numberParam(value: string | null, fallback = 0, max = Number.MAX_SAFE_INTEGER) {
  if (value === null || !/^\d+$/.test(value)) return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number <= max ? number : fallback;
}
export const studentStatusLabel = { NEW: '미참여', IN_PROGRESS: '학습 중', COMPLETE: '완료' };
export function StatisticsPage() {
  const { classroomId = '' } = useParams();
  const { data: me } = useCurrentAccount();
  if (!me || (me.role !== 'TEACHER' && me.role !== 'ADMIN') || me.mustChangePassword) return null;
  return (
    <StatisticsWorkspace
      key={`${me.accountId}:${classroomId}`}
      classroomId={classroomId}
      accountId={me.accountId}
    />
  );
}
function StatisticsWorkspace({
  classroomId,
  accountId,
}: {
  classroomId: string;
  accountId: string;
}) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const tab = params.get('tab') === 'questions' ? 'questions' : 'students';
  const search = params.get('search') ?? '';
  const page = numberParam(params.get('page'));
  const studentQuery: StudentListQuery = {
    search,
    status: (params.get('status') ?? 'ALL') as StudentListQuery['status'],
    sort: (tab === 'students'
      ? (params.get('sort') ?? 'NUMBER')
      : 'NUMBER') as StudentListQuery['sort'],
    page: tab === 'students' ? page : 0,
    size: 20,
  };
  const questionQuery: QuestionListQuery = {
    day: numberParam(params.get('day'), 0, 30),
    search,
    sort: (tab === 'questions'
      ? (params.get('sort') ?? 'WRONG_RATE_DESC')
      : 'WRONG_RATE_DESC') as QuestionListQuery['sort'],
    page,
    size: 10,
  };
  // Metadata and class-wide summary start independently; question requests start on their tab.
  const classroom = useTeacherClassroom(classroomId);
  const students = useTeacherStudents(classroomId, studentQuery);
  const questions = useTeacherQuestions(classroomId, questionQuery, tab === 'questions');
  const questionId = numberParam(params.get('question'), 0, 150) || null;
  const change = (changes: Record<string, string | null>, resetPage = true) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (resetPage) next.delete('page');
      for (const [key, value] of Object.entries(changes)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });
  };
  const closeQuestion = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('question');
        return next;
      },
      { replace: true },
    );
  }, [setParams]);
  const selectedList = tab === 'students' ? students : questions;
  const pagination = tab === 'students' ? students.data?.students : questions.data;
  return (
    <section className="workspace teacher-stats">
      <header className="stats-header">
        <div>
          <Link to="/staff/classrooms">학급 목록</Link>
          <p className="stats-eyebrow">TEACHER · LEARNING STATISTICS</p>
          <h1>
            {classroom.data
              ? `${classroom.data.gradeLabel} ${classroom.data.classNumber}반 학습 통계`
              : '학급 학습 통계'}
          </h1>
          <p>첫 답변을 기준으로 학급 전체 학습과 복습 개선을 확인합니다.</p>
        </div>
        <span className="stats-readonly">교사용 조회</span>
      </header>
      {classroom.isError ? (
        <div>
          <p role="alert">{errorMessage(classroom.error)}</p>
          <button onClick={() => void classroom.refetch()}>학급 정보 다시 시도</button>
        </div>
      ) : null}
      {students.isPending ? <p role="status">학급 통계를 불러오고 있습니다.</p> : null}
      {students.isError ? (
        <div>
          <p role="alert">{errorMessage(students.error)}</p>
          <button onClick={() => void students.refetch()}>다시 시도</button>
        </div>
      ) : null}
      {students.data ? (
        <>
          <ClassSummaryCharts summary={students.data.summary} />
          <section aria-label="어려운 문항 TOP 3" className="stats-card stats-hard">
            <h2>어려운 문항 TOP 3</h2>
            <p>
              학급 전체 중 최소 {Math.min(3, students.data.summary.studentCount)}명이 응답하고
              오답이 있는 문항을 서버 오답률 순으로 표시합니다.
            </p>
            <ol>
              {students.data.summary.hardQuestions.map((q) => (
                <li key={q.questionId}>
                  <button
                    className="secondary"
                    aria-label={`${q.questionId}번 문항 상세`}
                    onClick={() => change({ question: String(q.questionId) }, false)}
                  >
                    {q.questionId}번 · {q.dayNumber}회차 <span>{q.text}</span>
                    <strong>오답률 {rate(q.wrongRate)}</strong>
                    <small>
                      응답 {q.answered}명 · 오답 {q.wrong}명
                    </small>
                  </button>
                </li>
              ))}
            </ol>
            {students.data.summary.hardQuestions.length === 0 ? (
              <p>조건에 맞는 어려운 문항이 없습니다.</p>
            ) : null}
          </section>
        </>
      ) : null}
      <nav className="stats-tabs" aria-label="통계 종류">
        <button
          aria-pressed={tab === 'students'}
          onClick={() =>
            change({
              tab: 'students',
              search: null,
              sort: null,
              status: null,
              day: null,
              question: null,
            })
          }
        >
          학생 현황
        </button>
        <button
          aria-pressed={tab === 'questions'}
          onClick={() =>
            change({
              tab: 'questions',
              search: null,
              sort: null,
              status: null,
              day: null,
              question: null,
            })
          }
        >
          문항 분석
        </button>
      </nav>
      <div className="stats-card">
        <form
          className="stats-filters"
          onSubmit={(e) => {
            e.preventDefault();
            change({ search: String(new FormData(e.currentTarget).get('search') ?? '') });
          }}
        >
          <label className="stats-search">
            {tab === 'students' ? '이름·번호 검색' : '문항·번호 검색'}
            <input key={`${tab}:${search}`} name="search" defaultValue={search} maxLength={100} />
          </label>
          <button type="submit">검색</button>
          {tab === 'students' ? (
            <>
              <label>
                학생 상태
                <select
                  aria-label="학생 상태"
                  value={studentQuery.status}
                  onChange={(e) => change({ status: e.target.value })}
                >
                  <option value="ALL">전체</option>
                  <option value="NEW">미참여</option>
                  <option value="IN_PROGRESS">학습 중</option>
                  <option value="COMPLETE">완료</option>
                </select>
              </label>
              <label>
                학생 정렬
                <select
                  aria-label="학생 정렬"
                  value={studentQuery.sort}
                  onChange={(e) => change({ sort: e.target.value })}
                >
                  <option value="NUMBER">번호순</option>
                  <option value="PROGRESS_ASC">첫 응답 수 적은 순</option>
                  <option value="PENDING_WRONG_DESC">미개선 오답 많은 순</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label>
                문항 회차
                <select
                  aria-label="문항 회차"
                  value={questionQuery.day}
                  onChange={(e) => change({ day: e.target.value })}
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
                문항 정렬
                <select
                  aria-label="문항 정렬"
                  value={questionQuery.sort}
                  onChange={(e) => change({ sort: e.target.value })}
                >
                  <option value="WRONG_RATE_DESC">오답률 높은 순</option>
                  <option value="QUESTION_ASC">문항 번호순</option>
                  <option value="TIMEOUT_DESC">시간초과 많은 순</option>
                </select>
              </label>
            </>
          )}
        </form>
        {tab === 'questions' && questions.isPending ? (
          <p role="status">문항을 불러오고 있습니다.</p>
        ) : null}
        {tab === 'questions' && questions.isError ? (
          <div>
            <p role="alert">{errorMessage(questions.error)}</p>
            <button onClick={() => void questions.refetch()}>다시 시도</button>
          </div>
        ) : null}
        {tab === 'students' && students.data ? (
          <div
            className="stats-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="학생 학습 표 가로 스크롤"
          >
            <table aria-label="학생 학습 현황">
              <caption>
                학생 학습 현황 · 검색 결과 {students.data.students.total}명 (요약 분모는 학급 전체)
              </caption>
              <thead>
                <tr>
                  <th scope="col">학생</th>
                  <th scope="col">상태</th>
                  <th scope="col">첫 응답</th>
                  <th scope="col">통과 회차</th>
                  <th scope="col">첫 정답률</th>
                  <th scope="col">미개선 오답</th>
                  <th scope="col">상세</th>
                </tr>
              </thead>
              <tbody>
                {students.data.students.items.map((row) => (
                  <tr key={row.accountId}>
                    <th scope="row">
                      <div className="stats-student">
                        <GameAvatar characterId={row.characterId} />
                        <span>
                          {row.studentNumber}번 <span>{row.name}</span>
                        </span>
                      </div>
                    </th>
                    <td>{studentStatusLabel[row.status]}</td>
                    <td>{row.answered} / 150</td>
                    <td>{row.passedDayCount} / 30</td>
                    <td>{rate(row.accuracy)}</td>
                    <td>{row.pendingWrong}개</td>
                    <td>
                      <Link
                        aria-label={`${row.studentNumber}번 ${row.name} 학생 상세`}
                        to={`/staff/classrooms/${encodeURIComponent(classroomId)}/learning/students/${encodeURIComponent(row.accountId)}`}
                        state={{
                          listUrl: location.pathname + location.search,
                          ownerId: accountId,
                          classroomId,
                        }}
                      >
                        학생 상세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {tab === 'questions' && questions.data ? (
          <div
            className="stats-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="문항 분석 표 가로 스크롤"
          >
            <table aria-label="문항 분석">
              <caption>
                문항 분석 · 검색 결과 {questions.data.total}문항, 오답률은 첫 응답자 기준
              </caption>
              <thead>
                <tr>
                  <th scope="col">문항</th>
                  <th scope="col">정답</th>
                  <th scope="col">응답</th>
                  <th scope="col">정답자</th>
                  <th scope="col">선택 오답</th>
                  <th scope="col">시간초과</th>
                  <th scope="col">미응답</th>
                  <th scope="col">오답률</th>
                </tr>
              </thead>
              <tbody>
                {questions.data.items.map((q) => (
                  <tr key={q.questionId}>
                    <th scope="row">
                      <button
                        className="secondary stats-question-text"
                        aria-label={`${q.questionId}번 문항 상세`}
                        onClick={() => change({ question: String(q.questionId) }, false)}
                      >
                        {q.questionId}번 · {q.dayNumber}회차 <span>{q.text}</span>
                      </button>
                    </th>
                    <td>{q.correctChoice}</td>
                    <td>{q.answered}명</td>
                    <td>{q.correct}명</td>
                    <td>{q.choiceWrong}명</td>
                    <td>{q.timedOut}명</td>
                    <td>{q.unanswered}명</td>
                    <td>{rate(q.wrongRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {!selectedList.isPending && !selectedList.isError && pagination?.items.length === 0 ? (
          <p>
            {tab === 'students' && students.data?.summary.studentCount === 0
              ? '가입한 학생이 없습니다.'
              : '검색 조건에 맞는 결과가 없습니다.'}
          </p>
        ) : null}
        {pagination ? (
          <div className="stats-pagination" aria-label="목록 페이지">
            <button
              className="secondary"
              disabled={page === 0}
              onClick={() => change({ page: String(page - 1) }, false)}
            >
              이전 페이지
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(pagination.total / pagination.size))} 페이지
            </span>
            <button
              className="secondary"
              disabled={(page + 1) * pagination.size >= pagination.total}
              onClick={() => change({ page: String(page + 1) }, false)}
            >
              다음 페이지
            </button>
          </div>
        ) : null}
      </div>
      <QuestionDetailDialog
        classroomId={classroomId}
        questionId={questionId}
        onClose={closeQuestion}
      />
    </section>
  );
}
