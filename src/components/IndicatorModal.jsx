import { useEffect } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useLocale } from "../hooks/useLocale";

const INDICATORS = {
  es: {
    btcDominance: {
      sym: "BTC.D",
      title: "BTC Dominance",
      what: "Porcentaje del market cap total de cripto que representa Bitcoin. Si todo el mercado vale 100, BTC.D te dice cuántos de esos 100 son BTC.",
      zones: [
        { range: "< 40%", min: 0, max: 40, label: "Altseason", desc: "Capital rotando hacia altcoins. Históricamente raro y de duración corta." },
        { range: "40 – 55%", min: 40, max: 55, label: "Mixto", desc: "Mercado repartido. BTC y alts se mueven en paralelo." },
        { range: "> 55%", min: 55, max: 100, label: "BTC manda", desc: "BTC absorbe la liquidez. Las alts suelen sangrar contra BTC." },
      ],
      why: "Es el termómetro más usado para timing de altseason. Una caída fuerte de BTC.D suele anticipar rotación de capital hacia altcoins.",
    },
    ethDominance: {
      sym: "ETH.D",
      title: "ETH Dominance",
      what: "Porcentaje del market cap total de cripto que representa Ethereum. Histórico típico: 15 – 22%.",
      zones: [
        { range: "< 15%", min: 0, max: 15, label: "ETH débil", desc: "ETH pierde share frente a BTC y otras L1s." },
        { range: "15 – 20%", min: 15, max: 20, label: "Normal", desc: "Rango histórico estándar." },
        { range: "> 20%", min: 20, max: 100, label: "ETH fuerte", desc: "ETH lidera el ciclo. DeFi y L2s suelen acompañar." },
      ],
      why: "Útil para distinguir entre un ciclo BTC-only y uno donde el ecosistema ETH (DeFi, L2s, restaking) toma protagonismo.",
    },
    marketCap: {
      sym: "TOTAL",
      title: "Market Cap Total",
      what: "Suma del valor de mercado de todas las criptomonedas. Es el tamaño del mercado entero, expresado en USD.",
      zones: [
        { range: "Cambio 24h ≥ 0", min: 0, max: Infinity, label: "Risk-on", desc: "Entra capital al mercado. Apetito de riesgo presente." },
        { range: "Cambio 24h < 0", min: -Infinity, max: 0, label: "Risk-off", desc: "Sale capital. Corrección o aversión al riesgo." },
      ],
      why: "Sirve para entender si estamos en expansión o contracción. Cap creciente = más dinero entrando, no solo rotación interna entre tokens.",
    },
    fearGreed: {
      sym: "F&G",
      title: "Fear & Greed Index",
      what: "Índice 0 – 100 que mide el sentimiento del mercado combinando volatilidad, momentum, volumen, dominancia BTC, redes sociales y encuestas.",
      zones: [
        { range: "0 – 25", min: 0, max: 25, label: "Extreme Fear", desc: "Pánico generalizado. Históricamente, zona de oportunidad." },
        { range: "25 – 45", min: 25, max: 45, label: "Fear", desc: "Pesimismo. Mercado cauteloso." },
        { range: "45 – 55", min: 45, max: 55, label: "Neutral", desc: "Sin sesgo emocional claro." },
        { range: "55 – 75", min: 55, max: 75, label: "Greed", desc: "Optimismo. FOMO empezando a aparecer." },
        { range: "75 – 100", min: 75, max: 101, label: "Extreme Greed", desc: "Euforia. Históricamente, zona de cuidado." },
      ],
      why: 'Indicador contrarian. "Be fearful when others are greedy, and greedy when others are fearful." Útil para no comprar tops emocionales.',
    },
    ethGas: {
      sym: "GWEI",
      title: "ETH Gas",
      what: "Costo de procesar transacciones en Ethereum, medido en gwei (1 gwei = 0.000000001 ETH). Cuanto más activa la red, más caro.",
      zones: [
        { range: "< 20 gwei", min: 0, max: 20, label: "Tranquilo", desc: "Red ociosa. Buen momento para mover ETH y hacer swaps." },
        { range: "20 – 60 gwei", min: 20, max: 60, label: "Normal", desc: "Actividad estándar de red." },
        { range: "> 60 gwei", min: 60, max: Infinity, label: "Congestionada", desc: "Mints, airdrops o volatilidad alta. Esperá si podés." },
      ],
      why: "Indicador en tiempo real de la actividad on-chain de Ethereum. Picos suelen coincidir con eventos de mercado (mints, liquidaciones, lanzamientos).",
    },
  },
  en: {
    btcDominance: {
      sym: "BTC.D",
      title: "BTC Dominance",
      what: "Share of the total crypto market cap held by Bitcoin. If the whole market is 100, BTC.D tells you how many of those 100 are BTC.",
      zones: [
        { range: "< 40%", min: 0, max: 40, label: "Altseason", desc: "Capital rotating into altcoins. Historically rare and short-lived." },
        { range: "40 – 55%", min: 40, max: 55, label: "Mixed", desc: "Split market. BTC and alts move in parallel." },
        { range: "> 55%", min: 55, max: 100, label: "BTC leads", desc: "BTC absorbs liquidity. Alts usually bleed against BTC." },
      ],
      why: "The most widely used gauge for altseason timing. A sharp drop in BTC.D often signals capital rotation toward altcoins.",
    },
    ethDominance: {
      sym: "ETH.D",
      title: "ETH Dominance",
      what: "Share of total crypto market cap held by Ethereum. Typical historical range: 15 – 22%.",
      zones: [
        { range: "< 15%", min: 0, max: 15, label: "ETH weak", desc: "ETH losing share against BTC and other L1s." },
        { range: "15 – 20%", min: 15, max: 20, label: "Normal", desc: "Standard historical range." },
        { range: "> 20%", min: 20, max: 100, label: "ETH strong", desc: "ETH leads the cycle. DeFi and L2s usually follow." },
      ],
      why: "Useful to distinguish between a BTC-only cycle and one where the ETH ecosystem (DeFi, L2s, restaking) takes the spotlight.",
    },
    marketCap: {
      sym: "TOTAL",
      title: "Total Market Cap",
      what: "Sum of the market value of every cryptocurrency. The size of the entire market, expressed in USD.",
      zones: [
        { range: "24h change ≥ 0", min: 0, max: Infinity, label: "Risk-on", desc: "Capital entering the market. Risk appetite present." },
        { range: "24h change < 0", min: -Infinity, max: 0, label: "Risk-off", desc: "Capital leaving. Correction or risk aversion." },
      ],
      why: "Helps understand whether we're in expansion or contraction. Growing cap = new money entering, not just internal rotation between tokens.",
    },
    fearGreed: {
      sym: "F&G",
      title: "Fear & Greed Index",
      what: "0 – 100 index that measures market sentiment by combining volatility, momentum, volume, BTC dominance, social media and surveys.",
      zones: [
        { range: "0 – 25", min: 0, max: 25, label: "Extreme Fear", desc: "Widespread panic. Historically, an opportunity zone." },
        { range: "25 – 45", min: 25, max: 45, label: "Fear", desc: "Pessimism. Cautious market." },
        { range: "45 – 55", min: 45, max: 55, label: "Neutral", desc: "No clear emotional bias." },
        { range: "55 – 75", min: 55, max: 75, label: "Greed", desc: "Optimism. FOMO starting to appear." },
        { range: "75 – 100", min: 75, max: 101, label: "Extreme Greed", desc: "Euphoria. Historically, a caution zone." },
      ],
      why: 'A contrarian indicator. "Be fearful when others are greedy, and greedy when others are fearful." Useful to avoid buying emotional tops.',
    },
    ethGas: {
      sym: "GWEI",
      title: "ETH Gas",
      what: "Cost of processing transactions on Ethereum, measured in gwei (1 gwei = 0.000000001 ETH). The busier the network, the more expensive.",
      zones: [
        { range: "< 20 gwei", min: 0, max: 20, label: "Quiet", desc: "Idle network. Good time to move ETH and run swaps." },
        { range: "20 – 60 gwei", min: 20, max: 60, label: "Normal", desc: "Standard network activity." },
        { range: "> 60 gwei", min: 60, max: Infinity, label: "Congested", desc: "Mints, airdrops or high volatility. Wait if you can." },
      ],
      why: "Real-time indicator of Ethereum on-chain activity. Spikes usually coincide with market events (mints, liquidations, launches).",
    },
  },
};

