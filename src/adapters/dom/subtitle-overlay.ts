/**
 * Adaptador de SubtitleViewPort: overlay de subtítulos dentro de un Shadow DOM,
 * para que el CSS de la web no nos afecte ni nosotros a ella. Vanilla TS a
 * propósito: se inyecta en cada página y tiene que pesar casi nada.
 */
import type { SubtitleLines, SubtitleStyle } from '@/core/domain/subtitles';
import type { StatusAction, SubtitleViewPort } from '@/core/ports/subtitle-view';

export type OverlayMode =
  /** Dentro del contenedor del reproductor (YouTube): position absolute. */
  | { kind: 'player'; container: HTMLElement }
  /** Webs genéricas (modo audio): fijo en el viewport o en el fullscreen. */
  | { kind: 'viewport' };

/** Cuánto se apartan los subtítulos (en % del alto) cuando hay controles visibles. */
const CONTROLS_CLEARANCE = 6;

const STYLE = /* css */ `
  :host { all: initial; }
  .wrap {
    position: absolute; left: 0; right: 0;
    display: flex; flex-direction: column; align-items: center; gap: .25em;
    pointer-events: none; z-index: 2147483000;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    font-size: var(--vt-size, 22px); line-height: 1.3;
    transition: bottom .2s ease, top .2s ease;
  }
  .wrap.fixed { position: fixed; }
  .line {
    max-width: 82%; padding: .12em .5em; border-radius: .25em; text-align: center;
    background: rgba(8, 8, 8, var(--vt-bg, .75));
    white-space: pre-wrap; overflow-wrap: anywhere;
    text-shadow: 0 1px 2px rgba(0,0,0,.6);
  }
  .line:empty { display: none; }
  .tr { font-weight: 600; color: var(--vt-tr-color, #fff); order: 1; }
  .orig { font-size: .72em; color: var(--vt-orig-color, #d8d8d8); order: 2;
          background: rgba(8, 8, 8, calc(var(--vt-bg, .75) * .8)); }
  .orig-first .orig { order: 0; }
  /* Si solo se ve el original, a tamaño completo. */
  .tr:empty ~ .orig { font-size: 1em; }
  .orig.interim { opacity: .7; font-style: italic; }
  /* Sin fondo: contorno para que se lea sobre cualquier imagen. */
  .no-bg .line {
    background: none;
    text-shadow: 0 0 3px #000, 0 0 2px #000, 1px 1px 2px #000, -1px -1px 2px #000;
  }
  .status {
    order: -1; pointer-events: auto; font-size: .62em; color: #fff; background: rgba(232, 72, 58, .92);
    padding: .35em .8em; border-radius: 999px; display: flex; gap: .6em; align-items: center;
    text-shadow: none;
  }
  .status:empty { display: none; }
  .status button {
    all: unset; cursor: pointer; background: #fff; color: #c0392b; font-weight: 700;
    padding: .15em .7em; border-radius: 999px;
  }
`;

export class SubtitleOverlay implements SubtitleViewPort {
  private readonly host: HTMLDivElement;
  private readonly wrap: HTMLDivElement;
  private readonly trEl: HTMLDivElement;
  private readonly origEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;
  private resizeObs?: ResizeObserver;
  private readonly onFullscreen = () => this.reattach();
  private style: Pick<SubtitleStyle, 'fontScale' | 'position' | 'offset'> = {
    fontScale: 100,
    position: 'bottom',
    offset: 9,
  };
  private controlsVisible = false;

  constructor(private readonly mode: OverlayMode) {
    this.host = document.createElement('div');
    this.host.setAttribute('data-voxlate', '');
    const root = this.host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>${STYLE}</style>
      <div class="wrap">
        <div class="status"></div>
        <div class="line tr"></div>
        <div class="line orig"></div>
      </div>`;
    this.wrap = root.querySelector('.wrap')!;
    this.statusEl = root.querySelector('.status')!;
    this.trEl = root.querySelector('.tr')!;
    this.origEl = root.querySelector('.orig')!;

    if (mode.kind === 'player') {
      // El reproductor de YouTube ya es position:relative; nos colgamos de él
      // para seguirle en fullscreen, modo cine, miniplayer…
      Object.assign(this.host.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: '60' });
      mode.container.appendChild(this.host);
      this.resizeObs = new ResizeObserver(() => this.autoSize());
      this.resizeObs.observe(mode.container);
    } else {
      this.wrap.classList.add('fixed');
      document.addEventListener('fullscreenchange', this.onFullscreen);
      this.reattach();
    }
    this.place();
    this.autoSize();
  }

  show(lines: SubtitleLines) {
    if (this.trEl.textContent !== lines.translated) this.trEl.textContent = lines.translated;
    if (this.origEl.textContent !== lines.original) this.origEl.textContent = lines.original;
    this.origEl.classList.toggle('interim', !!lines.interim);
  }

  clear() {
    this.show({ translated: '', original: '' });
  }

  setStyle(style: SubtitleStyle) {
    this.style = style;
    const s = this.wrap.style;
    s.setProperty('--vt-bg', String(Math.max(0, Math.min(100, style.backgroundOpacity)) / 100));
    s.setProperty('--vt-tr-color', style.translatedColor);
    s.setProperty('--vt-orig-color', style.originalColor);
    this.wrap.classList.toggle('no-bg', !style.background);
    this.wrap.classList.toggle('orig-first', style.originalFirst);
    this.place();
    this.autoSize();
  }

  setControlsVisible(visible: boolean) {
    if (visible === this.controlsVisible) return;
    this.controlsVisible = visible;
    this.place();
  }

  setStatus(message: string | null, action?: StatusAction) {
    this.statusEl.replaceChildren();
    if (!message) return;
    const span = document.createElement('span');
    span.textContent = message;
    this.statusEl.appendChild(span);
    if (action) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        action.onClick();
      });
      this.statusEl.appendChild(btn);
    }
  }

  destroy() {
    this.resizeObs?.disconnect();
    document.removeEventListener('fullscreenchange', this.onFullscreen);
    this.host.remove();
  }

  /** Coloca el bloque arriba o abajo, apartándolo de los controles si se ven. */
  private place() {
    const { position, offset } = this.style;
    // Solo en el reproductor hay controles que esquivar (abajo la barra, arriba el título).
    const clearance = this.mode.kind === 'player' && this.controlsVisible ? CONTROLS_CLEARANCE : 0;
    const unit = this.mode.kind === 'player' ? '%' : 'vh';
    const value = `${offset + clearance}${unit}`;
    const s = this.wrap.style;
    if (position === 'top') {
      s.top = value;
      s.bottom = 'auto';
    } else {
      s.bottom = value;
      s.top = 'auto';
    }
  }

  /** Texto proporcional al alto del reproductor (como hace YouTube). */
  private autoSize() {
    const h = this.mode.kind === 'player' ? this.mode.container.clientHeight : window.innerHeight;
    const px = Math.max(14, Math.min(48, h * 0.042)) * (this.style.fontScale / 100);
    this.wrap.style.setProperty('--vt-size', `${px.toFixed(1)}px`);
  }

  private reattach() {
    const parent = document.fullscreenElement ?? document.body;
    if (this.host.parentElement !== parent) parent.appendChild(this.host);
    this.autoSize();
  }
}
