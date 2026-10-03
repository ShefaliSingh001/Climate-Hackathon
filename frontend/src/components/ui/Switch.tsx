interface Props {
  id?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Second line under the label. */
  hint?: string;
  disabled?: boolean;
}

/** On/off switch with its label. */
export function Switch({ id, checked, onChange, label, hint, disabled }: Props) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={`switch${hint ? ' with-hint' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="switch-track" aria-hidden="true"><span className="switch-thumb" /></span>
      <span className="switch-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
    </button>
  );
}