function activeZoneIndex(value, zones) {
  if (value == null || isNaN(value)) return -1;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (value >= z.min && value < z.max) return i;
  }
  return -1;
}

export function IndicatorModal({ indicator, onClose }) {
  const { locale, t } = useLocale();
  const trapRef = useFocusTrap(!!indicator);
  const data = indicator ? (INDICATORS[locale] || INDICATORS.es)[indicator.key] : null;

  useEffect(() => {
    if (!indicator) return;
    document.body.style.overflow = "hidden";
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [indicator, onClose]);

  if (!indicator || !data) return null;

  const activeIdx = activeZoneIndex(indicator.matchValue, data.zones);

  return createPortal(
    <div className="bl-modal-overlay open" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={data.title} ref={trapRef}>
      <div className="bl-modal bl-indicator-modal">
        <button className="bl-modal-close" onClick={onClose} aria-label={t("common.close")}>&#x2715;</button>

        <div className="bl-indicator-modal-header">
          <div className="bl-indicator-modal-sym">{data.sym}</div>
          <div className="bl-indicator-modal-name">{data.title}</div>
          {indicator.displayValue != null && (
            <div className="bl-indicator-modal-current">
              <span className="bl-indicator-modal-current-label">{t("indicator.now")}</span>
              <span className="bl-indicator-modal-current-value">{indicator.displayValue}</span>
            </div>
          )}
        </div>

        <div className="bl-indicator-modal-section">
          <div className="bl-indicator-modal-label">{t("indicator.whatIs")}</div>
          <p className="bl-indicator-modal-text">{data.what}</p>
        </div>

        <div className="bl-indicator-modal-section">
          <div className="bl-indicator-modal-label">{t("indicator.howToRead")}</div>
          <div className="bl-indicator-modal-zones">
            {data.zones.map((z, i) => (
              <div className={`bl-indicator-zone${i === activeIdx ? " active" : ""}`} key={i}>
                <div className="bl-indicator-zone-range">{z.range}</div>
                <div className="bl-indicator-zone-label">{z.label}</div>
                <div className="bl-indicator-zone-desc">{z.desc}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bl-indicator-modal-section">
          <div className="bl-indicator-modal-label">{t("indicator.whyMatters")}</div>
          <p className="bl-indicator-modal-text">{data.why}</p>
        </div>
      </div>
    </div>,
    document.body
  );
}
