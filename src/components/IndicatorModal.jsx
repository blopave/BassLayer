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
    MVRV: {
      sym: "MVRV.Z", title: "MVRV Z-Score",
      what: "Compara el precio de mercado con el precio promedio al que compró toda la red. Mide qué tan caro o barato está BTC respecto de lo que en promedio pagó todo el mundo.",
      zones: [
        { range: "< 0", min: -Infinity, max: 0, label: "Fondo / infravalorado", desc: "El mercado en promedio está en pérdida. Marcó los pisos de ciclo." },
        { range: "0 – 3", min: 0, max: 3, label: "Zona media", desc: "Valuación normal, ni euforia ni pánico." },
        { range: "3 – 7", min: 3, max: 7, label: "Recalentando", desc: "Empieza a estar caro. Precaución." },
        { range: "> 7", min: 7, max: Infinity, label: "Techo / euforia", desc: "Sobrevaluación extrema. Marcó los techos de ciclo." },
      ],
      why: "Uno de los indicadores más confiables para ubicar fondos y techos de ciclo sin depender del calendario.",
    },
    P200W: {
      sym: "200W.MA", title: "Media móvil de 200 semanas",
      what: "El promedio del precio de las últimas 200 semanas (~4 años). Suaviza todo el ruido y marca la tendencia de fondo del ciclo. Este valor es la distancia del precio a esa media.",
      zones: [
        { range: "< 0%", min: -Infinity, max: 0, label: "Precio bajo la media", desc: "El precio perforó la 200W. Solo pasó en los peores momentos de cada bear (2015, 2019, 2022). Suele coincidir con el fondo." },
        { range: "0 – 20%", min: 0, max: 20, label: "Pegado a la media", desc: "Cerca del piso histórico. Los fondos rebotan acá." },
        { range: "20 – 100%", min: 20, max: 100, label: "Por encima", desc: "En tendencia, alejándose del piso." },
        { range: "> 100%", min: 100, max: Infinity, label: "Muy extendido", desc: "Muy por encima de su media de largo plazo. Zona de techo." },
      ],
      why: "En cada bear market el precio toca o perfora esta media y rebota. Es uno de los soportes de largo plazo más observados.",
    },
    PUELL: {
      sym: "PUELL", title: "Puell Multiple",
      what: "Compara los ingresos diarios de los mineros con su promedio del último año. Cuando los mineros ganan poco (y venden poco), suele ser cerca del fondo.",
      zones: [
        { range: "< 0.5", min: -Infinity, max: 0.5, label: "Fondo / descuento", desc: "Mineros bajo presión. Zona de acumulación histórica." },
        { range: "0.5 – 1.5", min: 0.5, max: 1.5, label: "Normal", desc: "Ingresos de minería en su rango habitual." },
        { range: "1.5 – 4", min: 1.5, max: 4, label: "Recalentando", desc: "Mineros ganando de más. Precaución." },
        { range: "> 4", min: 4, max: Infinity, label: "Techo", desc: "Euforia de ingresos de minería. Marcó techos de ciclo." },
      ],
      why: "Conecta la salud económica de los mineros con el ciclo de precio. Bajo = poca presión de venta, típico de pisos.",
    },
    NUPL: {
      sym: "NUPL", title: "Net Unrealized Profit/Loss",
      what: "La ganancia o pérdida 'en papel' de toda la red, en proporción. Te dice si, en conjunto, el mercado está en ganancia o en pérdida, y cuánto.",
      zones: [
        { range: "< 0", min: -Infinity, max: 0, label: "Capitulación", desc: "La red en promedio está en pérdida. Miedo extremo. Zona de fondo." },
        { range: "0 – 0.25", min: 0, max: 0.25, label: "Esperanza / miedo", desc: "Ganancias chicas. Recuperación temprana o duda." },
        { range: "0.25 – 0.5", min: 0.25, max: 0.5, label: "Optimismo", desc: "Ganancias sólidas. Mercado sano." },
        { range: "0.5 – 0.75", min: 0.5, max: 0.75, label: "Creencia", desc: "Ganancias grandes. Empieza la euforia." },
        { range: "> 0.75", min: 0.75, max: Infinity, label: "Euforia", desc: "Casi todos en ganancia. Zona de techo." },
      ],
      why: "Mide la psicología del mercado con datos reales. Clave de fondo: cuando cruza por debajo de 0, históricamente marcó el piso.",
    },
    RPRICE: {
      sym: "RLZ.PRICE", title: "Realized Price",
      what: "El realized price es el 'costo base' promedio de la red: a qué precio se movió por última vez cada BTC. Este valor es la relación precio de mercado / realized: >1 el mercado está en ganancia, <1 en pérdida.",
      zones: [
        { range: "< 1", min: -Infinity, max: 1, label: "Bajo el costo base", desc: "El mercado en promedio está en pérdida. Condición clásica de fondo." },
        { range: "1 – 1.5", min: 1, max: 1.5, label: "Ganancia leve", desc: "Apenas por encima del costo base." },
        { range: "1.5 – 3", min: 1.5, max: 3, label: "En ganancia", desc: "Mercado cómodo, en profit." },
        { range: "> 3", min: 3, max: Infinity, label: "Sobrecalentado", desc: "Muy por encima del costo base. Zona de techo." },
      ],
      why: "Cuando el precio cae por debajo del realized price, el mercado entero queda bajo el agua — algo que solo pasa en los fondos de ciclo.",
    },
    STH: {
      sym: "STH.COST", title: "Costo base de holders de corto plazo",
      what: "El precio promedio al que compraron los holders recientes (menos de ~5 meses, las 'manos débiles'). Este valor es la relación precio / ese costo base: <1 significa que los compradores recientes están en pérdida.",
      zones: [
        { range: "< 1", min: -Infinity, max: 1, label: "STH bajo el agua", desc: "Los compradores recientes están en pérdida. Típico de bear tardío / capitulación." },
        { range: "1 – 1.2", min: 1, max: 1.2, label: "En el límite", desc: "Precio cerca del costo base de los recién llegados. Suele actuar de soporte/resistencia." },
        { range: "> 1.2", min: 1.2, max: Infinity, label: "STH en ganancia", desc: "Los recién llegados ganan. Momentum alcista." },
      ],
      why: "Marca el 'dolor' de los que compraron último. Cuando están en pérdida sostenida, suele ser parte de la formación de un fondo.",
    },
    PHASE: {
      sym: "FASE", title: "Fase del ciclo",
      what: "En qué tramo del ciclo de halving estamos. Cada ciclo (~4 años) atraviesa tres fases medibles.",
      zones: [
        { range: "Halving → Pico", min: 0, max: 1, label: "Markup", desc: "El precio sube. Es el bull run." },
        { range: "Pico → Fondo", min: 1, max: 2, label: "Markdown", desc: "El precio baja. Es el bear market." },
        { range: "Fondo → Halving", min: 2, max: 3, label: "Acumulación", desc: "Lateral. Las manos fuertes compran barato." },
      ],
      why: "Saber en qué fase estás es más útil que cualquier precio: define si toca acumular, aguantar o tomar ganancias.",
    },
    PRICE: {
      sym: "BTC", title: "Precio y soporte 200W",
      what: "El precio actual de Bitcoin (en vivo) y su distancia a la media de 200 semanas, el soporte de largo plazo del ciclo.",
      zones: [
        { range: "< 0%", min: -Infinity, max: 0, label: "Bajo la 200W", desc: "Precio por debajo del soporte de 4 años. Zona de fondo." },
        { range: "0 – 20%", min: 0, max: 20, label: "Pegado al soporte", desc: "Cerca del piso histórico." },
        { range: "> 20%", min: 20, max: Infinity, label: "En tendencia", desc: "Alejándose del soporte, al alza." },
      ],
      why: "El precio es el dato en vivo; la 200W te dice si está caro o barato respecto de su promedio de 4 años.",
    },
    CONFLUENCE: {
      sym: "CONF", title: "Confluencia de ciclo",
      what: "Un puntaje 0–100 que resume dónde estamos en el ciclo combinando todos los indicadores on-chain. 0 = fondo/capitulación, 100 = techo/euforia.",
      zones: [
        { range: "0 – 25", min: 0, max: 25, label: "Acumulación", desc: "Indicadores en zona baja. Históricamente, momento de acumular." },
        { range: "25 – 50", min: 25, max: 50, label: "Recuperación", desc: "Saliendo del fondo, todavía barato." },
        { range: "50 – 75", min: 50, max: 75, label: "Expansión", desc: "Tendencia alcista, valuaciones subiendo." },
        { range: "75 – 100", min: 75, max: 101, label: "Euforia", desc: "Zona de techo. Precaución, tomar ganancias." },
      ],
      why: "Convierte seis indicadores en un solo número para saber, de un vistazo, en qué parte del ciclo estás.",
    },
    PROJBOTTOM: {
      sym: "FONDO", title: "Fondo proyectado",
      what: "La ventana donde el modelo espera el fondo del ciclo, calculada desde el pico + la duración histórica de la fase bajista (~363–410 días).",
      zones: [
        { range: "Base", min: 0, max: 1, label: "El patrón se sostiene", desc: "Si la fase bajista dura lo histórico → oct–nov 2026." },
        { range: "Comprimido", min: 1, max: 2, label: "El ciclo se acortó", desc: "El fondo pudo haber sido antes de lo proyectado." },
        { range: "Extendido", min: 2, max: 3, label: "El ciclo se alarga", desc: "El fondo se corre hacia adelante." },
      ],
      why: "No es una fecha exacta, es una ventana. Sirve para saber cuándo empezar a prestar atención, no para clavar el día.",
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
    MVRV: {
      sym: "MVRV.Z", title: "MVRV Z-Score",
      what: "Compares the market price to the average price at which the whole network bought. Measures how expensive or cheap BTC is versus what everyone paid on average.",
      zones: [
        { range: "< 0", min: -Infinity, max: 0, label: "Bottom / undervalued", desc: "Network on average at a loss. Marked cycle bottoms." },
        { range: "0 – 3", min: 0, max: 3, label: "Mid zone", desc: "Normal valuation, no euphoria or panic." },
        { range: "3 – 7", min: 3, max: 7, label: "Heating up", desc: "Getting expensive. Caution." },
        { range: "> 7", min: 7, max: Infinity, label: "Top / euphoria", desc: "Extreme overvaluation. Marked cycle tops." },
      ],
      why: "One of the most reliable indicators to locate cycle bottoms and tops without relying on the calendar.",
    },
    P200W: {
      sym: "200W.MA", title: "200-week moving average",
      what: "The average price of the last 200 weeks (~4 years). Smooths out the noise and marks the cycle's underlying trend. This value is the price's distance to that average.",
      zones: [
        { range: "< 0%", min: -Infinity, max: 0, label: "Price below the MA", desc: "Price pierced the 200W. Only happened in the worst moments of each bear (2015, 2019, 2022). Usually coincides with the bottom." },
        { range: "0 – 20%", min: 0, max: 20, label: "Hugging the MA", desc: "Near the historic floor. Cycle bottoms bounce here." },
        { range: "20 – 100%", min: 20, max: 100, label: "Above", desc: "Trending, moving away from the floor." },
        { range: "> 100%", min: 100, max: Infinity, label: "Very extended", desc: "Far above its long-term average. Top zone." },
      ],
      why: "In every bear market the price touches or pierces this average and bounces. One of the most-watched long-term supports.",
    },
    PUELL: {
      sym: "PUELL", title: "Puell Multiple",
      what: "Compares miners' daily revenue to their yearly average. When miners earn little (and sell little), it's usually near the bottom.",
      zones: [
        { range: "< 0.5", min: -Infinity, max: 0.5, label: "Bottom / discount", desc: "Miners under pressure. Historic accumulation zone." },
        { range: "0.5 – 1.5", min: 0.5, max: 1.5, label: "Normal", desc: "Mining revenue in its usual range." },
        { range: "1.5 – 4", min: 1.5, max: 4, label: "Heating up", desc: "Miners earning too much. Caution." },
        { range: "> 4", min: 4, max: Infinity, label: "Top", desc: "Mining-revenue euphoria. Marked cycle tops." },
      ],
      why: "Links miners' economic health to the price cycle. Low = little sell pressure, typical of floors.",
    },
    NUPL: {
      sym: "NUPL", title: "Net Unrealized Profit/Loss",
      what: "The 'paper' profit or loss of the entire network, as a ratio. Tells you whether, collectively, the market is in profit or loss, and by how much.",
      zones: [
        { range: "< 0", min: -Infinity, max: 0, label: "Capitulation", desc: "Network on average at a loss. Extreme fear. Bottom zone." },
        { range: "0 – 0.25", min: 0, max: 0.25, label: "Hope / fear", desc: "Small gains. Early recovery or doubt." },
        { range: "0.25 – 0.5", min: 0.25, max: 0.5, label: "Optimism", desc: "Solid gains. Healthy market." },
        { range: "0.5 – 0.75", min: 0.5, max: 0.75, label: "Belief", desc: "Large gains. Euphoria begins." },
        { range: "> 0.75", min: 0.75, max: Infinity, label: "Euphoria", desc: "Almost everyone in profit. Top zone." },
      ],
      why: "Measures market psychology with real data. Bottom tell: when it crosses below 0, it historically marked the floor.",
    },
    RPRICE: {
      sym: "RLZ.PRICE", title: "Realized Price",
      what: "Realized price is the network's average 'cost basis': the price at which each BTC last moved. This value is the market price / realized ratio: >1 the market is in profit, <1 at a loss.",
      zones: [
        { range: "< 1", min: -Infinity, max: 1, label: "Below cost basis", desc: "Market on average at a loss. Classic bottom condition." },
        { range: "1 – 1.5", min: 1, max: 1.5, label: "Slight profit", desc: "Just above cost basis." },
        { range: "1.5 – 3", min: 1.5, max: 3, label: "In profit", desc: "Comfortable market, in the green." },
        { range: "> 3", min: 3, max: Infinity, label: "Overheated", desc: "Far above cost basis. Top zone." },
      ],
      why: "When price falls below realized price, the whole market is underwater — something that only happens at cycle bottoms.",
    },
    STH: {
      sym: "STH.COST", title: "Short-term holder cost basis",
      what: "The average price recent holders paid (less than ~5 months, the 'weak hands'). This value is the price / that cost basis ratio: <1 means recent buyers are at a loss.",
      zones: [
        { range: "< 1", min: -Infinity, max: 1, label: "STH underwater", desc: "Recent buyers at a loss. Typical of late bear / capitulation." },
        { range: "1 – 1.2", min: 1, max: 1.2, label: "At the edge", desc: "Price near newcomers' cost basis. Often acts as support/resistance." },
        { range: "> 1.2", min: 1.2, max: Infinity, label: "STH in profit", desc: "Newcomers in profit. Bullish momentum." },
      ],
      why: "Marks the pain of the latest buyers. Sustained losses there are usually part of forming a bottom.",
    },
    PHASE: {
      sym: "FASE", title: "Cycle phase",
      what: "Which stretch of the halving cycle we're in. Each cycle (~4 years) goes through three measurable phases.",
      zones: [
        { range: "Halving → Peak", min: 0, max: 1, label: "Markup", desc: "Price rises. The bull run." },
        { range: "Peak → Bottom", min: 1, max: 2, label: "Markdown", desc: "Price falls. The bear market." },
        { range: "Bottom → Halving", min: 2, max: 3, label: "Accumulation", desc: "Sideways. Strong hands buy cheap." },
      ],
      why: "Knowing which phase you're in beats any price: it defines whether to accumulate, hold, or take profits.",
    },
    PRICE: {
      sym: "BTC", title: "Price and 200W support",
      what: "The current Bitcoin price (live) and its distance to the 200-week moving average, the cycle's long-term support.",
      zones: [
        { range: "< 0%", min: -Infinity, max: 0, label: "Below the 200W", desc: "Price under the 4-year support. Bottom zone." },
        { range: "0 – 20%", min: 0, max: 20, label: "Hugging support", desc: "Near the historic floor." },
        { range: "> 20%", min: 20, max: Infinity, label: "Trending", desc: "Moving away from support, upward." },
      ],
      why: "Price is the live figure; the 200W tells you if it's cheap or expensive versus its 4-year average.",
    },
    CONFLUENCE: {
      sym: "CONF", title: "Cycle confluence",
      what: "A 0–100 score that sums up where we are in the cycle by combining all the on-chain indicators. 0 = bottom/capitulation, 100 = top/euphoria.",
      zones: [
        { range: "0 – 25", min: 0, max: 25, label: "Accumulation", desc: "Indicators in the low zone. Historically, time to accumulate." },
        { range: "25 – 50", min: 25, max: 50, label: "Recovery", desc: "Coming off the bottom, still cheap." },
        { range: "50 – 75", min: 50, max: 75, label: "Expansion", desc: "Uptrend, valuations rising." },
        { range: "75 – 100", min: 75, max: 101, label: "Euphoria", desc: "Top zone. Caution, take profits." },
      ],
      why: "Turns six indicators into a single number so you know, at a glance, which part of the cycle you're in.",
    },
    PROJBOTTOM: {
      sym: "FONDO", title: "Projected bottom",
      what: "The window where the model expects the cycle bottom, computed from the peak + the historic duration of the down phase (~363–410 days).",
      zones: [
        { range: "Base", min: 0, max: 1, label: "Pattern holds", desc: "If the down phase lasts the historic length → Oct–Nov 2026." },
        { range: "Compressed", min: 1, max: 2, label: "Cycle shortened", desc: "The bottom may have come earlier than projected." },
        { range: "Extended", min: 2, max: 3, label: "Cycle stretches", desc: "The bottom moves further out." },
      ],
      why: "It's not an exact date, it's a window. Useful to know when to start paying attention, not to nail the day.",
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
