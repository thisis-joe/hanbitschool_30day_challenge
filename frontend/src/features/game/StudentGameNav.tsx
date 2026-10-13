import { NavLink } from 'react-router-dom';
import './game.css';

export function StudentGameNav() {
  return (
    <nav className="game-student-nav" aria-label="학생 여행 메뉴">
      <NavLink to="/student/learning" end>
        오늘
      </NavLink>
      <NavLink to="/student/map">탐험</NavLink>
      <NavLink to="/student/closet">꾸미기</NavLink>
      <NavLink to="/student/questions?filter=REVIEW_QUEUE">나의 문제</NavLink>
    </nav>
  );
}
