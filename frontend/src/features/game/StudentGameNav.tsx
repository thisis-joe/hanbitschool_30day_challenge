import { Link, NavLink, useLocation } from 'react-router-dom';
import { PixelIcon } from '../../app/PixelIcon';
import './game.css';

export function StudentGameNav() {
  const { pathname } = useLocation();
  const dressing = pathname === '/student/closet' || pathname === '/student/character';
  return (
    <nav className="game-student-nav" aria-label="학생 여행 메뉴">
      <NavLink to="/student/learning">
        <PixelIcon name="home" />
        <span>오늘</span>
      </NavLink>
      <NavLink to="/student/map">
        <PixelIcon name="map" />
        <span>탐험</span>
      </NavLink>
      <Link
        to="/student/closet"
        className={dressing ? 'active' : undefined}
        aria-current={dressing ? 'page' : undefined}
      >
        <PixelIcon name="clothes" />
        <span>꾸미기</span>
      </Link>
      <NavLink to="/student/questions?filter=REVIEW_QUEUE">
        <PixelIcon name="journal" />
        <span>나의 문제</span>
      </NavLink>
    </nav>
  );
}
