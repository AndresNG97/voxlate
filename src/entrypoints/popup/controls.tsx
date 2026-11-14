/** Controles pequeños reutilizados por las secciones del popup. */
import type { ReactNode } from 'react';

export function Check(props: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.children}
    </label>
  );
}

export function Range(props: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <>
      <div className="label">
        {props.label} <b>{props.display}</b>
      </div>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: [value: T, label: string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {props.options.map(([v, label]) => (
        <button key={v} className={props.value === v ? 'on' : ''} onClick={() => props.onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Sección plegable (para que el popup no sea kilométrico). */
export function Group(props: { title: string; defaultOpen?: boolean; badge?: ReactNode; children: ReactNode }) {
  return (
    <details className="group" open={props.defaultOpen}>
      <summary>
        {props.title}
        {props.badge}
      </summary>
      <div className="group-body">{props.children}</div>
    </details>
  );
}
