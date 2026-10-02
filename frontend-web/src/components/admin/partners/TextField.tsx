import { useId, type InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
}

/** Labelled text input; the hint and error are linked to it (aria-describedby), not part of its name. */
export default function TextField({ label, value, onChange, hint, error, className, ...rest }: Props) {
  const id = useId();
  const note = error || hint;
  return (
    <div className={className}>
      <label htmlFor={id} className="block font-medium text-gray-700 mb-1">{label}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
        aria-invalid={!!error || undefined}
        aria-describedby={note ? `${id}-note` : undefined}
        {...rest}
      />
      {note && (
        <span id={`${id}-note`} className={`block text-xs mt-1 ${error ? 'text-red-600' : 'text-gray-500'}`}>{note}</span>
      )}
    </div>
  );
}
