-- ─────────────────────────────────────────────────────────────
--  Meal App — database setup
--  Run this ONCE in Supabase: left sidebar → SQL Editor → New query
--  → paste all of this → Run.
-- ─────────────────────────────────────────────────────────────

-- Each "like" a person taps.
create table if not exists picks (
  id         bigint generated always as identity primary key,
  voter      text not null,              -- 'Grace' or 'Partner'
  recipe_id  int  not null,
  created_at timestamptz default now(),
  unique (voter, recipe_id)
);

-- The meals you've locked in for the week.
create table if not exists locked_meals (
  recipe_id  int primary key,
  created_at timestamptz default now()
);

-- Turn on live sync so both phones update in real time.
alter publication supabase_realtime add table picks;
alter publication supabase_realtime add table locked_meals;

-- Security: it's a private two-person app, so allow the anon key
-- to read/write these two tables (and nothing else in your project).
alter table picks enable row level security;
alter table locked_meals enable row level security;

create policy "anyone can read picks"   on picks for select using (true);
create policy "anyone can write picks"  on picks for insert with check (true);
create policy "anyone can delete picks" on picks for delete using (true);

create policy "anyone can read locked"   on locked_meals for select using (true);
create policy "anyone can write locked"  on locked_meals for insert with check (true);
create policy "anyone can delete locked" on locked_meals for delete using (true);
