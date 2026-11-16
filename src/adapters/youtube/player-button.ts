/**
 * Botón de Voxlate en la barra del reproductor de YouTube, junto al de
 * subtítulos: activa o desactiva la traducción en el vídeo actual sin abrir el
 * popup. Apagado se ve el logo en blanco y contorno; encendido, relleno en rojo.
 */

const BUTTON_CLASS = 'voxlate-toggle';

/** El logo de Voxlate a 24 px. Con la API del DOM: YouTube exige Trusted Types para innerHTML. */
function icon(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };
  const svg = el('svg', { width: '24', height: '24', viewBox: '0 0 24 24', 'aria-hidden': 'true' });
  svg.append(
    el('rect', { class: 'vx-box', x: '2', y: '3', width: '20', height: '18', rx: '4', 'stroke-width': '2' }),
    el('path', { class: 'vx-glyph', d: 'M10 6.6v5l4.3-2.5z' }),
    el('rect', { class: 'vx-glyph', x: '6', y: '13.6', width: '12', height: '2', rx: '1' }),
    el('rect', { class: 'vx-glyph', x: '8.5', y: '17', width: '7', height: '1.8', rx: '.9' }),
  );
  return svg;
}

const STYLE = `
  .${BUTTON_CLASS} { display: inline-flex !important; align-items: center; justify-content: center; }
  .${BUTTON_CLASS} svg { pointer-events: none; }
  .${BUTTON_CLASS} .vx-box { fill: none; stroke: #fff; }
  .${BUTTON_CLASS} .vx-glyph { fill: #fff; }
  .${BUTTON_CLASS}[aria-pressed="true"] .vx-box { fill: #e8483a; stroke: #e8483a; }
`;

export class PlayerToggleButton {
  private readonly button: HTMLButtonElement;
  private readonly style: HTMLStyleElement;
  private container: HTMLElement | null = null;
  private observer: MutationObserver | null = null;

  constructor(onClick: () => void) {
    this.button = document.createElement('button');
    this.button.className = `ytp-button ${BUTTON_CLASS}`;
    this.button.setAttribute('aria-pressed', 'false');
    this.button.append(icon());
    this.button.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    this.style = document.createElement('style');
    this.style.textContent = STYLE;
  }

  /** Lo coloca en el reproductor y lo vuelve a poner si YouTube rehace la barra. */
  attach(container: HTMLElement) {
    if (!this.style.isConnected) document.documentElement.appendChild(this.style);
    if (this.container !== container) {
      this.observer?.disconnect();
      this.container = container;
      this.observer = new MutationObserver(() => {
        if (!this.button.isConnected) this.place();
      });
      this.observer.observe(container, { childList: true, subtree: true });
    }
    this.place();
  }

  setState(on: boolean, label: string) {
    this.button.setAttribute('aria-pressed', String(on));
    this.button.setAttribute('aria-label', label);
    this.button.title = label;
  }

  remove() {
    this.observer?.disconnect();
    this.observer = null;
    this.container = null;
    this.button.remove();
  }

  private place() {
    const c = this.container;
    if (!c) return;
    // Reproductor actual: grupo izquierdo de los controles de la derecha. Clásico: los controles de la derecha.
    const group = c.querySelector('.ytp-right-controls-left') ?? c.querySelector('.ytp-right-controls');
    if (!group) return;
    const subtitles = group.querySelector(':scope > .ytp-subtitles-button');
    if (subtitles) subtitles.before(this.button);
    else if (this.button.parentElement !== group) group.prepend(this.button);
  }
}
