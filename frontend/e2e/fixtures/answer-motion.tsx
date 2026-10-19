import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AnswerGameScene } from '../../src/features/game/AnswerGameScene';
import { buildAvatarRig, paintAvatarPose } from '../../src/features/game/motion/rig';
import { POSES } from '../../src/features/game/motion/poses';
import { CHARACTER_IDS, CHARACTER_NAMES, SLOTS } from '../../src/features/game/types';
import type { CharacterId, Equipment } from '../../src/features/game/types';
import type { AnswerChoice, AnswerOutcome } from '../../src/features/learning/types';

const outfit = (value: number): Equipment =>
  Object.fromEntries(SLOTS.map((slot) => [slot, value ? `${slot}-${value}` : null])) as Equipment;
function Demo() {
  const [choice, setChoice] = useState<AnswerChoice>();
  const [outcome, setOutcome] = useState<AnswerOutcome>();
  const [round, setRound] = useState(0);
  const [character, setCharacter] = useState<CharacterId>('haru');
  const [gear, setGear] = useState(0);
  return (
    <>
      <label>
        친구{' '}
        <select value={character} onChange={(e) => setCharacter(e.target.value as CharacterId)}>
          {CHARACTER_IDS.map((id) => (
            <option key={id} value={id}>
              {CHARACTER_NAMES[id]}
            </option>
          ))}
        </select>
      </label>
      <label>
        장비{' '}
        <select value={gear} onChange={(e) => setGear(Number(e.target.value))}>
          {[0, 1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n ? `${n}번 세트` : '기본'}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button
          onClick={() => {
            setChoice('O');
            setOutcome('CORRECT');
          }}
        >
          O 정답
        </button>
        <button
          onClick={() => {
            setChoice('X');
            setOutcome('WRONG');
          }}
        >
          X 오답
        </button>
        <button
          onClick={() => {
            setChoice('X');
            setOutcome(undefined);
          }}
        >
          X 응답 대기
        </button>
        <button onClick={() => setOutcome('CORRECT')}>서버 정답 도착</button>
        <button
          onClick={() => {
            setRound((n) => n + 1);
            setChoice(undefined);
            setOutcome(undefined);
          }}
        >
          다음 문항
        </button>
      </div>
      <AnswerGameScene
        key={round}
        appearance={{
          catalogVersion: 'qa',
          contentVersion: 'qa',
          characterId: character,
          equippedBySlot: outfit(gear),
          revision: 1,
          characters: [],
          items: [],
          inventory: [],
        }}
        choice={choice}
        outcome={outcome}
      />
    </>
  );
}
const root = createRoot(document.getElementById('root')!);
root.render(<Demo />);
const controller = new AbortController();
import.meta.hot?.dispose(() => {
  controller.abort();
  root.unmount();
  document.querySelector('#poses')!.replaceChildren();
});
for (const id of CHARACTER_IDS) {
  for (const gear of [0, 1, 5]) {
    const rig = await buildAvatarRig(id, outfit(gear), controller.signal);
    for (const [name, pose] of Object.entries(POSES)) {
      const figure = document.createElement('figure'),
        caption = document.createElement('figcaption'),
        canvas = document.createElement('canvas');
      canvas.width = 176;
      canvas.height = 216;
      canvas.dataset.character = id;
      canvas.dataset.pose = name;
      canvas.dataset.outfit = String(gear);
      caption.textContent = `${CHARACTER_NAMES[id]} · ${gear ? `${gear}번 장비` : '기본'} · ${name}`;
      paintAvatarPose(canvas, rig, pose);
      figure.append(caption, canvas);
      document.querySelector('#poses')!.append(figure);
    }
  }
}
document.documentElement.dataset.ready = 'true';
