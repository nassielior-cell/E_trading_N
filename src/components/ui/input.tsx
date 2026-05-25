import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

type FieldProps = {
  label: string;
};

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span>
      {label}
      {required ? <span className="ms-1 text-danger" aria-hidden="true">*</span> : null}
    </span>
  );
}

export function TextInput({ label, className = '', ...props }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      <FieldLabel label={label} required={props.required} />
      <input
        className={`min-h-10 rounded-md border border-border bg-white px-3 py-2 text-sm font-normal text-ink outline-none transition placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-blue-100 ${className}`}
        {...props}
      />
    </label>
  );
}

export function Textarea({ label, className = '', ...props }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      <FieldLabel label={label} required={props.required} />
      <textarea
        className={`min-h-24 rounded-md border border-border bg-white px-3 py-2 text-sm font-normal text-ink outline-none transition placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-blue-100 ${className}`}
        {...props}
      />
    </label>
  );
}
