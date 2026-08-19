import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LocaleProvider } from "./hooks/useLocale";
import "./styles.css";

// La hoja de Google Fonts entra como preload para no bloquear la primera
// pintura; acá se promueve a stylesheet. Va antes del render porque a esta
// altura el HTML ya se parseó y la descarga arrancó en paralelo.
const fontLink = document.getElementById("bl-fonts");
if (fontLink && fontLink.rel === "preload") fontLink.rel = "stylesheet";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <LocaleProvider>
        <App />
      </LocaleProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Register service worker for PWA
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
