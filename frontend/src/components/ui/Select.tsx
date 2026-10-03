import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface SelectOption<V extends string | number> {
  value: V;
  label: string;
  /** Second line under the label. */
  hint?: string;
  /** Colour dot before the label, e.g. a material colour. */
  color?: string;
}

interface Props<V extends string | number> {
  id?: string;
  value: V | null;
  options: SelectOption<V>[];
  onChange: (value: V) => void;
  /** Shown when nothing is selected. */
  placeholder?: string;
  /** Text before the value inside the button, e.g. "Sort". */
  prefix?: string;
  size?: 'sm' | 'md';
  className?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  disabled?: boolean;
}

/** Accessible custom dropdown (combobox + listbox) that replaces native <select>. */
export function Select<V extends string | number>({
  id, value, options, onChange, placeholder = 'Select…', prefix, size = 'md', className = '', disabled, ...aria
}: Props<V>) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });

  const selectedIndex = options.findIndex(o => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const openList = () => { if (disabled) return; setActive(Math.max(0, selectedIndex)); setOpen(true); };
  const close = (focus = true) => { setOpen(false); if (focus) btnRef.current?.focus(); };
  const choose = (i: number) => { const o = options[i]; if (o) onChange(o.value); close(); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) close(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Open upwards when there isn't room below.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setUp(window.innerHeight - r.bottom < 280 && r.top > window.innerHeight - r.bottom);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function onKey(e: KeyboardEvent) {
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(a => Math.min(last, a + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive(a => Math.max(0, a - 1)); break;
      case 'Home': e.preventDefault(); setActive(0); break;
      case 'End': e.preventDefault(); setActive(last); break;
      case 'Enter': case ' ': e.preventDefault(); choose(active); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': close(false); break;
      default:
        if (e.key.length === 1) {
          const now = Date.now();
          typed.current = { text: (now - typed.current.at < 600 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
          const i = options.findIndex(o => o.label.toLowerCase().startsWith(typed.current.text));
          if (i >= 0) setActive(i);
        }
    }
  }

  return (
    <div ref={rootRef} className={`sel sel-${size} ${open ? 'open' : ''} ${className}`}>
      <button
        ref={btnRef}
        id={baseId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${baseId}-opt-${active}` : undefined}
        aria-label={aria['aria-label']}
        aria-invalid={aria['aria-invalid']}
        disabled={disabled}
        className="sel-btn"
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKey}
      >
        {prefix && <span className="sel-prefix">{prefix}</span>}
        {selected?.color && <span className="dot" style={{ '--c': selected.color } as CSSProperties} />}
        <span className={`sel-value ${selected ? '' : 'placeholder'}`}>{selected?.label ?? placeholder}</span>
        <ChevronDown size={15} className="sel-chev" aria-hidden="true" />
      </button>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" className={`sel-list ${up ? 'up' : ''}`} tabIndex={-1} aria-labelledby={baseId}>
          {options.map((o, i) => (
            <li
              key={String(o.value)}
              id={`${baseId}-opt-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === selectedIndex}
              className={`sel-opt ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => e.preventDefault()}
              onClick={() => choose(i)}
            >
              {o.color && <span className="dot" style={{ '--c': o.color } as CSSProperties} />}
              <span className="sel-opt-text">
                <span>{o.label}</span>
                {o.hint && <small>{o.hint}</small>}
              </span>
              {i === selectedIndex && <Check size={15} className="sel-check" aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
