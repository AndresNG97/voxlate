/** Adaptador de MediaElementPort sobre un <video>/<audio> del DOM. */
import type { MediaElementPort, MediaEvent } from '@/core/ports/media-element';

export class HtmlMediaElement implements MediaElementPort {
  constructor(private readonly el: HTMLMediaElement) {}

  get currentTimeMs() {
    return this.el.currentTime * 1000;
  }

  get paused() {
    return this.el.paused;
  }

  get volume() {
    return this.el.volume;
  }

  set volume(v: number) {
    this.el.volume = v;
  }

  get playbackRate() {
    return this.el.playbackRate;
  }

  set playbackRate(r: number) {
    this.el.playbackRate = r;
  }

  on(event: MediaEvent, cb: () => void): () => void {
    this.el.addEventListener(event, cb);
    return () => this.el.removeEventListener(event, cb);
  }

  onTick(cb: () => void): () => void {
    let raf = 0;
    const loop = () => {
      cb();
      if (!this.el.paused) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      loop();
    };
    // Con la pestaña en segundo plano no hay requestAnimationFrame; timeupdate
    // (~4 veces por segundo) mantiene vivo el render y el doblaje.
    const onTimeUpdate = () => {
      if (document.hidden) cb();
    };
    const offs = [
      this.on('play', start),
      this.on('pause', cb),
      this.on('seeked', cb),
      () => this.el.removeEventListener('timeupdate', onTimeUpdate),
    ];
    this.el.addEventListener('timeupdate', onTimeUpdate);
    if (!this.el.paused) start();
    return () => {
      cancelAnimationFrame(raf);
      offs.forEach((off) => off());
    };
  }
}
