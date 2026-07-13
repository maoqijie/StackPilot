import { CheckCircle2, ChevronDown } from "lucide-react";
import { useId, useRef, useState } from "react";

type FieldSelectOption = string | { value: string; label: string };

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options?: FieldSelectOption[];
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const reactId = useId();
  const safeId = reactId.replace(/:/g, "");
  const listboxId = `${safeId}-listbox`;
  const buttonId = `${safeId}-button`;
  const valueId = `${safeId}-value`;
  const availableOptions = (options ?? []).map((option) => typeof option === "string" ? { value: option, label: option } : option);
  const rawSelectedIndex = availableOptions.findIndex((option) => option.value === value);
  const hasSelectedOption = rawSelectedIndex >= 0;
  const selectedIndex = hasSelectedOption ? rawSelectedIndex : 0;
  const boundedActiveIndex = Math.min(activeIndex, Math.max(availableOptions.length - 1, 0));
  const activeOptionId = open && availableOptions.length > 0 ? `${safeId}-option-${boundedActiveIndex}` : undefined;
  const focusButtonSoon = () => {
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  };
  const openMenu = () => {
    if (!availableOptions.length) return;
    setActiveIndex(selectedIndex);
    setOpen(true);
  };
  const selectOption = (option: { value: string; label: string }) => {
    onChange?.(option.value);
    setOpen(false);
    focusButtonSoon();
  };
  const commitActiveOption = () => {
    const option = availableOptions[boundedActiveIndex];
    if (option) selectOption(option);
  };
  const moveActiveOption = (direction: 1 | -1) => {
    if (availableOptions.length === 0) return;
    setActiveIndex((current) => (current + direction + availableOptions.length) % availableOptions.length);
  };

  return (
    <div
      className={`field-select ${open ? "open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpen(false);
          focusButtonSoon();
          return;
        }
        if (!availableOptions.length) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!open) {
            openMenu();
            return;
          }
          moveActiveOption(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!open) {
            openMenu();
            return;
          }
          moveActiveOption(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          if (!open) openMenu();
          setActiveIndex(0);
        } else if (event.key === "End") {
          event.preventDefault();
          if (!open) openMenu();
          setActiveIndex(availableOptions.length - 1);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!open) {
            openMenu();
            return;
          }
          commitActiveOption();
        }
      }}
    >
      <span id={`${safeId}-label`}>{label}</span>
      <button
        id={buttonId}
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-labelledby={`${safeId}-label ${valueId}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        onClick={() => {
          if (open) {
            setOpen(false);
            focusButtonSoon();
          } else {
            openMenu();
          }
        }}
      >
        <span id={valueId}>{availableOptions[selectedIndex]?.label ?? value}</span><ChevronDown size={12} />
      </button>
      {open && availableOptions.length > 0 && (
        <div className="popover-panel" id={listboxId} role="listbox" aria-labelledby={`${safeId}-label`}>
          {availableOptions.map((option, index) => (
            <button
              className={[
                index === boundedActiveIndex ? "active" : "",
                option.value === value ? "selected" : "",
              ].filter(Boolean).join(" ")}
              id={`${safeId}-option-${index}`}
              key={option.value}
              role="option"
              aria-selected={option.value === value}
              tabIndex={-1}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                selectOption(option);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormLine({
  label,
  value,
  required,
  success,
  hint,
  hintButton,
  hintAction,
  strength,
  error,
  inputType = "text",
  inputRef,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  success?: string;
  hint?: string;
  hintButton?: string;
  hintAction?: () => void;
  strength?: boolean;
  error?: string;
  inputType?: string;
  inputRef?: React.Ref<HTMLInputElement>;
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  const generatedId = useId();
  const inputId = `form-line-${generatedId.replace(/:/g, "")}`;
  const labelId = `${inputId}-label`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="form-line">
      <label id={labelId} htmlFor={inputId}>{label}{required && <b>*</b>}</label>
      <div>
        <input id={inputId} ref={inputRef} type={inputType} value={value} readOnly={!onChange} disabled={disabled} required={required} aria-label={label} aria-required={required ? "true" : undefined} aria-labelledby={labelId} aria-describedby={describedBy} aria-invalid={error ? "true" : undefined} onChange={(event) => onChange?.(event.target.value)} />
        {hint && <em id={hintId}>{hint}</em>}
        {hintButton && <button type="button" disabled={disabled} onClick={hintAction}>{hintButton}</button>}
        {success && <small><CheckCircle2 size={12} /> {success}</small>}
        {error && <strong id={errorId} className="form-error">{error}</strong>}
      </div>
      {strength && <p className="password-strength"><i /><i /><i /><em>强</em></p>}
    </div>
  );
}

function FormSelectLine({
  label,
  value,
  required,
  icon,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  icon?: React.ReactNode;
  options?: string[];
  disabled?: boolean;
  onChange?: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const reactId = useId();
  const safeId = reactId.replace(/:/g, "");
  const labelId = `${safeId}-label`;
  const listboxId = `${safeId}-listbox`;
  const buttonId = `${safeId}-button`;
  const valueId = `${safeId}-value`;
  const availableOptions = options ?? [];
  const selectedIndex = Math.max(availableOptions.indexOf(value), 0);
  const boundedActiveIndex = Math.min(activeIndex, Math.max(availableOptions.length - 1, 0));
  const activeOptionId = open && availableOptions.length > 0 ? `${safeId}-option-${boundedActiveIndex}` : undefined;
  const focusButtonSoon = () => {
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  };
  const openMenu = () => {
    if (disabled || !availableOptions.length) return;
    setActiveIndex(selectedIndex);
    setOpen(true);
  };
  const closeMenu = () => {
    setOpen(false);
  };
  const selectOption = (option: string) => {
    onChange?.(option);
    closeMenu();
    focusButtonSoon();
  };
  const commitActiveOption = () => {
    const option = availableOptions[boundedActiveIndex];
    if (option) selectOption(option);
  };
  const moveActiveOption = (direction: 1 | -1) => {
    if (!availableOptions.length) return;
    setActiveIndex((current) => (current + direction + availableOptions.length) % availableOptions.length);
  };

  return (
    <div
      className="form-line"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          closeMenu();
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          closeMenu();
          focusButtonSoon();
          return;
        }
        if (disabled || !availableOptions.length) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          if (!open) {
            openMenu();
            return;
          }
          moveActiveOption(1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          if (!open) {
            openMenu();
            return;
          }
          moveActiveOption(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          if (!open) openMenu();
          setActiveIndex(0);
        } else if (event.key === "End") {
          event.preventDefault();
          if (!open) openMenu();
          setActiveIndex(availableOptions.length - 1);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (!open) {
            openMenu();
            return;
          }
          commitActiveOption();
        }
      }}
    >
      <span id={labelId}>{label}{required && <b>*</b>}</span>
      <button
        id={buttonId}
        ref={buttonRef}
        className={`select-like ${open ? "open" : ""}`}
        type="button"
        role="combobox"
        disabled={disabled}
        aria-required={required ? "true" : undefined}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        onClick={() => {
          if (!availableOptions.length || disabled) return;
          if (open) {
            closeMenu();
            focusButtonSoon();
          } else {
            openMenu();
          }
        }}
      >{icon}<span id={valueId}>{value}</span><ChevronDown size={12} /></button>
      {open && availableOptions.length > 0 && !disabled && (
        <div className="select-menu" id={listboxId} role="listbox" aria-labelledby={labelId}>
          {availableOptions.map((option, index) => (
            <button
              className={[
                index === boundedActiveIndex ? "active" : "",
                option === value ? "selected" : "",
              ].filter(Boolean).join(" ")}
              id={`${safeId}-option-${index}`}
              key={option}
              role="option"
              aria-selected={option === value}
              tabIndex={-1}
              type="button"
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                selectOption(option);
              }}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ToggleLine({ label, active, hint, disabled, onToggle }: { label: string; active?: boolean; hint?: string; disabled?: boolean; onToggle?: (active: boolean) => void }) {
  return (
    <button className="toggle-line" type="button" role="switch" disabled={disabled} aria-checked={Boolean(active)} onClick={() => onToggle?.(!active)}>
      <span>{label}</span>
      <i className={active ? "on" : ""}><b /></i>
      {hint && <em>{hint}</em>}
    </button>
  );
}

export { FieldSelect, FormLine, FormSelectLine, ToggleLine };
