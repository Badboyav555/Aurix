-- ============================================================================
-- AURIX · SIMULATED CRYPTO WALLET — DATABASE SCHEMA
-- Run the whole file in the Supabase SQL Editor.
--
-- ⚠ SIMULATOR ARCHITECTURE NOTICE
-- This project intentionally does NOT use Supabase Auth. Because unauthenticated
-- `anon` clients must read/write tables, the RLS policies below are opened to
-- `anon` so the demo can function. This is acceptable ONLY for a simulator.
-- Never connect real funds, real credentials, or a production workload to it.
-- Only the anon/public key belongs in frontend code — never the service-role key.
-- ============================================================================

create extension if not exists pgcrypto;

-- ============================== USERS =======================================
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique check (char_length(username) between 3 and 24),
  email         text unique,
  mobile        text not null unique,
  password_hash text not null,                       -- format: "salt:sha256(salt || password)"
  role          text not null default 'user' check (role in ('user','admin')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_login    timestamptz
);

-- ============================== WALLETS =====================================
create table if not exists public.wallets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  wallet_address text not null unique,
  btc_balance    numeric(20,8) not null default 0 check (btc_balance >= 0),
  eth_balance    numeric(20,8) not null default 0 check (eth_balance  >= 0),
  usdt_balance   numeric(20,8) not null default 0 check (usdt_balance >= 0),
  sol_balance    numeric(20,8) not null default 0 check (sol_balance  >= 0),
  xrp_balance    numeric(20,8) not null default 0 check (xrp_balance  >= 0),
  doge_balance   numeric(20,8) not null default 0 check (doge_balance >= 0),
  bnb_balance    numeric(20,8) not null default 0 check (bnb_balance  >= 0),
  inr_balance    numeric(20,2) not null default 0 check (inr_balance  >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (user_id)
);

-- ============================= TRANSACTIONS ==================================
create table if not exists public.transactions (
  id               uuid primary key default gen_random_uuid(),
  sender_id        uuid references public.users(id) on delete set null,
  receiver_id      uuid references public.users(id) on delete set null,
  coin             text not null check (coin in ('BTC','ETH','USDT','SOL','XRP','DOGE','BNB','INR')),
  amount           numeric(30,8) not null check (amount > 0),
  amount_inr       numeric(20,2) not null default 0,
  tx_hash          text not null,
  note             text,
  status           text not null default 'Processing' check (status in ('Processing','Completed','Failed','Rejected')),
  confirmations    int  not null default 0 check (confirmations between 0 and 64),
  transaction_type text not null check (transaction_type in ('sent','received','withdrawal','admin_credit','admin_debit')),
  created_at       timestamptz not null default now()
);

-- ============================= WITHDRAWALS ===================================
create table if not exists public.withdrawals (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references public.users(id) on delete cascade,
  coin                      text not null check (coin in ('BTC','ETH','USDT','SOL','XRP','DOGE','BNB')),
  crypto_amount             numeric(30,8) not null check (crypto_amount > 0),
  amount_inr                numeric(20,2) not null check (amount_inr >= 0),
  withdrawal_method         text not null check (withdrawal_method in ('UPI','BANK')),
  upi_id                    text,
  bank_name                 text,
  account_holder_name       text,
  account_number            text,
  ifsc_code                 text,
  status                    text not null default 'Processing' check (status in ('Processing','Completed','Failed','Rejected')),
  processing_days_remaining int not null default 3 check (processing_days_remaining >= 0),
  estimated_arrival         date,
  completed_at              timestamptz,
  created_at                timestamptz not null default now(),
  check (withdrawal_method <> 'UPI'  or upi_id is not null),
  check (withdrawal_method <> 'BANK' or (bank_name is not null and account_number is not null and ifsc_code is not null))
);

-- ============================ NOTIFICATIONS ==================================
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null default 'general'
              check (type in ('general','login','security','received','sent','withdrawal','admin','announcement')),
  title       text not null,
  message     text not null,
  read_status boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ============================ MARKET PRICES ==================================
create table if not exists public.market_prices (
  id                 uuid primary key default gen_random_uuid(),
  coin_name          text not null,
  symbol             text not null unique,
  current_price_inr  numeric(20,2) not null check (current_price_inr >= 0),
  change_percentage  numeric(10,4) not null default 0,
  sparkline          jsonb,
  updated_at         timestamptz not null default now()
);

