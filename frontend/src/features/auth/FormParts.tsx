import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { errorMessage } from '../../lib/http';
export function useSubmission() {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function run(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError(undefined);
    try {
      await work();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return { pending, error, run };
}
export function FormError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="form-error">
      {message}
    </p>
  ) : null;
}
export function AuthFrame({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <div className="auth-frame">
      <aside className="intro">
        <img className="auth-mark" src="/brand/school-mark.svg" width="48" height="48" alt="" />
        <h2>
          함께 배우는
          <br />
          한빛학교
        </h2>
        <p>
          학생은 하루에 다섯 문제를 풀고,
          <br />
          선생님은 우리 반의 학습을 살펴봐요.
        </p>
      </aside>
      <section className="form-panel">
        <h1 ref={heading} tabIndex={-1}>
          {title}
        </h1>
        <p className="description">{description}</p>
        {children}
      </section>
    </div>
  );
}
