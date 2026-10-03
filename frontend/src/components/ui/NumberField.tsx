import { useEffect, useState, type InputHTMLAttributes } from 'react';

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
  /** Current value; null means the field is empty. */
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Allow decimals (purity %). Whole numbers otherwise. */
  decimals?: boolean;
  /** Unit shown inside the field, e.g. "tonnes" or "$". */
  suffix?: string;
  prefix?: string;
}

const clean = (text: string, decimals: boolean) => {
  let t = text.replace(decimals ? /[^\d.]/g : /\D/g, '');
  if (decimals) { const [a, ...b] = t.split('.'); t = b.length ? `${a}.${b.join('')}` : a; }
  // Drop leading zeros ("025" → "25") but keep "0" and "0.5".
  return t.replace(/^0+(?=\d)/, '');
};

/**
 * Number input that can be cleared while typing. Native type="number" bound to Number(value)
 * turned an empty field into 0, so every next digit started with "0".
 */
export function NumberField({ value, onChange, min, max, decimals = false, suffix, prefix, className = '', onBlur, ...rest }: Props) {
  const [text, setText] = useState(value == null ? '' : String(value));

  // Follow outside changes (e.g. a preset), without overwriting what the user is typing.
  useEffect(() => {
    // Callers often store a cleared field as 0, so an empty field already matches 0.
    if (text === '' && (value == null || value === 0)) return;
    if (Number(text) !== value) setText(value == null ? '' : String(value));
  }, [value]);

  return (
    <span className={`number-field ${className}`}>
      {prefix && <span className="nf-affix">{prefix}</span>}
      <input
        {...rest}
        type="text"
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={text}
        onChange={e => {
          const t = clean(e.target.value, decimals);
          setText(t);
          onChange(t === '' || t === '.' ? null : Number(t));
        }}
        onBlur={e => {
          if (text !== '') {
            let n = Number(text);
            if (min != null && n < min) n = min;
            if (max != null && n > max) n = max;
            if (n !== Number(text)) { setText(String(n)); onChange(n); }
          }
          onBlur?.(e);
        }}
      />
      {suffix && <span className="nf-affix">{suffix}</span>}
    </span>
  );
}
