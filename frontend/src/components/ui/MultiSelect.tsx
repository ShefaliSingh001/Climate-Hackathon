import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import type { SelectOption } from './Select';

interface Props<V extends string | number> {
  id?: string;
  values: V[];
  options: (SelectOption<V> & { count?: number })[];
  onChange: (values: V[]) => void;
  /** Label for "nothing picked", which means everything, e.g. "All materials". */
  allLabel: string;
  /** Plural noun for the trigger when several are picked, e.g. "materials". */
  noun: string;
  className?: string;
  'aria-label'?: string;
}

/** Dropdown with checkboxes. Shares the .sel styles with Select. An empty selection means "all". */
export function MultiSelect<V extends string | number>({
  id, values, options, onChange, allLabel, noun, className = '', ...aria
}: Props<V>) {
  const autoId = useId();
  const baseId = id ?? autoId;
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  // -1 is the "All" row at the top.
  const [active, setActive] = useState(-1);
  const [up, setUp] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const picked = options.filter(o => values.includes(o.value));
  const summary = picked.length === 0 ? allLabel : picked.length === 1 ? picked[0].label : `${picked.length} ${noun}`;

  const close = (focus = true) => { setOpen(false); if (focus) btnRef.current?.focus(); };
  const toggle = (v: V) => onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  const activate = (i: number) => (i < 0 ? onChange([]) : toggle(options[i].value));

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) close(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setUp(window.innerHeight - r.bottom < 300 && r.top > window.innerHeight - r.bottom);
  }, [open]);

  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  function onKey(e: KeyboardEvent) {
    const last = options.length - 1;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); setActive(-1); setOpen(true); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); setActive(a => Math.min(last, a + 1)); break;
      case 'ArrowUp': e.preventDefault(); setActive(a => Math.max(-1, a - 1)); break;
      case 'Home': e.preventDefault(); setActive(-1); break;
      case 'End': e.preventDefault(); setActive(last); break;
      case 'Enter': case ' ': e.preventDefault(); activate(active); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': close(false); break;
      default:
        if (e.key.length === 1) {
          const i = options.findIndex(o => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
          if (i >= 0) setActive(i);
        }
    }
  }

  const optId = (i: number) => `${baseId}-opt-${i < 0 ? 'all' : i}`;

  return (
    <div ref={rootRef} className={`sel sel-md multi ${open ? 'open' : ''} ${className}`}>
      <button
        ref={btnRef}
        id={baseId}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? optId(active) : undefined}
        aria-label={aria['aria-label']}
        className="sel-btn"
        onClick={() => (open ? close() : (setActive(-1), setOpen(true)))}
        onKeyDown={onKey}
      >
        {picked.length > 0 && picked.length <= 3 && (
          <span className="sel-dots" aria-hidden="true">
            {picked.map(o => <span key={String(o.value)} className="dot" style={{ '--c': o.color } as CSSProperties} />)}
          </span>
        )}
        <span className={`sel-value ${picked.length ? '' : 'placeholder-all'}`}>{summary}</span>
        <ChevronDown size={15} className="sel-chev" aria-hidden="true" />
      </button>
      {open && (
        <ul ref={listRef} id={listId} role="listbox" aria-multiselectable="true" className={`sel-list ${up ? 'up' : ''}`} tabIndex={-1} aria-labelledby={baseId}>
          <li
            id={optId(-1)}
            data-i={-1}
            role="option"
            aria-selected={values.length === 0}
            className={`sel-opt sel-all ${active === -1 ? 'active' : ''}`}
            onMouseEnter={() => setActive(-1)}
            onMouseDown={e => e.preventDefault()}
            onClick={() => onChange([])}
          >
            <span className={`sel-box ${values.length === 0 ? 'on' : ''}`} aria-hidden="true">{values.length === 0 && <Check size={12} strokeWidth={3} />}</span>
            <span className="sel-opt-text"><span>{allLabel}</span></span>
            {values.length > 0 && <span className="sel-clear">Clear</span>}
          </li>
          {options.map((o, i) => {
            const on = values.includes(o.value);
            return (
              <li
                key={String(o.value)}
                id={optId(i)}
                data-i={i}
                role="option"
                aria-selected={on}
                className={`sel-opt ${i === active ? 'active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={e => e.preventDefault()}
                onClick={() => toggle(o.value)}
              >
                <span className={`sel-box ${on ? 'on' : ''}`} aria-hidden="true">{on && <Check size={12} strokeWidth={3} />}</span>
                {o.color && <span className="dot" style={{ '--c': o.color } as CSSProperties} />}
                <span className="sel-opt-text"><span>{o.label}</span>{o.hint && <small>{o.hint}</small>}</span>
                {o.count != null && <span className="sel-num num">{o.count}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
