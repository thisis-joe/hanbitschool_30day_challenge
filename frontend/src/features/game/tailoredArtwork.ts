import type { EquipmentArt } from './artwork';

// Fine contours are rasterized on the avatar's native pixel grid. The old
// multi-pixel stair steps grew much coarser than the character when fitted.
const hat = (markup: string): EquipmentArt => ({
  width: 112,
  height: 64,
  rendering: 'geometricPrecision',
  markup: `<g stroke="#584937" stroke-width="1.2" stroke-linejoin="round">${markup}</g>`,
});

export const tailoredHats: EquipmentArt[] = [
  hat(`
    <path d="M18 41Q19 15 39 8Q61 1 81 14Q92 22 94 41Z" fill="#c7a55f"/>
    <path d="M22 37Q25 13 46 9Q66 5 80 17Q86 25 87 37Z" fill="#e7cc87" stroke="none"/>
    <path d="M48 9Q40 20 40 37M64 9Q76 20 77 37" fill="none" stroke="#b49459" stroke-width=".8"/>
    <path d="M20 34Q55 42 93 34L94 42Q53 51 18 42Z" fill="#8a7350"/>
    <path d="M10 41Q25 40 43 44Q75 49 101 40L106 44Q85 56 49 53Q20 52 8 46Z" fill="#d4b36c"/>
    <path d="M14 45Q51 58 100 44" fill="none" stroke="#f8e4aa"/>
    <path d="M29 20Q36 12 48 12M52 11L63 12" fill="none" stroke="#f9e9b7"/>
    <rect x="77" y="36" width="7" height="6" rx="1" fill="#ecd28c"/>
    <path d="M80 37v4" stroke="#8b7042"/>
  `),
  hat(`
    <path d="M24 38L29 13Q53 5 78 14L87 38Z" fill="#829d78"/>
    <path d="M30 33L34 16Q54 11 73 17L79 33Q52 38 30 33Z" fill="#a8be98" stroke="none"/>
    <path d="M32 18Q54 13 75 19M31 21Q54 16 76 22" fill="none" stroke="#d2ddbc" stroke-width=".7"/>
    <path d="M25 33Q54 39 84 33L87 39Q55 47 23 40Z" fill="#536f57"/>
    <path d="M23 38Q52 47 87 38L105 47Q94 56 57 55Q23 55 7 46Z" fill="#8da980"/>
    <path d="M14 46Q55 60 99 47M25 42Q54 51 87 43" fill="none" stroke="#c4d2ac" stroke-width=".8"/>
    <path d="M77 35l5 1v5l-5-1Z" fill="#e5d3a0"/>
  `),
  // Right-facing three-quarter cap: broad near side, foreshortened front badge
  // and a visor projecting toward the same side as the character's gaze.
  hat(`
    <path d="M22 34Q9 27 15 19Q23 10 41 12Q62 3 84 10Q103 12 103 23Q102 30 91 34Q60 43 22 34Z" fill="#d7d5c8"/>
    <path d="M20 25Q20 17 42 17Q63 8 83 15Q96 16 98 23Q78 34 31 32Z" fill="#fff7e0" stroke="none"/>
    <path d="M28 19Q40 18 46 15M54 14Q70 10 83 16" fill="none" stroke="#fffdf3"/>
    <path d="M24 33Q47 40 68 37L93 30L92 44Q78 51 64 51Q41 51 25 44Z" fill="#547d96"/>
    <path d="M27 35Q47 42 66 39L65 48Q44 49 28 42Z" fill="#8fb7c9" stroke="none"/>
    <path d="M69 39L90 33L89 43Q80 48 68 49Z" fill="#739fb7" stroke="none"/>
    <path d="M28 42Q45 49 64 47M68 38L67 49" fill="none" stroke="#ccdfdf" stroke-width=".8"/>
    <path d="M66 47Q81 48 93 42L108 47Q103 54 80 55L64 50Z" fill="#45677f"/>
    <path d="M72 49Q89 52 104 47M81 53Q94 53 102 50" fill="none" stroke="#a3c3d0" stroke-width=".8"/>
    <g transform="matrix(.82 -.15 0 1 80 39)">
      <path d="M0-4V6M-4-1H4M-5 2Q0 10 5 2" fill="none" stroke="#fff0c9" stroke-width="1.6"/>
    </g>
    <path d="M26 42q-4 7-11 10l4 3q9-7 10-12" fill="#668ea7"/>
  `),
  hat(`
    <path d="M12 34Q14 20 37 14Q61-1 84 15Q101 18 103 30Q99 40 85 44L29 47Q14 44 12 34Z" fill="#9e7151"/>
    <path d="M17 32Q21 23 40 18Q61 6 81 19Q96 21 97 29Q84 39 40 40Q25 39 17 32Z" fill="#c79770" stroke="none"/>
    <path d="M34 24Q55 13 70 17M77 19l8 4" fill="none" stroke="#e6bf98" stroke-width="1"/>
    <path d="M29 41Q57 48 85 39L84 48Q56 57 29 49Z" fill="#76553f"/>
    <path d="M32 44Q57 51 81 43" fill="none" stroke="#b98b64"/>
    <path d="M65 10l1-6q3-2 5 0l-1 6" fill="#896144"/>
    <path d="M80 42l5-1v4l-5 1Z" fill="#dec08b"/>
  `),
  // The front peak and jewel sit over the right-facing forehead. The broader
  // left wall and compressed right points give the crown the same perspective.
  hat(`
    <path d="M32 31L39 20L49 28L58 17L66 29L80 23L86 33Q61 42 32 31Z" fill="#a78b52"/>
    <path d="M29 25L40 33L48 20L59 34L73 12L79 32L88 23L86 45Q69 56 35 45Z" fill="#a9823e"/>
    <path d="M32 29L41 37L48 25L60 39L72 20L77 37L85 28L83 43Q68 51 38 42Z" fill="#e3c473" stroke="none"/>
    <path d="M32 29L41 37L48 25L50 30L42 40L38 42L35 41Z" fill="#c5a158" stroke="none"/>
    <path d="M37 37Q52 44 67 42L84 36L83 44Q65 53 37 44Z" fill="#a898be"/>
    <path d="M40 39Q53 45 66 44L65 48Q51 49 40 43Z" fill="#c5b7d4" stroke="none"/>
    <path d="M35 44Q63 56 85 44" fill="none" stroke="#f9e6a6" stroke-width="2"/>
    <path d="M72 36L77 39L75 46L69 43Z" fill="#6a9e91"/>
    <path d="M72 38L75 40L71 42Z" fill="#d5eedb" stroke="none"/>
    <path d="M65 33L72 18L75 29" fill="none" stroke="#f9e6a6" stroke-width=".8"/>
    <ellipse cx="50" cy="43" rx="1.6" ry="1.3" fill="#f8e8af" stroke="none"/>
    <ellipse cx="82" cy="40" rx=".8" ry="1.3" fill="#f8e8af" stroke="none"/>
  `),
];

