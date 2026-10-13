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
