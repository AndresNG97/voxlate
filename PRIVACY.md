# Política de privacidad de Voxlate

Última actualización: 14 de noviembre de 2026

Voxlate es una extensión de Chrome que traduce los subtítulos de los vídeos de
YouTube y los lee en voz alta (doblaje). Está pensada para funcionar **en tu
equipo**: no tiene servidores propios ni cuentas de usuario, y no recoge datos
personales.

## Resumen

- No recogemos, no vendemos y no compartimos tus datos.
- No hay analítica, publicidad ni rastreo.
- Las traducciones, la voz y el análisis del audio se hacen en tu equipo.
- Lo que se guarda (ajustes, traducciones y voces) se queda en tu navegador, y
  puedes borrarlo cuando quieras.

## Qué hace la extensión con la información

Para funcionar, Voxlate trabaja con esto **solo dentro de tu navegador**:

| Información | Para qué | Dónde se procesa |
|---|---|---|
| Subtítulos del vídeo de YouTube que estás viendo | Traducirlos y mostrarlos en pantalla | En tu equipo |
| Texto traducido | Mostrarlo y leerlo en voz alta | En tu equipo |
| Audio del vídeo (solo si activas la *sincronía de precisión*) | Detectar cuándo habla la persona para cuadrar el doblaje | En tu equipo. No se graba ni se guarda |
| Tus ajustes (idiomas, voz, tamaño del texto…) | Recordar tus preferencias | En tu navegador |

Voxlate solo funciona en `www.youtube.com`. No lee otras webs, tu historial,
tus contraseñas ni tus datos de YouTube (cuenta, comentarios, suscripciones…).

## Qué se guarda y durante cuánto tiempo

- **Ajustes**: en `chrome.storage.sync`. Si tienes activada la sincronización de
  Chrome, Google los copia en tus otros navegadores con tu misma cuenta, igual
  que hace con los ajustes de cualquier extensión.
- **Traducciones guardadas**: en `chrome.storage.local`, para no volver a traducir
  un vídeo. Se guardan como mucho los últimos 40 vídeos, y cada traducción se
  borra a los 30 días.
- **Voces neuronales descargadas**: en el almacenamiento privado de la extensión
  (OPFS). Se guardan como mucho dos voces; la que lleva más tiempo sin usarse se
  borra sola.

Nada de esto sale de tu equipo hacia nosotros.

## Conexiones con otros servicios

Voxlate no envía nada a servidores propios. Sí puede pasar lo siguiente, siempre
directamente entre tu navegador y el servicio:

- **YouTube** (`youtube.com`): los subtítulos se leen de la propia página. Si
  eliges *YouTube* como motor de traducción, la extensión pide a YouTube los
  subtítulos traducidos de ese vídeo, igual que si los activaras tú en el
  reproductor. Se aplica la [política de privacidad de Google](https://policies.google.com/privacy).
- **Hugging Face** (`huggingface.co`): si eliges una voz neuronal, se descarga una
  sola vez desde Hugging Face. Hugging Face recibe la petición de descarga (como
  cualquier web, ve tu dirección IP). No se envía ningún texto ni dato tuyo. Se
  aplica la [política de privacidad de Hugging Face](https://huggingface.co/privacy).
- **Traductor de Chrome**: la traducción se hace en tu equipo con la Translator API
  de Chrome. Es Chrome quien descarga el modelo de idioma la primera vez.
- **Voces del sistema**: si eliges una voz del sistema marcada como *en línea*
  (por ejemplo, algunas voces "Google" de Chrome), es Chrome quien envía el texto
  a leer a ese servicio. Las voces locales no se conectan a nada. Voxlate te las
  muestra por separado para que elijas.

## Permisos que pide

- `storage`: guardar tus ajustes y las traducciones.
- `offscreen`: generar la voz neuronal y analizar el audio en segundo plano, sin
  abrir ventanas.
- `tts`: usar las voces del sistema.
- Acceso a `https://www.youtube.com/*`: leer los subtítulos y mostrar la
  traducción encima del vídeo.

## Cómo borrar tus datos

- **Traducciones**: pestaña *Traducción* → *Borrar traducciones guardadas*.
- **Voces**: pestaña *Voz* → *Borrar* en cada voz descargada.
- **Todo**: desinstala la extensión. Chrome borra sus ajustes, traducciones y
  voces.

## Uso limitado

El uso que hace Voxlate de la información cumple la
[política de datos de usuario de la Chrome Web Store](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq),
incluidos los requisitos de **uso limitado**. La información solo se usa para dar
la función de traducción y doblaje que ves. No se transfiere a terceros, no se usa
para publicidad ni para calcular si alguien puede recibir un crédito, y ninguna
persona la lee.

## Menores

Voxlate no recoge datos de nadie, tampoco de menores.

## Cambios en esta política

Si la política cambia, se publicará aquí con una nueva fecha. Si un cambio afecta
a qué datos se usan, se avisará en las notas de la versión de la extensión.

## Contacto

Para preguntas sobre privacidad, abre una incidencia en
<https://github.com/AndresNG97/voxlate/issues>.
