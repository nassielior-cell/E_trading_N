import type { SelectHTMLAttributes } from 'react';

export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  color?: string;
};

type SelectProps<T extends string = string> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'onChange' | 'value'
> & {
  label: string;
  options: SelectOption<T>[];
  value: T;
  onValueChange?: (value: T) => void;
};

export function Select<T extends string>({
  label,
  options,
  value,
  onValueChange,
  className = '',
  ...props
}: SelectProps<T>) {
  return (
    <label className="grid gap-2 text-sm font-semibold text-ink">
      <span>
        {label}
        {props.required ? <span className="ms-1 text-danger" aria-hidden="true">*</span> : null}
      </span>
      <select
        className={`min-h-10 rounded-md border border-border bg-white px-3 py-2 text-sm font-normal text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-blue-100 ${className}`}
        onChange={(event) => {
          if (typeof onValueChange === 'function') onValueChange(event.target.value as T);
        }}
        value={value}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
