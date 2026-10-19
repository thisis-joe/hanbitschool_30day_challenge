import type { Slot } from './types';
import { tailoredBags, tailoredGarments, tailoredHats } from './tailoredArtwork';

export interface EquipmentArt {
  width: number;
  height: number;
  markup: string;
  rendering?: 'crispEdges' | 'geometricPrecision';
  parts?: EquipmentArt[];
}
// Fixed local face and wand artwork; tailored wearables share the same canonical IDs.
// Only canonical local item IDs resolve to these paths and colors.
function headHandDesign(slot: Slot, value: number): EquipmentArt | null {
  if (!Number.isInteger(value) || value < 1 || value > 5) return null;
  const ink = '#504539';
  const p = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`;
  const r = (x: number, y: number, w: number, h: number, fill: string, extra = '') =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
  let markup = '';
  if (slot === 'face') {
    // Pixel rings keep the base character's eyes visible; the far lens is narrower.
    if (value === 1) {
      markup = p('M5 13H8V12H12V13H17V15H21V17H18V16H13V15H8V16H5Z', '#8b7054');
      markup += p(
        'M25 8H35V10H39V13H41V21H39V24H35V26H25V24H21V21H19V13H21V10H25Z M25 10V12H23V14H21V20H23V22H25V24H35V22H37V20H39V14H37V12H35V10Z',
        '#8b7054',
        'fill-rule="evenodd"',
      );
      markup += p(
        'M54 10H62V12H65V15H67V21H65V24H62V26H54V24H51V21H49V15H51V12H54Z M54 12V14H53V16H51V20H53V22H54V24H62V22H63V20H65V16H63V14H62V12Z',
        '#8b7054',
        'fill-rule="evenodd"',
      );
      markup += p(
        'M40 15H44V13H47V14H51V16H47V15H45V17H40Z M66 13H69V12H71V15H68V16H66Z',
        '#8b7054',
      );
      markup +=
        r(25, 10, 7, 1, '#f8e4bf') +
        r(54, 12, 4, 1, '#f8e4bf') +
        r(20, 14, 1, 5, '#bca17e') +
        r(50, 16, 1, 4, '#bca17e');
    }
    if (value === 2) {
      markup = p('M5 12H10V11H15V12H21V15H18V14H12V13H8V15H5Z', '#536c4f');
      markup += p(
        'M18 10H22V9H36V7H42V12H41V23H38V26H23V24H20V20H18Z M23 11V13H21V19H23V22H25V24H37V22H39V13H36V11Z',
        '#536c4f',
        'fill-rule="evenodd"',
      );
      markup += p(
        'M49 12H52V11H61V9H67V13H66V24H63V26H53V24H50V21H49Z M54 13V14H52V20H54V23H62V23H64V14H61V13Z',
        '#536c4f',
        'fill-rule="evenodd"',
      );
      markup += p(
        'M40 15H44V14H48V15H51V17H47V16H44V17H40Z M66 12H69V11H71V13H69V14H66Z',
        '#536c4f',
      );
      markup +=
        r(23, 10, 12, 1, '#a6bf8f') +
        r(54, 12, 7, 1, '#a6bf8f') +
        r(38, 8, 3, 2, '#bdd0a7') +
        r(63, 10, 3, 2, '#bdd0a7');
    }
    if (value === 3) {
      markup = p('M5 13H9V12H13V13H18V15H22V18H18V17H13V16H9V17H5Z', ink);
      markup += p(
        'M24 7H36V9H40V13H43V21H40V25H36V27H24V25H20V21H17V13H20V9H24Z M25 10V12H23V15H20V19H23V22H25V24H35V22H37V19H40V15H37V12H35V10Z',
        ink,
        'fill-rule="evenodd"',
      );
      markup += p(
        'M53 10H62V12H65V15H67V21H65V25H62V27H53V25H50V21H48V15H50V12H53Z M54 13V15H52V20H54V24H61V22H63V15H61V13Z',
        ink,
        'fill-rule="evenodd"',
      );
      markup += p(
        'M24 8H36V10H39V13H41V21H39V24H36V26H24V24H21V21H19V13H21V10H24Z M25 10V12H23V15H20V19H23V22H25V24H35V22H37V19H40V15H37V12H35V10Z',
        '#c99b3e',
        'fill-rule="evenodd"',
      );
      markup += p(
        'M53 11H62V13H64V16H66V21H64V24H62V26H53V24H51V21H49V16H51V13H53Z M54 13V15H52V20H54V24H61V22H63V15H61V13Z',
        '#c99b3e',
        'fill-rule="evenodd"',
      );
      markup += p('M42 15H45V14H48V15H51V18H47V17H45V18H42Z M66 13H69V12H71V15H69V16H66Z', ink);
      markup +=
        r(24, 8, 11, 1, '#f4dc87') +
        r(53, 11, 8, 1, '#f4dc87') +
        r(21, 10, 2, 3, '#ebc663') +
        r(51, 13, 1, 3, '#ebc663');
    }
    if (value === 4) {
      markup = p(
        'M4 11H10V10H14V11H20V12H43V15H49V13H67V12H70V11H72V15H70V16H68V19H66V25H63V27H53V25H50V21H48V18H43V22H40V25H24V24H21V21H18V17H13V15H8V16H4Z',
        '#393d37',
      );
      markup += p('M21 15H40V20H38V23H25V22H23V19H21Z', '#34493f');
      markup += p('M52 16H64V21H62V24H55V23H53V20H52Z', '#34493f');
      markup += r(23, 15, 14, 1, '#718078') + r(54, 16, 8, 1, '#718078');
      markup += p('M25 16H29V18H27V19H24V17H25Z M55 17H58V19H56V20H54V18H55Z', '#c7d2c4');
      markup += r(20, 12, 21, 1, '#6b6d56') + r(51, 13, 14, 1, '#6b6d56');
    }
    if (value === 5) {
      markup = p('M5 14H9V13H13V14H20V16H17V17H13V16H9V17H5Z', '#877d96');
      markup += p(
        'M24 10H36V11H40V13H43V21H40V23H36V24H24V23H20V21H17V13H20V11H24Z M24 12V13H21V15H19V19H21V21H24V22H36V21H39V19H41V15H39V13H36V12Z',
        '#877d96',
        'fill-rule="evenodd"',
      );
      markup += p(
        'M53 11H63V13H66V15H68V21H66V23H63V25H53V23H50V21H48V15H50V13H53Z M53 13V15H51V16H50V20H52V22H54V23H62V22H64V20H66V16H64V15H62V13Z',
        '#877d96',
        'fill-rule="evenodd"',
      );
      markup += p(
        'M42 15H45V14H47V15H50V17H47V16H45V17H42Z M67 14H69V13H72V16H69V17H67Z',
        '#877d96',
      );
      markup +=
        r(24, 10, 11, 1, '#d6d0dc') +
        r(53, 11, 9, 1, '#d6d0dc') +
        r(20, 12, 3, 1, '#b7afc5') +
        r(50, 14, 2, 1, '#b7afc5');
    }
    return { width: 88, height: 34, markup };
  }
  if (slot === 'hand') {
    if (value === 4) {
      markup =
        p('M14 18H19V55H17V57H14Z', ink) +
        r(15, 18, 3, 36, '#b98848') +
        r(15, 20, 1, 33, '#e0b56d');
      markup += p('M14 1H19V4H23V6H26V9H29V14H26V17H23V20H10V18H7V15H4V10H7V7H11V5H14Z', ink);
      markup += p(
        'M15 3H18V6H22V8H24V11H27V13H24V16H22V18H11V16H9V14H6V11H9V9H12V7H15Z',
        '#cc9b43',
      );
      markup += p('M13 8H21V10H23V14H21V16H13V14H10V11H13Z', '#edca74');
      markup += r(14, 9, 6, 1, '#fff0b5') + r(12, 11, 3, 2, '#fff0b5') + r(15, 16, 5, 1, '#b17b37');
      markup += r(15, 5, 2, 3, '#f7e0a0') + r(23, 11, 3, 2, '#f7e0a0') + r(8, 9, 2, 2, '#f7e0a0');
      markup += r(13, 25, 7, 3, ink) + r(14, 26, 5, 1, '#d9bf77') + r(15, 51, 3, 2, '#d3ae6b');
    }
    if (value === 5) {
      markup =
        p('M14 19H18V54H17V57H14Z', ink) +
        r(15, 20, 2, 34, '#a4a5a8') +
        r(15, 22, 1, 31, '#dcdbd4');
      markup += p(
        'M15 1H21V4H17V5H13V7H11V13H13V16H17V17H22V14H25V18H22V21H13V19H9V16H6V8H8V5H11V3H15Z',
        ink,
      );
      markup += p(
        'M15 3H18V4H15V6H12V8H10V13H12V17H16V19H21V18H22V19H20V20H14V18H10V15H8V9H10V6H13V4H15Z',
        '#a99cbc',
      );
      markup += p('M12 5H15V6H12V8H10V13H11V15H9V13H9V9H10V7H12Z', '#ddd6df');
      markup += p('M25 5H28V8H31V11H29V15H25V13H22V9H25Z', ink);
      markup += p('M26 7H27V9H29V10H27V13H26V11H24V10H26Z', '#e5c77a');
      markup +=
        r(26, 9, 1, 2, '#fff0b7') +
        r(13, 25, 6, 3, ink) +
        r(14, 26, 4, 1, '#b8a8c7') +
        r(15, 50, 2, 2, '#c2b4cf');
    }
    return { width: 32, height: 58, markup };
  }
  return null;
}

export function parseItemId(itemId: string): { slot: Slot; value: number } | null {
  const match = /^(face|hat|top|bottom|shoes|hand)-([1-5])$/.exec(itemId);
  return match ? { slot: match[1] as Slot, value: Number(match[2]) } : null;
}

export function equipmentArt(itemId: string): EquipmentArt | null {
  const item = parseItemId(itemId);
  if (!item) return null;
  const { slot, value } = item;
  if (slot === 'hat') return tailoredHats[value - 1];
  if (slot === 'hand' && value <= 3) return tailoredBags[value - 1];
  if (slot === 'top' || slot === 'bottom' || slot === 'shoes') {
    return tailoredGarments[slot][value - 1];
  }
  return headHandDesign(slot, value);
}

export function equipmentSvg(art: EquipmentArt): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${art.width}" height="${art.height}" viewBox="0 0 ${art.width} ${art.height}" shape-rendering="${art.rendering ?? 'crispEdges'}">${art.markup}</svg>`;
}
