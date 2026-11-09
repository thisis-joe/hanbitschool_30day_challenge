import { Link, NavLink, useLocation } from 'react-router-dom';
import './game.css';

function MenuIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true">
      <path d={d} fillRule="evenodd" />
    </svg>
  );
}

export function StudentGameNav() {
  const { pathname } = useLocation();
  const dressing = pathname === '/student/closet' || pathname === '/student/character';
  return (
    <nav className="game-student-nav" aria-label="학생 여행 메뉴">
      <NavLink to="/student/learning">
        <MenuIcon d="M7 1h2v1h1v1h1v1h1v1h1v1h1v1h1v2h-2v6H9v-4H7v4H3V9H1V7h1V6h1V5h1V4h1V3h1V2h1Zm1 2H7v1H6v1H5v1H4v1H3v1h2v5h1v-4h4v4h1V8h2V7h-1V6h-1V5h-1V4H9V3Z" />
        오늘
      </NavLink>
      <NavLink to="/student/map">
        <MenuIcon d="M1 4h2V3h2V2h2v1h2v1h2V3h2V2h2v11h-2v1h-2v1H9v-1H7v-1H5v1H3v1H1Zm2 1v8h1v-1h1V4H4v1Zm4 0v6h1v1h1v1h1V5H9v1H8V5Zm5 0v8h1v-1h1V4h-1v1Z" />
        탐험
      </NavLink>
      <Link
        to="/student/closet"
        className={dressing ? 'active' : undefined}
        aria-current={dressing ? 'page' : undefined}
      >
        <MenuIcon d="M7 2h3v1h1v3h-1v1H9v2h2v1h2v1h2v4H1v-4h2v-1h2V9h2V6h2V4H7v1H5V3h2Zm1 8H7v1H5v1H3v1h10v-1h-2v-1H9v-1Z" />
        꾸미기
      </Link>
      <NavLink to="/student/questions?filter=REVIEW_QUEUE">
        <MenuIcon d="M1 2h5v1h4V2h5v11h-4v1H9v1H7v-1H5v-1H1Zm2 2v7h3v1h1V5H5V4Zm10 0h-2v1H9v7h1v-1h3Z" />
        나의 문제
      </NavLink>
    </nav>
  );
}
