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
        <div className="school-symbol" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <h2>
          우리 반에서
          <br />
          시작하는 배움
        </h2>
        <p>
          나의 이름으로 만나고,
          <br />
          나만의 별명으로 함께해요.
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
