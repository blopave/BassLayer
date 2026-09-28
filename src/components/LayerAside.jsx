import { LayerDoors } from "./LayerDoors";

// Desktop: la columna lateral es la navegación de secciones con dato vivo
// (reemplaza a los paneles Mercados y Ciclos, que repetían las tarjetas).
export function LayerAside({ onGo, active, newsCount }) {
  return (
    <aside className="bl-layer-aside">
      <LayerDoors onGo={onGo} active={active} newsCount={newsCount} />
    </aside>
  );
}
