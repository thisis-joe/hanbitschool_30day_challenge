import { useLayoutEffect, useRef } from 'react';

export function useSceneGround<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useLayoutEffect(() => {
    const scene = ref.current;
    if (!scene) return;
    const content = scene.querySelector<HTMLElement>('.game-answer-content');
    const actor = scene.querySelector<HTMLElement>('.game-answer-traveler');
    if (!content || !actor) return;
    const update = () => {
      const floor = parseFloat(getComputedStyle(scene).getPropertyValue('--scene-ground'));
      const height = content.offsetHeight + actor.offsetHeight + floor + 28;
      scene.style.setProperty('--scene-required-height', `${Math.ceil(height)}px`);
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
    observer.observe(content);
    observer.observe(actor);
    return () => {
      observer.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, []);
  return ref;
}
