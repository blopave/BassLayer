import React from "react";
import ReactDOM from "react-dom/client";
import { Suspense } from "react";
import { lazyNamed } from "./utils/lazy";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LocaleProvider } from "./hooks/useLocale";
// Las dos únicas familias del sistema, auto-hospedadas y variables: un archivo
// por familia cubre todo el rango 100–900. Van antes de styles.css para que
// nuestros tokens ganen. Reemplazan a las siete que se pedían a Google Fonts.
// Fuentes: self-hosted en public/fonts (solo subset latin, que es el único que
// el sitio pide) con nombres estables para poder precargarlas desde index.html.
// Las @font-face viven al principio de styles.css.
import "./styles.css";

// /semana es una página aparte (el resumen semanal): su propio chunk, sin el home.
const Semana = lazyNamed(() => import("./components/Semana"), "Semana");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LocaleProvider>
        {/^\/semana\/?$/.test(window.location.pathname)
          ? <Suspense fallback={null}><Semana /></Suspense>
          : <App />}
      </LocaleProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Register service worker for PWA
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
