type SegmentedOption<T extends string = string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string = string> = {
  options: SegmentedOption<T>[];
  value: T;
  onChange?: (value: T) => void;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-wrap gap-2 rounded-md bg-muted p-1">
      {options.map((option) => (
        <button
          className={`min-h-10 min-w-[7rem] flex-1 rounded px-3 py-2 text-sm font-bold leading-5 ${
            value === option.value ? 'bg-white text-ink shadow-soft' : 'text-subtle'
          }`}
          key={option.value}
          onClick={() => {
            if (typeof onChange === 'function') onChange(option.value);
          }}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
