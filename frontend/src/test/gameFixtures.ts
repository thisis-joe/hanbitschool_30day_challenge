import type { GameView, JourneyView } from '../features/game/types';

export const gameView: GameView = {
  catalogVersion: 'game-v1',
  contentVersion: 'hanbit-v1',
  characters: [
    { id: 'haru', name: '하루', assetKey: 'haru' },
    { id: 'naru', name: '나루', assetKey: 'naru' },
    { id: 'sodam', name: '소담', assetKey: 'sodam' },
    { id: 'iden', name: '이든', assetKey: 'iden' },
    { id: 'arin', name: '아린', assetKey: 'arin' },
    { id: 'rumi', name: '루미', assetKey: 'rumi' },
    { id: 'onyu', name: '온유', assetKey: 'onyu' },
    { id: 'bora', name: '보라', assetKey: 'bora' },
    { id: 'sion', name: '시온', assetKey: 'sion' },
  ],
  items: [
    {
      itemId: 'face-1',
      slot: 'face',
      value: 1,
      rewardDay: 1,
      name: '동그란 안경',
      assetKey: 'face-1',
    },
    { itemId: 'hat-1', slot: 'hat', value: 1, rewardDay: 2, name: '작은 모자', assetKey: 'hat-1' },
    {
      itemId: 'hand-5',
      slot: 'hand',
      value: 5,
      rewardDay: 30,
      name: '빛나는 지팡이',
      assetKey: 'hand-5',
    },
  ],
  characterId: null,
  revision: 7,
  equippedBySlot: { face: 'face-1', hat: null, top: null, bottom: null, shoes: null, hand: null },
  inventory: [
    { itemId: 'face-1', owned: true, acquiredAt: '2026-10-13T00:00:00Z' },
    { itemId: 'hat-1', owned: true, acquiredAt: '2026-10-13T00:01:00Z' },
    { itemId: 'hand-5', owned: false, acquiredAt: null },
  ],
};
export const journeyView: JourneyView = {
  contentVersion: 'hanbit-v1',
  calendarCap: 1,
  nextAction: 'START_FIRST',
  activeSessionId: null,
  firstAnswerCount: 0,
  journeyPosition: 0,
  courseCompleted: false,
  days: [
    {
      dayNumber: 1,
      state: 'NOT_STARTED',
      availability: 'AVAILABLE',
      firstAnsweredCount: 0,
      passedAt: null,
      rewardItemId: 'face-1',
      rewardOwned: false,
    },
  ],
  questions: [],
};
