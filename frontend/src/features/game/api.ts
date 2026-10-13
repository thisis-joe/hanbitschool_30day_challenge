import { request } from '../../lib/http';
import type { AppearanceCommand, GameView, JourneyView } from './types';

export const getGame = (signal?: AbortSignal): Promise<GameView> =>
  request<GameView>('/api/student/game', { signal });
export const saveAppearance = (
  command: AppearanceCommand,
  signal?: AbortSignal,
): Promise<GameView> =>
  request<GameView>('/api/student/game/appearance', {
    method: 'PUT',
    body: JSON.stringify(command),
    signal,
  });
export const getJourney = (signal?: AbortSignal): Promise<JourneyView> =>
  request<JourneyView>('/api/student/learning/map', { signal });
