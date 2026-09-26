# CLAUDE.md — BassLayer

Guía de trabajo del proyecto. Léela al arrancar cada sesión.

## Stack

- **React + Vite** (dev en `:3000`), API Express en `:3001`.
- Mundo dual **Bass** (agenda de música electrónica) / **Layer** (crypto LATAM).
- i18n bilingüe ES/EN en `src/i18n/strings.js` (+ campos `*En` en datos, helper `pickLocalized`).
- Deep-link al mundo Layer: `/?view=layer`.

## Cómo previsualizar mientras trabajamos (IMPORTANTE)

Pablo quiere ver el sitio **SIEMPRE en las dos versiones a la vez — mobile + desktop — en UNA sola ventana, con ambos marcos COMPLETOS** (nada cortado abajo ni a la derecha). Es el default desde el arranque de toda sesión de trabajo visual: mostrar ambas sin que lo pida.

**Herramienta: `preview.html`** (en el root del repo, solo dev — no entra al build de prod).

1. Levantar dev en background: `npm run dev` (Vite `:3000` + API `:3001`).
2. Abrir `http://localhost:3000/preview.html`.
   - Muestra **mobile 390×844 + desktop 1440** lado a lado.
   - **Ambos iframes se escalan con `transform:scale()`** midiendo el espacio real (`fit()` + `ResizeObserver`) para que los dos marcos entren enteros en la ventana. NO volver a poner el mobile a 390px reales fijos (se cortaba a la derecha).
   - Barra superior: targets **Home / Layer / Agenda** + **↻ recargar**; deep-link `?u=` para volver a la misma vista.
   - HMR de Vite: los cambios de código refrescan los iframes solos.
3. **Preferido:** abrirlo en el Chrome de Pablo vía la extensión `claude-in-chrome`, reusando UNA sola pestaña toda la sesión (guardar el tabId). La extensión no navega `file://` — servir siempre por HTTP.
4. **Fallback** si la extensión no está conectada: Playwright headless → renderizar `preview.html` a ~1512×900 → screenshot → `SendUserFile`. Mandar SIEMPRE la imagen con ambas versiones, nunca una sola.

> La técnica de fit-ambos-completos está portada del `/ver` de otro proyecto de Pablo (`~/Desktop/blopa/src/pages/ver.astro`).

## Control de calidad al cierre de cada sesión (OBLIGATORIO)

Nada se da por terminado sin esto. Nació de sept 2026: un refactor + un ban del CDN de Deezer dejaron el modal de evento con cajas vacías y nadie lo vio.

1. Con `npm run dev` corriendo: **`npm run check`** = `vite build` + `check:content` (invariantes de la data servida) + **`smoke`** (Playwright real, mobile 390 + desktop 1440 + mobile con fotos de artista caídas: home → onboarding → Bass → abrir evento → line-up/imágenes/CTA → Escape libera scroll e inert → Layer).
2. Si falla: se arregla o se reporta a Pablo con el output. **No** se commitea "para después".
3. Mirar los screenshots de `.pw-shots/smoke-*.png` y mostrarle a Pablo mobile + desktop.
4. Feature nueva o flujo tocado → sumar su paso a `scripts/smoke.mjs` en la misma sesión, y comprobar que el paso **falla sin el cambio** (si no falla, no protege nada).
5. Post-deploy: `npm run smoke -- https://basslayer.io`.

El hook `.githooks/pre-push` (activo vía `git config core.hooksPath .githooks`) corre `npm run check` y frena el push si falla. Saltearlo solo a conciencia: `SKIP_CHECK=1 git push`.

Regla de diseño que sale de esto: **toda imagen externa necesita fallback** (`onError` → inicial / póster). Las fuentes externas (Deezer, RA, CDNs) se caen; la UI no puede depender de que respondan.

## Cómo trabajar (preferencias de Pablo)

- **Director + ejecutor:** research y opciones antes de implementar; en tareas con muchas confirmaciones, ofrecer "modo automático" (avanzar con defaults sensatos, frenar solo en bifurcaciones clave o lo irreversible).
- **Datos verificados:** nunca mostrar/deployar fechas, venues, lineups o info sin verificar contra 2+ fuentes; lo no verificable se omite (no se inventa).
- **Antes de push:** ship-prep + simplify. **Push solo con OK explícito de Pablo.**
- Al retomar: chequear primero el estado del repo (`git fetch` + `status`).
