import { expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server, student } from '../../test/server';
import { gameView } from '../../test/gameFixtures';
import { renderPage } from '../../test/render';
import { App } from '../../app/App';
import type { AppearanceCommand } from './types';
import { activeSession, learningStatus, sessionId } from '../../test/learningFixtures';

// Dropped characters, lost gear, preview-only selection, and ignoring restored GET all break this journey.
it('selectsAndRestoresAllNineCharacters', async () => {
  let saved = { ...gameView };
  const commands: AppearanceCommand[] = [];
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.get('*/api/student/game', () => HttpResponse.json(saved)),
    http.put('*/api/student/game/appearance', async ({ request }) => {
      const command = (await request.json()) as AppearanceCommand;
      commands.push(command);
      saved = {
        ...saved,
        characterId: command.characterId,
        equippedBySlot: command.equippedBySlot,
        revision: saved.revision + 1,
      };
      return HttpResponse.json(saved);
    }),
  );
  const user = userEvent.setup();
  const first = renderPage(<App />, '/student/character');
  await screen.findByRole('heading', { name: '캐릭터 선택' });
  for (const [id, name] of [
    ['haru', '하루'],
    ['naru', '나루'],
    ['sodam', '소담'],
    ['iden', '이든'],
    ['arin', '아린'],
    ['rumi', '루미'],
    ['onyu', '온유'],
    ['bora', '보라'],
    ['sion', '시온'],
  ]) {
    await user.click(await screen.findByRole('button', { name: `${name} 선택` }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: `${name} 선택` })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(saved.characterId).toBe(id);
  }
  expect(commands).toHaveLength(9);
  expect(commands[0]).toEqual({
    characterId: 'haru',
    expectedRevision: 7,
    equippedBySlot: { face: 'face-1', hat: null, top: null, bottom: null, shoes: null, hand: null },
  });
  first.unmount();
  renderPage(<App />, '/student/character');
  expect(await screen.findByRole('button', { name: '시온 선택' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(commands).toHaveLength(9);
});

it('initialUnselectedGameOnlyReadsAndNeverCreatesAnAppearance', async () => {
  let puts = 0;
  server.use(
    http.get('*/api/auth/me', () => HttpResponse.json(student)),
    http.get('*/api/student/game', () =>
      HttpResponse.json({
        ...gameView,
        revision: 0,
        equippedBySlot: { face: null, hat: null, top: null, bottom: null, shoes: null, hand: null },
        inventory: gameView.inventory.map((entry) => ({
          ...entry,
          owned: false,
          acquiredAt: null,
        })),
      }),
    ),
    http.put('*/api/student/game/appearance', () => {
      puts++;
      return HttpResponse.json(gameView);
    }),
  );
  renderPage(<App />, '/student/character');
  expect(await screen.findByText('아직 친구를 선택하지 않았어요.')).toBeVisible();
  expect(screen.getByRole('button', { name: '하루 선택' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(puts).toBe(0);
});

it.each(['unselected', 'gameError'])(
  'directActiveLearningIsNeverBlockedByCharacterSetup: %s',
  async (state) => {
    let gameReads = 0,
      puts = 0;
    server.use(
      http.get('*/api/auth/me', () => HttpResponse.json(student)),
      http.get('*/api/student/game', () => {
        gameReads++;
        return state === 'unselected'
          ? HttpResponse.json(gameView)
          : new HttpResponse(null, { status: 500 });
      }),
      http.put('*/api/student/game/appearance', () => {
        puts++;
        return HttpResponse.json(gameView);
      }),
      http.get('*/api/student/learning/sessions/:id', () => HttpResponse.json(activeSession)),
      http.get('*/api/student/learning/status', () => HttpResponse.json(learningStatus)),
    );
    renderPage(<App />, `/student/learning/sessions/${sessionId}`);
    expect(await screen.findByText('테스트용 문항입니다.')).toBeVisible();
    expect(screen.queryByRole('heading', { name: '캐릭터 선택' })).toBeNull();
    expect(gameReads).toBe(0);
    expect(puts).toBe(0);
  },
);