-- ============================ ANNOUNCEMENTS ==================================
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  message    text not null,
  type       text not null default 'General' check (type in ('General','Market','Maintenance','Security')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================== INDEXES ======================================
create index if not exists idx_wallets_user            on public.wallets(user_id);
create index if not exists idx_tx_sender               on public.transactions(sender_id, created_at desc);
create index if not exists idx_tx_receiver             on public.transactions(receiver_id, created_at desc);
create index if not exists idx_tx_hash                 on public.transactions(tx_hash);
create index if not exists idx_withdrawals_user        on public.withdrawals(user_id, created_at desc);
create index if not exists idx_withdrawals_status      on public.withdrawals(status);
create index if not exists idx_notifications_user      on public.notifications(user_id, created_at desc);
create index if not exists idx_notifications_unread    on public.notifications(user_id) where read_status = false;
create index if not exists idx_users_username          on public.users(username);

-- ========================= updated_at TOUCH TRIGGER ==========================
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_users_touch    on public.users;
create trigger trg_users_touch    before update on public.users    for each row execute function public.touch_updated_at();
drop trigger if exists trg_wallets_touch  on public.wallets;
create trigger trg_wallets_touch  before update on public.wallets  for each row execute function public.touch_updated_at();

-- ====================== RLS (SIMULATOR-OPEN POLICIES) ========================
-- Production systems would scope every policy to the authenticated user via
-- Supabase Auth. Since this simulator uses custom sessions, anon access is
-- required. This is the documented trade-off of the custom-auth architecture.
alter table public.users         enable row level security;
alter table public.wallets       enable row level security;
alter table public.transactions  enable row level security;
alter table public.withdrawals   enable row level security;
alter table public.notifications enable row level security;
alter table public.market_prices enable row level security;
alter table public.announcements enable row level security;

do $$ declare t text;
begin
  foreach t in array array['users','wallets','transactions','withdrawals','notifications','market_prices','announcements']
  loop
    execute format('drop policy if exists "simulator_open" on public.%I', t);
    execute format('create policy "simulator_open" on public.%I for all to anon using (true) with check (true)', t);
  end loop;
end $$;

-- ========================== REALTIME PUBLICATION =============================
do $$ declare t text;
begin
  foreach t in array array['wallets','transactions','notifications','withdrawals','market_prices','announcements']
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ============================ SEED MARKET PRICES =============================
-- Fallback prices (INR) used when the public price API is unreachable.
insert into public.market_prices (coin_name, symbol, current_price_inr, change_percentage) values
  ('Bitcoin',  'BTC', 8540000, 0),
  ('Ethereum', 'ETH',  282000, 0),
  ('Tether',   'USDT',     88, 0),
  ('Solana',   'SOL',   16200, 0),
  ('XRP',      'XRP',     182, 0),
  ('Dogecoin', 'DOGE',     14, 0),
  ('BNB',      'BNB',   52000, 0)
on conflict (symbol) do nothing;

-- ===================== FIRST ADMIN (SAFE SETUP METHOD) =======================
-- Creates an admin row whose password hash is COMPATIBLE with the frontend
-- verifier (sha256(salt || password), stored as "salt:hash"). The admin role
-- only ever comes from users.role = 'admin' — never from frontend code.
--
-- USAGE (SQL Editor):
--   select public.create_admin('admin', '9800000001', 'YourStrong#Password', 'admin@mail.com');
create or replace function public.create_admin(
  p_username text, p_mobile text, p_password text, p_email text default null
) returns uuid
language plpgsql security definer set search_path = public as $$ declare
  v_salt text := substr(encode(gen_random_bytes(8), 'hex'), 1, 16);
  v_id   uuid;
begin
  if char_length(p_password) < 8 then
    raise exception 'Admin password must be at least 8 characters';
  end if;
  insert into public.users (username, email, mobile, password_hash, role)
    values (p_username, p_email, p_mobile,
            v_salt || ':' || encode(digest(v_salt || p_password, 'sha256'), 'hex'),
            'admin')
    returning id into v_id;
  insert into public.wallets (user_id, wallet_address)
    values (v_id, '0x' || upper(substr(encode(gen_random_bytes(20), 'hex'), 1, 40)));
  return v_id;
end $$;
