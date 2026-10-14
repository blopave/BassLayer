// Las monedas del ticker de Layer y sus ids en cada fuente.

export const COIN_IDS_STR = "bitcoin,ethereum,solana,arbitrum,chainlink,aave,uniswap,optimism";
export const COIN_IDS = new Set(COIN_IDS_STR.split(","));
export const PAPRIKA_ID = { bitcoin: "btc-bitcoin", ethereum: "eth-ethereum", solana: "sol-solana", arbitrum: "arb-arbitrum", chainlink: "link-chainlink", aave: "aave-new", uniswap: "uni-uniswap", optimism: "op-optimism" };
