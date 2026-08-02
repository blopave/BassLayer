-- Fase B · Dashboard de ciclos de halving BTC (Layer)
-- Tabla singleton para el estado curado editable desde el AdminPanel.
-- El server (service key) la lee/escribe; el precio y la 200W se computan en
-- vivo aparte (CoinGecko + Binance). El JSON data/btc-cycles.json del repo es el
-- seed inicial y el fallback si Supabase no responde.
-- Aplicada al proyecto Supabase "basslayer" (ref jbszspnwegykpnlagypf) el 2026-08-02.

create table if not exists public.btc_cycles (
  id smallint primary key default 1,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint btc_cycles_singleton check (id = 1)
);

comment on table public.btc_cycles is 'Estado curado del dashboard de ciclos de halving BTC (fila unica id=1). Editable desde el AdminPanel.';

-- RLS on, sin policies: solo el service_role (server) accede.
alter table public.btc_cycles enable row level security;
