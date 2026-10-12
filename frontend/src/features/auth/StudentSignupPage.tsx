import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClassroomFields } from './ClassroomFields';
import { resolveClassroom, registerStudent } from './api';
import { AuthFrame, FormError, useSubmission } from './FormParts';
import type { ClassroomSelection } from './types';
export function StudentSignupPage() {
  const [selection, setSelection] = useState<ClassroomSelection>({
    schoolId: '',
    gradeLabel: '',
    classNumber: 0,
  });
  const navigate = useNavigate();
  const submit = useSubmission();
  return (
    <AuthFrame title="학생 회원가입" description="선생님께 받은 학급 가입 코드를 준비해 주세요.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void submit.run(async () => {
            const classCode = String(data.get('classCode'));
            await resolveClassroom({ ...selection, classCode });
            const studentNumber = Number(data.get('studentNumber'));
            await registerStudent({
              ...selection,
              studentNumber,
              name: String(data.get('name')),
              nickname: String(data.get('nickname')),
              password: String(data.get('password')),
              classCode,
            });
            navigate('/login', { replace: true, state: { ...selection, studentNumber } });
          });
        }}
      >
        <fieldset disabled={submit.pending}>
          <ClassroomFields value={selection} onChange={setSelection} />
          <label htmlFor="number">번호</label>
          <input
            id="number"
            name="studentNumber"
            inputMode="numeric"
            pattern="[0-9]+"
            required
            autoComplete="off"
          />
          <div className="form-row">
            <div>
              <label htmlFor="name">이름</label>
              <input id="name" name="name" required autoComplete="name" />
            </div>
            <div>
              <label htmlFor="nickname">별명</label>
              <input id="nickname" name="nickname" required autoComplete="nickname" />
            </div>
          </div>
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            type="password"
            name="password"
            required
            autoComplete="new-password"
            aria-describedby="password-help"
          />
          <small id="password-help">8자 이상으로 입력해 주세요.</small>
          <label htmlFor="class-code">학급 가입 코드</label>
          <input
            id="class-code"
            name="classCode"
            required
            autoComplete="off"
            spellCheck={false}
            aria-describedby="code-help"
          />
          <small id="code-help">학교·학년·반과 코드가 일치해야 가입할 수 있어요.</small>
          <FormError message={submit.error} />
          <button type="submit">{submit.pending ? '가입 중…' : '가입하기'}</button>
        </fieldset>
      </form>
      <p className="form-links">
        이미 가입했다면 <Link to="/login">학생 로그인</Link>
      </p>
    </AuthFrame>
  );
}
