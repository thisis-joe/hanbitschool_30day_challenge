import type { Slot } from './types';

export interface EquipmentArt {
  width: number;
  height: number;
  markup: string;
  parts?: EquipmentArt[];
}
// Audited fixed artwork from both supplied references (identical declarations).
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
  if (slot === 'hat') {
    if (value === 1) {
      markup = p(
        'M27 21H39V17H64V19H78V23H86V31H91V38H102V41H106V45H97V48H76V50H28V47H14V41H18V29H23V25H27Z',
        ink,
      );
      markup += p('M29 23H41V20H63V22H76V26H83V32H87V40H75V43H25V40H21V31H26V27H29Z', '#e2c576');
      markup += p('M42 21H61V23H72V27H77V35H71V39H31V35H29V28H35V25H42Z', '#ead18d');
      markup += p('M22 40H43V41H72V39H88V41H100V43H95V46H73V48H29V45H18V43H22Z', '#bf9f5c');
      markup += p('M30 44H74V42H91V43H94V44H76V46H32V45H30Z', '#f0d68d');
      markup +=
        r(53, 16, 8, 3, ink) +
        r(55, 17, 4, 2, '#c4a566') +
        r(44, 24, 17, 1, '#fbebba') +
        r(39, 26, 4, 1, '#fbebba');
      markup +=
        p('M61 22H63V26H65V36H63V28H61Z', '#c4ab70') +
        r(29, 39, 35, 1, '#f3dfa3') +
        r(76, 34, 5, 4, '#f0dfae') +
        r(77, 35, 3, 2, '#af9460');
    }
    if (value === 2) {
      markup = p(
        'M30 19H72V22H81V26H86V35H90V40H100V43H104V47H97V51H80V53H30V51H17V48H8V43H14V40H21V34H25V24H30Z',
        ink,
      );
      markup += p('M32 22H71V25H79V29H82V35H84V41H25V34H28V26H32Z', '#9cb28b');
      markup += p('M33 23H66V26H73V31H75V35H31V31H30V27H33Z', '#afc49b');
      markup += p('M25 35H82V39H86V43H22V40H25Z', '#678268');
      markup += p('M22 41H37V43H78V41H92V44H99V46H94V49H79V51H31V49H19V46H13V44H22Z', '#8fa982');
      markup += p('M23 43H35V46H78V44H91V45H94V47H80V49H33V47H24Z', '#b5c79e');
      markup +=
        r(37, 24, 18, 1, '#d6dfbd') +
        r(56, 25, 9, 1, '#d6dfbd') +
        r(32, 37, 19, 1, '#8c9d74') +
        r(70, 36, 5, 4, '#dfd6a7') +
        r(72, 37, 1, 2, '#706e4e');
      markup += r(31, 48, 14, 1, '#6e896f') + r(46, 49, 31, 1, '#6e896f');
    }
    if (value === 3) {
      markup = p(
        'M24 19H72V17H84V19H95V23H101V31H96V35H90V42H86V47H76V49H34V51H23V47H20V40H16V35H11V25H17V22H24Z',
        ink,
      );
      markup += p(
        'M25 22H72V20H83V22H92V26H97V30H92V33H82V36H30V38H22V34H16V27H20V25H25Z',
        '#e8e5d5',
      );
      markup += p('M29 23H68V22H83V24H90V27H93V30H83V32H33V34H24V31H21V27H29Z', '#fff8df');
      markup += p('M24 37H34V35H83V34H92V41H86V45H76V47H35V49H25V45Z', '#729aaf');
      markup += p('M27 38H37V37H81V36H88V39H84V41H75V43H37V45H28Z', '#9ec0ce');
      markup += p('M22 42H25V45H23V53H18V57H13V54H16V47H19V42Z', ink);
      markup += p('M21 44H23V46H21V52H18V54H16V52H18V46H21Z', '#789eb3');
      markup +=
        r(53, 37, 3, 8, '#f7edd0') +
        r(50, 40, 9, 2, '#f7edd0') +
        r(52, 43, 5, 2, '#f7edd0') +
        r(29, 46, 5, 1, '#4e788f') +
        r(35, 47, 24, 1, '#4e788f');
    }
    if (value === 4) {
      markup = p(
        'M24 23H38V19H51V16H62V15H75V18H87V22H98V29H102V36H98V40H89V44H86V49H71V51H34V49H25V45H15V41H10V34H14V29H18V26H24Z',
        ink,
      );
      markup += p(
        'M25 26H39V22H53V19H63V18H74V21H86V25H95V31H98V35H94V38H85V42H70V44H35V43H26V40H18V38H14V34H18V31H22V28H25Z',
        '#b88561',
      );
      markup += p(
        'M36 25H46V22H60V20H73V23H82V26H88V30H92V33H79V35H42V38H26V35H23V31H30V28H36Z',
        '#cd9f76',
      );
      markup += p('M27 41H36V44H72V42H86V45H83V47H70V49H35V47H27Z', '#806042');
      markup += p('M38 45H69V44H80V46H70V47H39Z', '#b8875e');
      markup +=
        r(66, 13, 6, 4, ink) +
        r(67, 14, 3, 2, '#94704d') +
        r(47, 24, 13, 1, '#e8c09b') +
        r(39, 27, 7, 1, '#e8c09b') +
        r(80, 37, 6, 3, '#e3c092') +
        r(82, 37, 2, 2, '#916849');
    }
    if (value === 5) {
      markup = p(
        'M25 25H30V29H38V24H43V21H47V28H51V18H54V13H59V18H62V28H67V21H72V27H78V23H86V28H84V43H82V48H74V50H39V48H30V43H28V33H25Z',
        ink,
      );
      markup += p(
        'M28 28H31V32H39V28H44V25H46V32H53V20H56V17H57V20H59V32H68V25H70V31H79V28H83V30H81V42H78V46H74V47H39V45H33V42H31V33H28Z',
        '#c8ae66',
      );
      markup += p('M34 34H45V36H67V34H79V41H75V44H42V42H36Z', '#a99abe');
      markup += p('M37 36H45V38H68V36H77V40H73V42H44V40H38Z', '#c2b6d1');
      markup += p('M34 43H40V45H75V43H79V46H75V48H40V46H34Z', '#e5ca7b');
      markup += p('M52 35H57V33H60V35H63V40H60V43H55V41H52Z', ink);
      markup += p('M54 36H57V35H59V36H61V39H59V41H56V39H54Z', '#7e9a95');
      markup +=
        r(56, 35, 3, 2, '#cbe0cc') +
        r(54, 18, 3, 3, '#faeac0') +
        r(43, 26, 2, 3, '#faeac0') +
        r(68, 27, 2, 3, '#faeac0') +
        r(39, 45, 12, 1, '#fbdf90');
    }
    return { width: 112, height: 64, markup };
  }
  if (slot === 'hand') {
    if (value === 1) {
      markup = p(
        'M12 24H20V26H22V30H20V33H23V36H26V42H25V48H22V51H11V50H7V46H6V40H8V35H12V32H10V28H12Z',
        ink,
      );
      markup += p('M14 26H18V28H20V30H18V32H14V30H12V28H14Z', '#cfb486');
      markup += p('M13 33H19V35H22V38H24V43H23V47H20V49H12V48H9V44H8V40H10V36H13Z', '#d9bd85');
      markup += p('M14 35H18V36H20V39H21V45H19V47H12V45H10V41H12V37H14Z', '#ead19a');
      markup +=
        r(12, 32, 9, 2, '#8a7552') + r(15, 31, 2, 3, '#f4dfad') + r(19, 34, 2, 6, '#8a7552');
      markup +=
        p('M20 38H24V39H26V43H24V45H20Z', '#6c835c') +
        r(21, 39, 2, 3, '#adc184') +
        r(12, 46, 6, 1, '#bc985e');
    }
    if (value === 2) {
      markup = p('M11 23H21V25H23V30H26V34H28V49H26V52H8V51H5V47H4V34H7V30H9V26H11Z', ink);
      markup += p('M12 25H20V26H21V29H19V27H13V29H11V26H12Z', '#a2b08a');
      markup += p('M9 31H23V34H26V48H24V50H9V49H7V46H6V35H9Z', '#759275');
      markup += p('M10 31H22V33H24V36H21V39H11V38H8V35H10Z', '#aab98e');
      markup += p('M11 39H22V41H24V48H10V46H9V42H11Z', '#607e63') + r(11, 41, 11, 6, '#8fa77d');
      markup +=
        r(15, 35, 3, 4, '#e1c879') + r(15, 36, 2, 1, '#fbebad') + r(11, 42, 9, 1, '#c1cba4');
      markup +=
        r(6, 36, 1, 10, '#b7c49a') + r(24, 38, 1, 8, '#475f4b') + r(13, 49, 9, 1, '#51684e');
    }
    if (value === 3) {
      markup = p('M12 25H20V27H22V31H27V33H30V46H28V49H5V47H2V34H5V31H10V28H12Z', ink);
      markup += p('M13 27H19V28H20V31H18V29H14V31H12V29H13Z', '#b68d68');
      markup += p('M6 33H26V35H28V45H26V47H6V45H4V35H6Z', '#ad7955');
      markup += p('M6 33H26V35H24V37H22V39H19V41H13V39H10V37H7V35H6Z', '#d1a276');
      markup += p(
        'M6 35H8V37H11V39H14V41H18V40H21V38H24V36H26V35H28V37H25V39H22V41H19V43H13V42H10V40H7V38H5Z',
        '#876342',
      );
      markup += r(14, 39, 5, 5, ink) + r(15, 40, 3, 3, '#ddb862') + r(15, 40, 2, 1, '#f9d78d');
      markup += r(6, 44, 6, 1, '#d3ac7e') + r(22, 43, 4, 1, '#815a3e') + r(7, 33, 12, 1, '#ead2a8');
    }
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

/* Shared pixel garments: the inventory and worn avatar use these same pixels.
   Integer paths, transparent neck/arm openings, and an offset closure keep the
   clothes facing the same three-quarter direction as the character artwork. */
const GEAR_CLOTHES_ART = (() => {
  const ink = '#504539',
    cream = '#fff3d5';
  const art = (
    width: number,
    height: number,
    markup: string,
    extra: Pick<EquipmentArt, 'parts'> = {},
  ): EquipmentArt => ({ width, height, markup, ...extra });
  const top = [
    // 소풍조끼 — open canvas vest, broad V and asymmetric patch pockets.
    art(
      44,
      44,
      `
   <path fill="${ink}" d="M9 4h5V2h7v3h2v4h2v4h3V7h2V2h6v3h3v8h-2v8h-1v17h2v4H7v-4h2V21H7V9h2Z"/>
   <path fill="#dabd69" d="M11 6h5V4h3v3h2v4h2v4h4v24H10V22h2V12h-1Z"/>
   <path fill="#efd58a" d="M32 4h2v3h3v5h-2v10h-1v17h-5V15h1V9h2Z"/>
   <path fill="#ac8b49" d="M11 22h12v12H11Z M30 25h4v10h-4Z M10 37h17v2H10Z"/>
   <path fill="#efdba2" d="M12 22h9v3h-9Z M13 26h8v6h-8Z M30 25h4v3h-4Z"/>
   <path fill="${ink}" d="M26 17h2v22h-2Z M24 23h2v2h-2Z M24 30h2v2h-2Z"/>
   <path fill="${cream}" d="M12 7h2v11h-2Z M13 34h9v1h-9Z M31 8h2v5h-2Z"/>`,
    ),
    // 풀잎조끼 — upright collar, boxy shoulders, large utility flap pockets.
    art(
      44,
      44,
      `
   <path fill="${ink}" d="M12 0h10v5h7V0h7v5h4v12h-3v23H7V17H4V7h8Z"/>
   <path fill="#87a676" d="M14 2h6v5h3v3h7V7h1V2h3v5h4v8h-3v23H9V15H6V9h8Z"/>
   <path fill="#b4c99b" d="M14 2h6v3h-6Z M31 2h3v3h-3Z M10 12h14v3H10Z M31 12h4v3h-4Z"/>
   <path fill="#5e7753" d="M10 21h13v13H10Z M30 21h5v13h-5Z M8 35h27v3H8Z"/>
   <path fill="#a6bb89" d="M11 21h11v5H11Z M30 21h5v5h-5Z"/>
   <path fill="${ink}" d="M13 24h7v2h-7Z M31 24h3v2h-3Z M25 10h2v28h-2Z"/>
   <path fill="#e9dfb6" d="M25 17h2v3h-2Z M25 28h2v3h-2Z M14 29h5v2h-5Z M31 29h3v2h-3Z"/>`,
    ),
    // 구름조끼 — padded silhouette, short standing collar and horizontal quilting.
    art(
      44,
      44,
      `
   <path fill="${ink}" d="M12 1h10v6h7V1h7v4h4v7h2v21h-2v8H5v-8H3V12h3V5h6Z"/>
   <path fill="#94b9cc" d="M14 3h6v6h3v3h7V9h1V3h3v4h4v7h2v17h-2v8H7v-8H5V14h3V7h6Z"/>
   <path fill="#c3dce0" d="M14 3h6v4h-6Z M31 3h3v4h-3Z M9 13h16v4H9Z M30 13h7v4h-7Z M8 23h17v3H8Z M30 23h8v3h-8Z"/>
   <path fill="#6d94a9" d="M5 18h20v2H5Z M29 18h11v2H29Z M5 28h20v2H5Z M29 28h11v2H29Z M7 36h18v3H7Z M29 36h9v3h-9Z"/>
   <path fill="${ink}" d="M26 12h3v27h-3Z M11 29h2v6h-2Z M33 29h2v6h-2Z"/>
   <path fill="${cream}" d="M27 13h1v22h-1Z M26 21h3v3h-3Z M10 9h3v2h-3Z"/>`,
    ),
    // 우체부조끼 — diagonal overlap, paired brass buttons and pointed hem.
    art(
      44,
      44,
      `
   <path fill="${ink}" d="M10 4h5V1h8v4h2v5h3V6h2V1h6v4h3v10h-3v22h-2v5h-6v-3h-7v3H7v-5h2V19H6V9h4Z"/>
   <path fill="#bd8c64" d="M12 6h5V3h4v4h2v5h4v24h-7v4H9v-3h2V18H8v-7h4Z"/>
   <path fill="#d6ab83" d="M32 3h2v4h3v6h-3v23h-2v4h-3V13h1V8h2Z"/>
   <path fill="#8e674b" d="M17 7h4v5h3v5h4v5h-3v-3h-5v-5h-3Z M11 26h11v3H11Z M12 29h9v5h-9Z M31 25h3v9h-3Z"/>
   <path fill="${ink}" d="M15 25h7v2h-7Z M29 16h2v19h-2Z"/>
   <path fill="#f6d280" d="M22 20h3v3h-3Z M28 20h3v3h-3Z M22 29h3v3h-3Z M28 29h3v3h-3Z"/>
   <path fill="#f2cfac" d="M13 8h2v9h-2Z M11 35h8v2h-8Z M33 9h2v5h-2Z"/>`,
    ),
    // 별밤조끼 — slim knitted pullover, deep V and broad ribbed waistband.
    art(
      44,
      44,
      `
   <path fill="${ink}" d="M11 3h7V1h4v6h2v4h2v5h2v-5h2V1h6v4h3v10h-3v24h-2v3H10v-3H8V18H6V8h5Z"/>
   <path fill="#a99fbc" d="M13 5h5v4h3v5h3v5h6v-5h2V3h2v4h3v6h-3v25H10V19H8V10h5Z"/>
   <path fill="#7f7296" d="M17 4h3v5h2v5h3v5h4v-5h3V4h2v12h-2v6H23v-5h-3v-5h-3Z M10 34h24v6H10Z"/>
   <path fill="#d4c8dc" d="M13 22h3v-3h3v3h3v3h-3v3h-3v-3h-3Z M25 27h3v-3h3v3h3v3h-3v3h-3v-3h-3Z"/>
   <path fill="#b6aac8" d="M11 35h2v5h-2Z M16 35h2v5h-2Z M21 35h2v5h-2Z M26 35h2v5h-2Z M31 35h2v5h-2Z"/>
   <path fill="${cream}" d="M12 8h2v8h-2Z M16 21h2v2h-2Z M28 26h2v2h-2Z"/>`,
    ),
  ];
  const bottom = [
    // 모래반바지 — roomy cargo shape and two stepped side pockets.
    art(
      40,
      28,
      `
   <path fill="${ink}" d="M5 1h29v4h2v8h3v12H23v-5h-2v-5h-2v7h-2v5H2V13h2V5h1Z"/>
   <path fill="#c9b281" d="M7 3h25v4h2v8h3v8H25v-5h-2v-7h-5v9h-3v5H4V15h2V7h1Z"/>
   <path fill="#ead7a7" d="M7 3h25v3H7Z M3 13h10v4H3Z M29 13h8v4h-8Z"/>
   <path fill="#a48c61" d="M3 17h10v6H3Z M29 17h8v5h-8Z M20 5h3v8h-3Z"/>
   <path fill="${ink}" d="M7 6h2v3H7Z M28 6h2v3h-2Z M6 16h3v2H6Z M31 16h3v2h-3Z"/>
   <path fill="${cream}" d="M5 23h9v2H5Z M26 21h9v2h-9Z"/>`,
    ),
    // 솔잎반바지 — short, relaxed shorts with thick turned-up cuffs.
    art(
      40,
      28,
      `
   <path fill="${ink}" d="M6 1h28v5h2v13h2v6H22v-5h-2v-5h-2v6h-2v6H2v-7h2V6h2Z"/>
   <path fill="#92ad81" d="M8 3h24v5h2v12H23v-5h-2v-4h-5v9H4V8h4Z"/>
   <path fill="#bfd0a6" d="M4 20h12v5H4Z M23 19h13v4H23Z M8 3h24v3H8Z"/>
   <path fill="#647f58" d="M5 18h10v2H5Z M24 17h10v2H24Z M19 6h3v8h-3Z"/>
   <path fill="${ink}" d="M10 7h2v7h-2Z M28 7h2v6h-2Z"/>
   <path fill="${cream}" d="M6 21h7v2H6Z M26 20h7v2h-7Z M21 4h2v3h-2Z"/>`,
    ),
    // 물빛반바지 — light running shorts, ivory binding and cut-out side hems.
    art(
      40,
      28,
      `
   <path fill="${ink}" d="M6 2h28v4h2v9h2v6h-4v3H23v-4h-2v-7h-3v8h-3v4H5v-3H2v-7h2V6h2Z"/>
   <path fill="#82adc4" d="M8 4h24v4h2v9h2v2h-4v3h-7v-4h-2v-7h-7v8h-3v4H7v-3H4v-3h2V8h2Z"/>
   <path fill="#cfdfdf" d="M6 8h3v13H6Z M31 8h3v11h-3Z M8 4h24v3H8Z M8 21h5v2H8Z M26 20h6v2h-6Z"/>
   <path fill="#527d97" d="M12 8h4v2h-4Z M24 8h5v2h-5Z M19 8h3v5h-3Z"/>
   <path fill="${cream}" d="M19 6h2v3h-2Z M22 7h2v4h-2Z"/>`,
    ),
    // 단풍반바지 — longer tailored hem, front pleats and a leather belt.
    art(
      40,
      28,
      `
   <path fill="${ink}" d="M6 0h28v4h2v23H22v-8h-2v-5h-2v13H3V4h3Z"/>
   <path fill="#b78264" d="M8 2h24v4h2v19H24v-8h-2v-5h-6v13H5V6h3Z"/>
   <path fill="#d6aa87" d="M8 5h8v3h-2v13h-3V8H8Z M25 5h7v3h-2v13h-3V8h-2Z"/>
   <path fill="#895c46" d="M7 2h26v3H7Z M12 8h2v14h-2Z M28 8h2v14h-2Z M5 23h11v2H5Z M24 23h10v2H24Z"/>
   <path fill="#eace94" d="M21 1h5v5h-5Z"/>
   <path fill="${ink}" d="M23 2h2v2h-2Z M19 6h2v6h-2Z"/>`,
    ),
    // 새벽반바지 — soft gathered waist and gently stepped rolled hems.
    art(
      40,
      28,
      `
   <path fill="${ink}" d="M6 1h28v5h2v13h-2v4h-3v2h-8v-4h-2v-7h-3v6h-2v5h-4v2H6v-3H3V7h3Z"/>
   <path fill="#a89dbc" d="M8 3h24v5h2v10h-2v4h-3v1h-4v-4h-2v-7h-7v6h-2v5h-4v2H8v-3H5V9h3Z"/>
   <path fill="#cec2d8" d="M8 3h24v4H8Z M6 20h7v3h-3v2H8v-2H6Z M25 19h7v3h-3v1h-4Z"/>
   <path fill="#7d7296" d="M10 7h2v7h-2Z M28 7h2v6h-2Z M19 7h3v6h-3Z"/>
   <path fill="${cream}" d="M11 14h2v2h-2Z M9 16h6v2H9Z M11 18h2v2h-2Z M22 4h2v3h-2Z"/>`,
    ),
  ];
  const near = [
    // 햇살운동화 — low canvas shoe, rounded toe, toe cap and thick rubber sole.
    art(
      22,
      30,
      `
   <path fill="${ink}" d="M4 13h9v3h2v5h4v2h2v6H1V18h3Z"/>
   <path fill="#dfbf62" d="M5 15h6v3h2v4h5v2h1v2H3v-7h2Z"/>
   <path fill="#b38f48" d="M3 19h3v5H3Z M8 17h5v5H8Z"/>
   <path fill="${cream}" d="M14 22h4v2h2v3h-7v-2h1Z M2 26h18v2H2Z M7 18h5v2H7Z M8 21h5v2H8Z"/>`,
    ),
    // 이끼부츠 — ankle cuff, stout lace-up upper and projecting heel.
    art(
      22,
      30,
      `
   <path fill="${ink}" d="M3 5h11v4h1v12h3v2h3v6H0v-5h2V9h1Z"/>
   <path fill="#80996c" d="M5 7h7v4h1v11h4v2h2v2H3V11h2Z"/>
   <path fill="#b4c394" d="M4 7h10v4H4Z M14 22h3v2h-3Z"/>
   <path fill="#56724d" d="M4 12h3v12H4Z M3 26h16v2H3Z"/>
   <path fill="${cream}" d="M8 13h4v2H8Z M8 17h4v2H8Z M8 21h4v2H8Z"/>
   <path fill="${ink}" d="M1 27h4v2H1Z M8 27h3v2H8Z M15 27h4v2h-4Z"/>`,
    ),
    // 파도운동화 — athletic side panels, a wave stripe and tapered toe.
    art(
      22,
      30,
      `
   <path fill="${ink}" d="M3 11h9v5h3v3h3v2h3v7H1V17h2Z"/>
   <path fill="#7ba6be" d="M5 13h5v5h3v3h4v2h2v2H3v-7h2Z"/>
   <path fill="#4c7f9b" d="M3 18h4v7H3Z M12 20h5v3h-5Z"/>
   <path fill="${cream}" d="M5 20h3v-2h3v3H8v2H5Z M2 25h17v2H2Z M7 15h4v2H7Z M9 18h4v2H9Z"/>
   <path fill="#bed8db" d="M15 22h4v3h-4Z"/>`,
    ),
    // 골목부츠 — tall work boot, brass eyelets and a sturdy lug sole.
    art(
      22,
      30,
      `
   <path fill="${ink}" d="M3 0h12v5h-1v15h3v2h4v7H0v-6h2V5h1Z"/>
   <path fill="#a87955" d="M5 2h8v3h-1v17h4v2h3v2H3v-3h1V5h1Z"/>
   <path fill="#d2a879" d="M4 2h10v3H4Z M13 22h4v3h-4Z"/>
   <path fill="#78563e" d="M4 5h3v18H4Z M3 25h16v2H3Z"/>
   <path fill="#edca76" d="M8 7h2v2H8Z M11 7h2v2h-2Z M8 12h2v2H8Z M11 12h2v2h-2Z M8 17h2v2H8Z M11 17h2v2h-2Z"/>
   <path fill="${cream}" d="M9 9h3v2H9Z M9 14h3v2H9Z M9 19h3v2H9Z"/>
   <path fill="${ink}" d="M1 27h4v2H1Z M8 27h4v2H8Z M16 27h4v2h-4Z"/>`,
    ),
    // 달빛운동화 — low slip-on, elastic gusset and a pale silver toe band.
    art(
      22,
      30,
      `
   <path fill="${ink}" d="M3 17h8v-3h4v5h3v2h3v7H1V20h2Z"/>
   <path fill="#a497b8" d="M5 19h7v-3h1v5h4v2h2v2H3v-3h2Z"/>
   <path fill="#776789" d="M4 21h4v4H4Z M9 18h2v5H9Z"/>
   <path fill="#ddd7e1" d="M14 21h4v2h2v3h-7v-3h1Z M2 25h18v2H2Z"/>
   <path fill="${cream}" d="M14 22h4v2h-4Z M4 19h4v2H4Z"/>`,
    ),
  ];
  // The far shoe deliberately has a smaller pixel silhouette rather than a
  // CSS transform of the near shoe. Both shapes remain reusable in worn poses.
  const far = [
    art(
      19,
      28,
      `<path fill="${ink}" d="M3 12h8v3h2v5h3v2h2v5H0V18h3Z"/><path fill="#caae59" d="M4 14h5v3h2v4h4v2h1v2H2v-6h2Z"/><path fill="#a08649" d="M2 20h3v4H2Z"/><path fill="${cream}" d="M12 21h3v2h2v3h-6v-2h1Z M1 24h16v2H1Z M6 17h4v2H6Z M7 20h4v2H7Z"/>`,
    ),
    art(
      19,
      28,
      `<path fill="${ink}" d="M2 5h10v4h1v11h2v2h3v5H0v-4h1V9h1Z"/><path fill="#758c61" d="M4 7h6v4h1v10h3v2h2v2H2V11h2Z"/><path fill="#a6b686" d="M3 7h10v4H3Z"/><path fill="#506746" d="M2 11h3v12H2Z"/><path fill="${cream}" d="M7 13h4v2H7Z M7 17h4v2H7Z M7 21h4v2H7Z"/><path fill="${ink}" d="M0 25h4v2H0Z M7 25h3v2H7Z M13 25h4v2h-4Z"/>`,
    ),
    art(
      19,
      28,
      `<path fill="${ink}" d="M2 10h8v5h3v3h2v2h3v7H0V17h2Z"/><path fill="#6e97ae" d="M4 12h4v5h3v3h3v2h2v2H2v-6h2Z"/><path fill="#486f87" d="M2 18h4v6H2Z"/><path fill="${cream}" d="M4 20h3v-2h3v3H7v2H4Z M1 24h16v2H1Z M6 14h4v2H6Z M8 17h4v2H8Z"/><path fill="#b5ced2" d="M13 21h3v3h-3Z"/>`,
    ),
    art(
      19,
      28,
      `<path fill="${ink}" d="M2 0h11v5h-1v14h3v2h3v6H0v-5h1V5h1Z"/><path fill="#966c4d" d="M4 2h7v3h-1v16h4v2h2v2H2v-3h1V5h1Z"/><path fill="#c19a6d" d="M3 2h10v3H3Z M11 21h3v3h-3Z"/><path fill="#694b38" d="M3 5h3v17H3Z"/><path fill="#e4be6c" d="M7 7h2v2H7Z M10 7h2v2h-2Z M7 12h2v2H7Z M10 12h2v2h-2Z M7 17h2v2H7Z M10 17h2v2h-2Z"/><path fill="${cream}" d="M8 9h3v2H8Z M8 14h3v2H8Z M8 19h3v2H8Z"/><path fill="${ink}" d="M0 25h4v2H0Z M7 25h4v2H7Z M14 25h4v2h-4Z"/>`,
    ),
    art(
      19,
      28,
      `<path fill="${ink}" d="M2 16h7v-3h4v5h2v2h3v7H0V20h2Z"/><path fill="#9284a6" d="M4 18h6v-3h1v5h3v2h2v2H2v-3h2Z"/><path fill="#695b7d" d="M3 20h4v4H3Z M8 17h2v5H8Z"/><path fill="#d0cad8" d="M12 20h3v2h2v3h-6v-3h1Z M1 24h16v2H1Z"/><path fill="${cream}" d="M12 21h3v2h-3Z M3 18h4v2H3Z"/>`,
    ),
  ];
  const shoes = near.map((n, i) =>
    art(42, 30, `${n.markup}<g transform="translate(23 2)">${far[i].markup}</g>`, {
      parts: [n, far[i]],
    }),
  );
  return { top, bottom, shoes };
})();

export function parseItemId(itemId: string): { slot: Slot; value: number } | null {
  const match = /^(face|hat|top|bottom|shoes|hand)-([1-5])$/.exec(itemId);
  return match ? { slot: match[1] as Slot, value: Number(match[2]) } : null;
}

export function equipmentArt(itemId: string): EquipmentArt | null {
  const item = parseItemId(itemId);
  if (!item) return null;
  const { slot, value } = item;
  if (slot === 'top' || slot === 'bottom' || slot === 'shoes') {
    return GEAR_CLOTHES_ART[slot][value - 1];
  }
  return headHandDesign(slot, value);
}

export function equipmentSvg(art: EquipmentArt): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${art.width}" height="${art.height}" viewBox="0 0 ${art.width} ${art.height}" shape-rendering="crispEdges">${art.markup}</svg>`;
}
