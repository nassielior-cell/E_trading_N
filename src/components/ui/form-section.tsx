import type { ReactNode } from 'react';

export function FormSection({ children, required, title }: { children: ReactNode; required?: boolean; title: string }) {
  return (
    <section className="grid gap-4 rounded-md border border-border bg-white p-4">
      <h3 className="text-sm font-bold uppercase text-subtle">
        {title}
        {required ? <span className="ms-1 text-danger" aria-hidden="true">*</span> : null}
      </h3>
      {children}
    </section>
  );
}
