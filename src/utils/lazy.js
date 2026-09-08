import { lazy } from "react";

// React.lazy para módulos con export nombrado. El import() queda dentro del
// arrow del caller para que Vite pueda analizar el specifier.
export const lazyNamed = (load, name) => lazy(() => load().then((m) => ({ default: m[name] })));
