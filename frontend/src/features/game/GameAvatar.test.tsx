import { act, render, screen } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';

class ControlledImage extends EventTarget {
  static images: ControlledImage[] = [];
  src = '';
  complete = false;
  naturalWidth = 0;
  constructor() {
    super();
    ControlledImage.images.push(this);
  }
  load() {
    this.complete = true;
    this.naturalWidth = 128;
    this.dispatchEvent(new Event('load'));
  }
  fail() {
    this.complete = true;
    this.dispatchEvent(new Event('error'));
  }
}
let content: WeakMap<HTMLCanvasElement, string[]>;
let painted: WeakMap<HTMLCanvasElement, string[]>;
let calls: WeakMap<HTMLCanvasElement, { method: string; args: unknown[] }[]>;
beforeEach(() => {
  vi.resetModules();
  ControlledImage.images = [];
  content = new WeakMap();
  painted = new WeakMap();
  calls = new WeakMap();
  vi.stubGlobal('Image', ControlledImage);
  // jsdom has no pixel backend. Keep actual asynchronous rendering and canvas
  // composition; capture the sources that reach the visible canvas boundary.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
    this: HTMLCanvasElement,
  ) {
    return {
      canvas: this,
      imageSmoothingEnabled: true,
        clearRect(this: {canvas: HTMLCanvasElement}, ...args: number[]) {
        calls.set(this.canvas, [...(calls.get(this.canvas) ?? []), { method: 'clearRect', args }]);
        if (args[0] === 0 && args[1] === 0 && args[2] === 128 && args[3] === 176)
          content.set(this.canvas, []);
      },
        drawImage(this: {canvas: HTMLCanvasElement}, source: ControlledImage | HTMLCanvasElement, ...args: number[]) {
        calls.set(this.canvas, [
          ...(calls.get(this.canvas) ?? []),
          { method: 'drawImage', args: [source, ...args] },
        ]);
        const sources =
          source instanceof ControlledImage ? [source.src] : (content.get(source) ?? []);
        content.set(this.canvas, [...(content.get(this.canvas) ?? []), ...sources]);
        painted.set(this.canvas, content.get(this.canvas)!);
      },
      save() {},
      restore() {},
        setTransform(this: {canvas: HTMLCanvasElement}, ...args: number[]) {
        calls.set(this.canvas, [
          ...(calls.get(this.canvas) ?? []),
          { method: 'setTransform', args },
        ]);
      },
      getImageData() {
        return { data: new Uint8ClampedArray(13 * 17 * 4) };
      },
      putImageData() {},
    } as unknown as CanvasRenderingContext2D;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('labels a missing character as unselected and uses haru without selecting it', async () => {
  const { GameAvatar } = await import('./GameAvatar');
  render(<GameAvatar characterId={null} />);
  expect(screen.getByRole('img', { name: /캐릭터 미선택/ })).toBeInTheDocument();
  expect(ControlledImage.images[0].src).toBe('/game/characters/haru.png');
});

it('failedOrAbortedDrawDoesNotPaintANewerCharacter', async () => {
  const { GameAvatar } = await import('./GameAvatar');
  const view = render(<GameAvatar characterId="haru" />);
  const canvas = screen.getByRole('img', { name: '하루' }) as HTMLCanvasElement;
  const oldImage = ControlledImage.images[0];
  view.rerender(<GameAvatar characterId="bora" />);
  await act(async () =>
    ControlledImage.images.find((image) => image.src.endsWith('/bora.png'))!.load(),
  );
  expect(painted.get(canvas)).toEqual(['/game/characters/bora.png']);
  await act(async () => oldImage.load());
  expect(painted.get(canvas)).toEqual(['/game/characters/bora.png']);
  view.rerender(<GameAvatar characterId="sion" />);
  await act(async () =>
    ControlledImage.images.find((image) => image.src.endsWith('/sion.png'))!.fail(),
  );
  expect(painted.get(canvas)).toEqual(['/game/characters/bora.png']);
  expect(canvas).toHaveAccessibleName('시온');
});

it('unmount cancels a pending draw without painting or settling UI state', async () => {
  const { GameAvatar } = await import('./GameAvatar');
  const view = render(<GameAvatar characterId="naru" />);
  const canvas = screen.getByRole('img', { name: '나루' }) as HTMLCanvasElement;
  const image = ControlledImage.images[0];
  view.unmount();
  await act(async () => image.load());
  expect(painted.get(canvas)).toBeUndefined();
});

it('direct rendering uses generation identity even without an AbortSignal', async () => {
  const { renderAvatar } = await import('./avatarRenderer');
  const { emptyEquipment } = await import('./types');
  const canvas = document.createElement('canvas');
  const older = renderAvatar(canvas, 'haru', emptyEquipment());
  const newer = renderAvatar(canvas, 'bora', emptyEquipment());
  ControlledImage.images[1].load();
  await newer;
  ControlledImage.images[0].load();
  await older;
  expect(painted.get(canvas)).toEqual(['/game/characters/bora.png']);
});

it('abort settles promptly while a shared image may finish loading later', async () => {
  const { renderAvatar } = await import('./avatarRenderer');
  const { emptyEquipment } = await import('./types');
  const canvas = document.createElement('canvas'),
    controller = new AbortController();
  const pending = renderAvatar(canvas, 'haru', emptyEquipment(), controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  await rejected;
  ControlledImage.images[0].load();
  await Promise.resolve();
  expect(painted.get(canvas)).toBeUndefined();
});

it('failed image loads reject and a subsequent draw can retry', async () => {
  const { renderAvatar } = await import('./avatarRenderer');
  const { emptyEquipment } = await import('./types');
  const canvas = document.createElement('canvas');
  const pending = renderAvatar(canvas, 'haru', emptyEquipment());
  const rejected = expect(pending).rejects.toThrow('Unable to load game image');
  ControlledImage.images[0].fail();
  await rejected;
  const retry = renderAvatar(canvas, 'haru', emptyEquipment());
  ControlledImage.images[1].load();
  await retry;
  expect(painted.get(canvas)).toEqual(['/game/characters/haru.png']);
});

it('already-complete broken images reject without waiting for an event that was missed', async () => {
  const { renderAvatar } = await import('./avatarRenderer');
  const { emptyEquipment } = await import('./types');
  class BrokenImage extends ControlledImage {
    complete = true;
  }
  vi.stubGlobal('Image', BrokenImage);
  const canvas = document.createElement('canvas');
  await expect(renderAvatar(canvas, 'haru', emptyEquipment())).rejects.toThrow(
    'Unable to load game image',
  );
  expect(painted.get(canvas)).toBeUndefined();
});

it('composes original attachment coordinates, hair cut, two shoes, grip and brim order', async () => {
  const { renderAvatar } = await import('./avatarRenderer');
  const canvas = document.createElement('canvas');
  const gear = {
    face: 'face-5',
    hat: 'hat-2',
    top: 'top-1',
    bottom: 'bottom-1',
    shoes: 'shoes-4',
    hand: 'hand-4',
  };
  const pending = renderAvatar(canvas, 'haru', gear);
  // Changes to the caller's object cannot change a frame already being loaded.
  gear.top = 'top-5';
  ControlledImage.images.forEach((image) => image.load());
  await pending;
  const frame = calls.get(canvas)!.find((call) => call.method === 'drawImage')!
    .args[0] as HTMLCanvasElement;
  const drawing = calls.get(frame)!;
  expect(drawing.find((call) => call.method === 'clearRect' && call.args[0] === 14)?.args).toEqual([
    14, 0, 104, 48,
  ]);
  const draws = drawing.filter((call) => call.method === 'drawImage');
  expect(draws.slice(1, 6).map((call) => call.args.slice(1))).toEqual([
    [47, 133, 34, 14],
    [45, 103, 37, 32],
    [44, 141, 22, 30],
    [63, 143, 19, 28],
    [28, 104, 32, 58],
  ]);
  expect(draws[6].args.slice(1)).toEqual([39, 123]); // skin restored above the hand item
  expect(draws[7].args.slice(1)).toEqual([0, 0]); // face affine drawing
  expect(draws[8].args.slice(1)).toEqual([1, -20, 129, 116]); // bucket brim is last
  expect(decodeURIComponent((draws[2].args[0] as ControlledImage).src)).toContain('#dabd69');
  expect(decodeURIComponent((draws[4].args[0] as ControlledImage).src)).toContain('#c19a6d');
  const transform = drawing.find((call) => call.method === 'setTransform')!.args as number[];
  expect(transform[0]).toBeCloseTo(0.9285714285714286);
  expect(transform[1]).toBeCloseTo(0.03826530612244898);
});

it('equipment icons keep original bag crop and reject untrusted or mismatched items', async () => {
  const { EquipmentIcon } = await import('./EquipmentIcon');
  const view = render(<EquipmentIcon itemId="hand-1" slot="hand" />);
  expect(view.container.querySelector('g')).toHaveAttribute(
    'transform',
    'translate(5.71875 -49.375) scale(2.5625)',
  );
  expect(view.container.querySelector('path')).not.toBeNull();
  view.rerender(<EquipmentIcon itemId="<img onerror=alert(1)>" />);
  expect(view.container.querySelector('g,img,script')).toBeNull();
  view.rerender(<EquipmentIcon itemId="hand-1" slot="hat" />);
  expect(view.container.querySelector('g')).toBeNull();
});