const bag = (markup: string): EquipmentArt => ({
  width: 32,
  height: 58,
  rendering: 'geometricPrecision',
  markup: `<g stroke="#584937" stroke-width=".9" stroke-linejoin="round">${markup}</g>`,
});
export const tailoredBags = [
  bag(`
    <path d="M12 33Q7 22 15 24Q23 22 20 33" fill="none" stroke="#90734e" stroke-width="2"/>
    <path d="M12 33Q7 37 7 44Q6 51 15 52Q25 52 25 45Q25 37 19 33Z" fill="#c9a771"/>
    <path d="M13 35Q9 40 10 46Q12 50 18 49Q23 48 21 42L18 35Z" fill="#e6ca95" stroke="none"/>
    <path d="M11 34l9 1M18 35l2 7" fill="none" stroke="#86714b"/>
    <path d="M21 40q8 0 3 7l-4-3Z" fill="#7d9567"/>
    <path d="M12 39l-1 5m2 4h4" fill="none" stroke="#f4dfb4"/>
  `),
  bag(`
    <path d="M11 33v-5q5-6 10 0v5" fill="none" stroke="#506b50" stroke-width="2"/>
    <path d="M8 32Q16 29 24 33L26 48Q25 52 17 52L8 50Q5 43 8 32Z" fill="#729271"/>
    <path d="M9 34Q16 31 23 35L24 47Q18 50 9 47Z" fill="#91ab80" stroke="none"/>
    <path d="M8 33Q16 31 24 34L23 39Q16 43 8 38Z" fill="#b1c39a"/>
    <path d="M11 43h10v6H11Z" fill="#809d73" stroke="#5d7b5d"/>
    <path d="M12 44h7M9 35l8-1" fill="none" stroke="#d5ddae" stroke-width=".7"/>
    <rect x="15" y="37" width="3" height="4" rx=".5" fill="#e9ce80"/>
  `),
  bag(`
    <path d="M11 33v-4q5-6 10 0v4" fill="none" stroke="#825c3e" stroke-width="2"/>
    <path d="M5 33Q15 31 27 33L28 47Q17 51 5 47Z" fill="#a87652"/>
    <path d="M7 35l18-1v11Q17 48 7 45Z" fill="#bb8b62" stroke="none"/>
    <path d="M5 33Q16 31 27 33L25 39L16 43L7 39Z" fill="#d1a577"/>
    <path d="M7 35l9 6 9-6M7 45l6 1" fill="none" stroke="#edd1a6" stroke-width=".7"/>
    <rect x="14" y="40" width="5" height="5" rx=".7" fill="#dfbd71"/>
    <path d="M16 41v3" stroke="#88653a"/>
  `),
];

