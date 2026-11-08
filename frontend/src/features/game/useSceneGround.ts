import { useLayoutEffect, useRef } from 'react';

// The forest grid places the walking surface on row 94 of 128.
const ground = { forest: 94 / 128, village: 0.75, beach: 0.845 } as const;
export type SceneRegion = keyof typeof ground;

export function useSceneGround<T extends HTMLElement>(region: SceneRegion) {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const scene = ref.current;
    if (!scene) return;
    const content = scene.querySelector<HTMLElement>('.game-answer-content');
    const actor = scene.querySelector<HTMLElement>('.game-answer-traveler');
    const depth = 1 - ground[region];
    const update = () => {
      if (content && actor) {
        const occupied = content.offsetHeight + actor.offsetHeight + 28;
        // Cover can scale from either dimension. Leave reading space in both cases.
        const required = Math.ceil(
          Math.max(occupied / (1 - depth), occupied + (scene.clientWidth / 1.5) * depth),
        );
        scene.style.setProperty('--scene-required-height', `${required}px`);
      }
      const imageHeight = Math.max(scene.clientHeight, scene.clientWidth / 1.5);
      scene.style.setProperty('--scene-ground', `${imageHeight * depth}px`);
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) return;
      // Setting the required height can resize the observed scene itself.
      frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
    });
    observer.observe(scene);
    if (content) observer.observe(content);
    if (actor) observer.observe(actor);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [region]);
  return ref;
}
