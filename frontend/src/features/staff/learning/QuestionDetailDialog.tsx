import { useEffect, useEffectEvent, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useCurrentAccount } from '../../auth/queries';
import { errorMessage } from '../../../lib/http';
import { useTeacherQuestion } from './queries';
import { rate } from './StatisticsCharts';
import type { TeacherRespondent } from './types';

type Props = { classroomId: string; questionId: number | null; onClose: () => void };
export function QuestionDetailDialog({ classroomId, questionId, onClose }: Props) {
  const { data: me } = useCurrentAccount();
  if (
    questionId === null ||
    !me ||
    (me.role !== 'TEACHER' && me.role !== 'ADMIN') ||
    me.mustChangePassword
  )
    return null;
  return (
    <OpenQuestionDialog
      key={`${me.accountId}:${classroomId}:${questionId}`}
      classroomId={classroomId}
      questionId={questionId}
      onClose={onClose}
    />
  );
}
function Respondents({ rows, label }: { rows: TeacherRespondent[]; label: string }) {
  return (
    <section className="stats-respondents">
      <h3>
        {label} {rows.length}명
      </h3>
      {rows.length === 0 ? (
        <p>해당 학생이 없습니다.</p>
      ) : (
        <ul>
          {rows.map((row) => (
            <li key={row.accountId}>
              <span>
                {row.studentNumber}번 {row.name}
              </span>
              <span>
                첫 선택 {row.firstChoice ?? '—'} ·{' '}
                {row.outcome === 'TIMED_OUT'
                  ? '시간초과'
                  : row.outcome === 'CORRECT'
                    ? '정답'
                    : '선택 오답'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
function OpenQuestionDialog({ classroomId, questionId, onClose }: Props & { questionId: number }) {
  const detail = useTeacherQuestion(classroomId, questionId);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const closeLatest = useEffectEvent(onClose);
  useEffect(() => {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = dialog.current!;
    const backdrop = element.parentElement!;
    const siblings = Array.from(document.body.children).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node !== backdrop,
    );
    const previous = siblings.map((node) => ({
      node,
      inert: node.inert,
      hidden: node.getAttribute('aria-hidden'),
    }));
    for (const node of siblings) {
      node.inert = true;
      node.setAttribute('aria-hidden', 'true');
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    const focusables = () =>
      Array.from(
        element.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), [tabindex="0"]',
        ),
      ).filter((node) => !node.hidden);
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeLatest();
      }
      if (event.key !== 'Tab') return;
      const nodes = focusables();
      const first = nodes[0] ?? element;
      const last = nodes[nodes.length - 1] ?? element;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusin = (event: FocusEvent) => {
      if (event.target instanceof Node && !element.contains(event.target)) close.current?.focus();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('focusin', focusin);
    return () => {
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('focusin', focusin);
      document.body.style.overflow = previousOverflow;
      for (const { node, inert, hidden } of previous) {
        node.inert = inert;
        if (hidden === null) node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden', hidden);
      }
      if (trigger?.isConnected) trigger.focus();
    };
  }, []);
  const data = detail.data;
  return createPortal(
    <div className="stats-modal-backdrop">
      <div
        ref={dialog}
        className="stats-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <header>
          <h2 id={titleId}>{questionId}번 문항 상세</h2>
          <button ref={close} className="secondary" onClick={onClose}>
            닫기
          </button>
        </header>
        {detail.isPending ? <p role="status">문항을 불러오고 있습니다.</p> : null}
        {detail.isError ? (
          <div>
            <p role="alert">{errorMessage(detail.error)}</p>
            <button onClick={() => void detail.refetch()}>다시 시도</button>
          </div>
        ) : null}
        {data ? (
          <>
            <p>
              {data.question.dayNumber}회차 · 첫 응답 {data.question.answered}명 · 오답률{' '}
              {rate(data.question.wrongRate)}
            </p>
            <p className="stats-dialog-question">{data.question.text}</p>
            <p>
              정답 <strong>{data.question.correctChoice}</strong>
            </p>
            <section className="stats-explanation">
              <h3>해설</h3>
              <p>{data.explanation}</p>
            </section>
            <p>
              미응답 {data.unanswered}명 · 선택 오답 {data.question.choiceWrong}명 · 시간초과{' '}
              {data.question.timedOut}명
            </p>
            <Respondents rows={data.correct} label="정답자" />
            <Respondents rows={data.wrong} label="오답자 (시간초과 포함)" />
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