const palettes = [
  ['#d5b66b', '#f1dba0', '#a78b51'],
  ['#8ca77b', '#bdcfa3', '#5e7b57'],
  ['#87adc2', '#c7dce2', '#547b94'],
  ['#b98665', '#e1b794', '#805b44'],
  ['#ab9aba', '#d8cbe0', '#7f6e93'],
];
const garment = (width: number, height: number, markup: string): EquipmentArt => ({
  width,
  height,
  rendering: 'geometricPrecision',
  markup: `<g stroke="#584937" stroke-width=".9" stroke-linejoin="round">${markup}</g>`,
});
const tops = palettes.map(([cloth, light, shade], i) =>
  garment(
    44,
    44,
    `
  <path d="M10 6L17 2Q18 9 25 13Q30 8 30 2L36 5L39 14L35 20L36 40Q23 44 8 40L10 20L6 14Z" fill="${shade}"/>
  <path d="M11 7l5-3q1 8 9 12v24q-8 2-15-1l1-20-3-5Z" fill="${cloth}" stroke="none"/>
  <path d="M32 4l3 2 2 8-4 6 1 20-7 1V15q5-4 5-11Z" fill="${cloth}" stroke="none"/>
  <path d="M12 9l3-3q2 8 8 10v2q-7-3-9-7l-3 8" fill="${light}" stroke="none"/>
  <path d="M26 15v25M11 37q11 3 23 0" fill="none" stroke="${shade}" stroke-width=".7"/>
  <path d="M11 23l10 1v9l-10-1Z M30 24l4-1v9l-4 1Z" fill="${shade}" stroke-width=".6"/>
  <path d="M12 24l8 1v3l-8-1Z M30 25l4-1v3l-4 1Z" fill="${light}" stroke="none"/>
  ${i === 2 ? `<path d="M11 19l12 1m-11 1 11 1m6-3 6-1m-5 18 5-1" stroke="${light}" stroke-width=".7"/>` : ''}
  ${i === 3 ? `<path d="M14 4l7 10-6 4-5-9m19 6 4 3 3-10" fill="${light}" stroke-width=".6"/>` : ''}
  ${i === 4 ? '<path d="M16 20l1 3 3 1-3 1-1 3-1-3-3-1 3-1Z" fill="#f5e7b6" stroke="none"/>' : ''}
  <path d="M24 20h1m-1 7h1m-1 8h1" stroke="#fff0b4" stroke-width="1.4"/>
  <path d="M12 34l7 1M33 8v5" stroke="${light}" stroke-width=".6"/>
`,
  ),
);
const bottoms = palettes.map(([cloth, light, shade], i) =>
  garment(
    40,
    28,
    `
  <path d="M6 2Q20 4 34 2L36 23L23 26L20 14L17 26L3 24Z" fill="${shade}"/>
  <path d="M8 5Q20 7 32 5L34 21L25 23L22 12L18 11L15 23L5 22Z" fill="${cloth}" stroke="none"/>
  <path d="M8 6Q20 8 32 6M20 8l1 4M10 9l-2 7M29 9l2 6" fill="none" stroke="${shade}" stroke-width=".8"/>
  <path d="M5 21l10 1v3L5 23Z M24 22l10-2v3l-9 2Z" fill="${light}" stroke="none"/>
  ${i === 3 ? '<path d="M7 3q13 3 26 0v3Q20 9 7 6Z" fill="#805b44"/><rect x="21" y="3" width="4" height="4" rx=".5" fill="#eace94"/>' : ''}
  <path d="M9 8l5 1m12 0 4-1" stroke="${light}" stroke-width=".7"/>
`,
  ),
);
const shoes = palettes.map(([cloth, light, shade], i) => {
  const top = [13, 5, 11, 1, 15][i];
  const boot = i === 1 || i === 3;
  const outline = `
    <path d="M3 ${top + 1}Q8 ${top - 1} 13 ${top + 1}L13 20Q20 21 21 25L21 29H1L1 23Z" fill="${shade}"/>
    <path d="M5 ${top + 2}L11 ${top + 2}L11 20Q17 22 19 24L19 26H3L3 23Z" fill="${cloth}" stroke="none"/>
    <path d="M2 26Q12 27 20 26v2H2Z" fill="${boot ? shade : '#eee4c8'}" stroke="none"/>
    <path d="M4 ${top + 2}h8v3H4Z" fill="${light}" stroke="none"/>
    <path d="M8 ${top + 6}l4 1M8 ${Math.min(top + 9, 23)}l4 1${boot ? 'M8 19l4 1' : ''}" fill="none" stroke="#f8edcc" stroke-width=".8"/>
    <path d="M14 22q4 0 5 3" fill="none" stroke="${light}" stroke-width="1.2"/>
    <path d="M4 ${top + 5}v${Math.max(2, 19 - top)}" stroke="${shade}" stroke-width=".7"/>
  `;
  const near = garment(22, 30, outline);
  const far = garment(19, 28, `<g transform="scale(.85 .93)">${outline}</g>`);
  return {
    ...garment(42, 30, `${near.markup}<g transform="translate(23 2)">${far.markup}</g>`),
    parts: [near, far],
  };
});

export const tailoredGarments = { top: tops, bottom: bottoms, shoes };
