/**
 * ¿Voxlate empieza activado en un vídeo? Cada vídeo nuevo empieza desactivado,
 * salvo con "traducir siempre", y en ese caso tampoco si el vídeo ya está en el
 * idioma al que traducimos. Lo que el usuario elija con el botón del
 * reproductor manda sobre todo lo demás.
 */

/** Por qué está desactivado en este vídeo. */
export type OffReason = 'default' | 'same-language' | 'user';

export type Activation = { on: true } | { on: false; reason: OffReason };

export function decideActivation(input: {
  /** Lo que eligió el usuario en este vídeo con el botón (si eligió algo). */
  choice: boolean | undefined;
  autoTranslate: boolean;
  /** Idioma hablado en el vídeo (p. ej. 'en'), si se sabe. */
  videoLang: string | null;
  targetLang: string;
}): Activation {
  if (input.choice !== undefined) return input.choice ? { on: true } : { on: false, reason: 'user' };
  if (!input.autoTranslate) return { on: false, reason: 'default' };
  if (input.videoLang && baseLang(input.videoLang) === baseLang(input.targetLang))
    return { on: false, reason: 'same-language' };
  return { on: true };
}

function baseLang(code: string): string {
  return code.toLowerCase().split(/[-_]/)[0]!;
}
