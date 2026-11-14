/** Controles pequeños reutilizados por las pestañas del popup. */
import { useState, type ReactNode } from 'react';

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
    <div className="range">
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
    </div>
  );
}

export function Segmented<T extends string>(props: {
  value: T;
  options: [value: T, label: string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" style={{ gridTemplateColumns: `repeat(${props.options.length}, 1fr)` }}>
      {props.options.map(([v, label]) => (
        <button key={v} className={props.value === v ? 'on' : ''} onClick={() => props.onChange(v)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Bloque con título que agrupa opciones relacionadas dentro de una pestaña. */
export function Card(props: { title?: string; children: ReactNode }) {
  return (
    <section className="card">
      {props.title && <h2>{props.title}</h2>}
      {props.children}
    </section>
  );
}

export interface TabDef<T extends string> {
  id: T;
  label: string;
  /** Punto de color junto a la etiqueta (p. ej. "doblaje activo"). */
  dot?: boolean;
  render: () => ReactNode;
}

const TAB_KEY = 'voxlate:popup-tab';

/** Pestañas; recuerda la última abierta (solo en este navegador). */
export function Tabs<T extends string>(props: { tabs: TabDef<T>[] }) {
  const [active, setActive] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (props.tabs.some((t) => t.id === saved)) return saved as T;
    } catch {
      /* sin almacenamiento: pestaña por defecto */
    }
    return props.tabs[0]!.id;
  });

  const select = (id: T) => {
    setActive(id);
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* da igual */
    }
  };

  const current = props.tabs.find((t) => t.id === active) ?? props.tabs[0]!;
  return (
    <>
      <nav className="tabs" role="tablist">
        {props.tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={t.id === current.id}
            className={t.id === current.id ? 'on' : ''}
            onClick={() => select(t.id)}
          >
            {t.label}
            {t.dot && <i className="dot" aria-label="activo" />}
          </button>
        ))}
      </nav>
      <div className="panel" role="tabpanel">
        {current.render()}
      </div>
    </>
  );
}
