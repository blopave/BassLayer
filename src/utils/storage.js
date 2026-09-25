// localStorage puede lanzar (Safari con "bloquear todas las cookies", modo
// privado viejo, iframes con storage particionado). Nunca debe tirar la app.
export const storage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  set(key, value) {
    try { window.localStorage.setItem(key, value); } catch { /* sin storage: seguimos */ }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch { /* idem */ }
  },
};
