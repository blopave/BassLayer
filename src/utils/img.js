// URLs de imagen a través del proxy /img del server: resize a 2× del ancho
// mostrado y WebP, cacheado 7 días. Solo aplica a URLs absolutas de terceros
// (flyers de RA, fotos de noticias); lo relativo (/api/artist-image) ya pasa
// por el server. Si el proxy falla, el componente vuelve a la URL original.
const WIDTHS = [160, 320, 640, 1000];

export function imgUrl(url, displayWidth) {
  if (!url || !/^https?:\/\//i.test(url)) return url;
  const want = Math.ceil(displayWidth * 2);
  const w = WIDTHS.find((x) => x >= want) || 1000;
  return `/img?u=${encodeURIComponent(url)}&w=${w}`;
}

// Para fotos que cambian de tamaño según la pantalla (la pared de la Agenda y
// de Noticias): el navegador elige del srcset el ancho justo para su densidad.
export function imgSrcSet(url) {
  if (!url || !/^https?:\/\//i.test(url)) return undefined;
  return [320, 640, 1000].map((w) => `/img?u=${encodeURIComponent(url)}&w=${w} ${w}w`).join(", ");
}
