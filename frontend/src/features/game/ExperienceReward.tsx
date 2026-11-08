import type { AnswerResult } from '../learning/types';
import './celebrations.css';

/** The persistent, compact readout never interrupts the question or takes focus. */
export function ExperienceReward({ answer }: { answer: AnswerResult }) {
  return (
    <div
      className="game-xp-reward"
      role="status"
      aria-label={`이번 답변으로 받은 경험치: ${answer.xpAwarded} XP`}
    >
      <strong className="game-xp-amount">
        +{answer.xpAwarded} <small>XP</small>
      </strong>
      <span className="game-xp-total">
        <b>Lv. {answer.level}</b>
        <span>누적 {answer.totalXp} XP</span>
      </span>
    </div>
  );
}
