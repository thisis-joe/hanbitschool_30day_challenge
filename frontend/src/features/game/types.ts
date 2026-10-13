export type CharacterId =
  'haru' | 'naru' | 'sodam' | 'iden' | 'arin' | 'rumi' | 'onyu' | 'bora' | 'sion';
export type Slot = 'face' | 'hat' | 'top' | 'bottom' | 'shoes' | 'hand';
export type Equipment = Record<Slot, string | null>;
export const CHARACTER_IDS: readonly CharacterId[] = [
  'haru',
  'naru',
  'sodam',
  'iden',
  'arin',
  'rumi',
  'onyu',
  'bora',
  'sion',
];
export const CHARACTER_NAMES: Record<CharacterId, string> = {
  haru: '하루',
  naru: '나루',
  sodam: '소담',
  iden: '이든',
  arin: '아린',
  rumi: '루미',
  onyu: '온유',
  bora: '보라',
  sion: '시온',
};
export const SLOTS: readonly Slot[] = ['face', 'hat', 'top', 'bottom', 'shoes', 'hand'];
export function emptyEquipment(): Equipment {
  return { face: null, hat: null, top: null, bottom: null, shoes: null, hand: null };
}

export interface CharacterOption {
  id: CharacterId;
  name: string;
  assetKey: string;
}
export interface GameItem {
  itemId: string;
  slot: Slot;
  value: number;
  rewardDay: number;
  name: string;
  assetKey: string;
}
export interface InventoryItem {
  itemId: string;
  owned: boolean;
  acquiredAt: string | null;
}
export interface GameView {
  catalogVersion: string;
  contentVersion: string;
  characters: CharacterOption[];
  items: GameItem[];
  characterId: CharacterId | null;
  revision: number;
  equippedBySlot: Equipment;
  inventory: InventoryItem[];
}
export interface AppearanceCommand {
  characterId: CharacterId | null;
  equippedBySlot: Equipment;
  expectedRevision: number;
}
export interface JourneyDay {
  dayNumber: number;
  state: import('../learning/types').DayProgressState;
  availability: string;
  firstAnsweredCount: number;
  passedAt: string | null;
  rewardItemId: string | null;
  rewardOwned: boolean;
}
export interface JourneyQuestion {
  questionId: number;
  dayNumber: number;
  position: number;
  outcome: string;
}
export interface JourneyView {
  contentVersion: string;
  calendarCap: number;
  nextAction: import('../learning/types').NextLearningAction;
  activeSessionId: string | null;
  firstAnswerCount: number;
  journeyPosition: number;
  courseCompleted: boolean;
  days: JourneyDay[];
  questions: JourneyQuestion[];
}
