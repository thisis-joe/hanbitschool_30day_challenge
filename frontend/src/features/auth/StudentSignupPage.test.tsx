import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Routes, Route, useLocation } from 'react-router-dom';
import { http, HttpResponse, delay } from 'msw';
import { server, student } from '../../test/server';
import { renderPage } from '../../test/render';
import { StudentSignupPage } from './StudentSignupPage';
async function fill() {
  const user = userEvent.setup();
  await screen.findByRole('option', { name: '한빛학교' });
  await user.selectOptions(screen.getByLabelText('학교'), 'school-a');
  await screen.findByRole('option', { name: '1학년' });
  await user.selectOptions(await screen.findByLabelText('학년'), '1학년');
  await user.selectOptions(screen.getByLabelText('반'), '1');
  await user.type(screen.getByLabelText('번호'), '01');
  await user.type(screen.getByLabelText('이름'), '김민수');
  await user.type(screen.getByLabelText('별명'), '숲친구');
  await user.type(screen.getByLabelText('비밀번호'), 'Hanbit!2026');
  await user.type(screen.getByLabelText('학급 가입 코드'), 'ABCDEFGH');
  return user;
}
function Location() {
  const l = useLocation();
  return <output data-testid="location">{JSON.stringify(l.state)}</output>;
}
describe('StudentSignupPage', () => {
  it('schoolChangeClearsGradeAndClass', async () => {
    renderPage(<StudentSignupPage />);
    const user = await fill();
    await user.selectOptions(screen.getByLabelText('학교'), 'school-b');
    expect(screen.getByLabelText('학년')).toHaveValue('');
    expect(screen.getByLabelText('반')).toHaveValue('');
    await screen.findByRole('option', { name: '중1' });
    await user.selectOptions(screen.getByLabelText('학년'), '중1');
    await user.selectOptions(screen.getByLabelText('반'), '3');
    await user.selectOptions(screen.getByLabelText('학교'), 'school-a');
    expect(screen.getByLabelText('학년')).toHaveValue('');
  });
  it('signupSendsNameAndNickname', async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post('*/api/auth/students/register', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(student, { status: 201 });
      }),
    );
    renderPage(
      <Routes>
        <Route path="/" element={<StudentSignupPage />} />
        <Route path="/login" element={<Location />} />
      </Routes>,
    );
    const user = await fill();
    await user.click(screen.getByRole('button', { name: '가입하기' }));
    await waitFor(() =>
      expect(body).toMatchObject({ name: '김민수', nickname: '숲친구', studentNumber: 1 }),
    );
    const state = await screen.findByTestId('location');
    expect(state.textContent).toContain('school-a');
    for (const secret of ['Hanbit', 'nickname', 'password', 'classCode'])
      expect(state.textContent).not.toContain(secret);
  });
  it('doubleSubmitMakesOneRequest', async () => {
    let count = 0;
    server.use(
      http.post('*/api/auth/students/register', async () => {
        count++;
        await delay(80);
        return HttpResponse.json(student, { status: 201 });
      }),
    );
    renderPage(<StudentSignupPage />);
    const user = await fill();
    await user.dblClick(screen.getByRole('button', { name: '가입하기' }));
    await waitFor(() => expect(count).toBe(1));
  });
  it('reports403AndDoesNotCallSignupAfterResolveFailure', async () => {
    let count = 0;
    server.use(
      http.post('*/api/public/classrooms/resolve', () =>
        HttpResponse.json(
          { code: 'INVALID_CLASS_LINK', message: '가입 코드를 확인해 주세요.', fieldErrors: {} },
          { status: 400 },
        ),
      ),
      http.post('*/api/auth/students/register', () => {
        count++;
        return HttpResponse.json(student);
      }),
    );
    renderPage(<StudentSignupPage />);
    const user = await fill();
    await user.click(screen.getByRole('button', { name: '가입하기' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('가입 코드');
    expect(count).toBe(0);
  });
});
