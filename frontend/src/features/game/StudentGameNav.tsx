import { NavLink } from 'react-router-dom';
import './game.css';

export function StudentGameNav() {
  return (
    <nav className="game-student-nav" aria-label="학생 여행 메뉴">
      <NavLink to="/student/learning" end>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m3 11 9-8 9 8v10h-7v-7h-4v7H3Z" />
        </svg>
        오늘
      </NavLink>
      <NavLink to="/student/map">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16M15 5v16" />
        </svg>
        탐험
      </NavLink>
      <NavLink to="/student/closet">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M9 6a3 3 0 1 1 4 3v3l8 6v3H3v-3l10-6" />
        </svg>
        꾸미기
      </NavLink>
      <NavLink to="/student/questions?filter=REVIEW_QUEUE">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M12 5C9 3 5 3 2 4v16c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v16" />
        </svg>
        나의 문제
      </NavLink>
    </nav>
  );
}
