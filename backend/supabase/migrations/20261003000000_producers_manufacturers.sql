-- CircuLink: producers (supply) and manufacturers (demand).
--
-- Producers offer recycled material; manufacturers post tenders for it.
-- The same business (same ABN) can appear in both tables.
-- Money is AUD excluding GST and transport; quantities are metric tonnes.

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------

-- Materials both sides can trade. Text keys match the frontend's MaterialKey
-- ('steel', 'copper', ...), so the API can pass them through unchanged.
create table public.materials (
  key    text primary key,
  label  text not null,
  family text not null check (family in ('ferrous', 'non_ferrous', 'other'))
);

insert into public.materials (key, label, family) values
  ('steel',     'Steel',                     'ferrous'),
  ('alloys',    'Stainless & other alloys',  'ferrous'),
  ('aluminium', 'Aluminium',                 'non_ferrous'),
  ('copper',    'Copper',                    'non_ferrous'),
  ('brass',     'Brass',                     'non_ferrous'),
  ('plastics',  'Plastics',                  'other'),
  ('paper',     'Paper & card',              'other'),
  ('glass',     'Glass',                     'other'),
  ('ewaste',    'E-scrap',                   'other');

-- Quality grade, declared lowest to highest so `>=` means "at least this good".
-- A manufacturer asking for 'medium' can be matched with 'medium' or 'high'.
create type public.material_grade as enum ('short_use', 'medium', 'high');

-- ---------------------------------------------------------------------
-- Producers (supply)
-- ---------------------------------------------------------------------

create table public.producers (
  id                 uuid primary key default gen_random_uuid(),

  -- business identity
  name               text not null,
  abn                text not null check (abn ~ '^[0-9]{11}$'),
  legal_entity       text,                         -- registered name on ABN Lookup
  activity           text,                         -- what the business publicly says it does
  website            text,

  -- location
  locality           text not null,                -- suburb / town, e.g. 'Silverwater'
  address            text,                         -- street address, blank if unpublished
  postcode           text check (postcode ~ '^[0-9]{4}$'),
  state              text not null default 'NSW'
                       check (state in ('NSW','VIC','QLD','SA','WA','TAS','ACT','NT')),
  lat                double precision check (lat between -90 and 90),
  lng                double precision check (lng between -180 and 180),

  -- what they produce
  material_focus     text,                         -- free text from the sign-up form
  input_materials    text not null,                -- e.g. 'Steel plate, sheet and coil'
  output_material    text not null references public.materials (key),
  output_quantity_t  numeric(12, 2) not null check (output_quantity_t > 0),
  output_grade       public.material_grade not null,
  compliance         text[] not null default '{}', -- e.g. {'Cert A','Cert C'}
  price_aud_per_t    numeric(12, 2) not null check (price_aud_per_t >= 0),
  supply_start       date,
  supply_end         date,

  -- bookkeeping
  is_synthetic       boolean not null default false, -- true for the demo dataset
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  check (supply_end is null or supply_start is null or supply_end >= supply_start)
);

create index producers_material_grade_idx on public.producers (output_material, output_grade);
create index producers_abn_idx on public.producers (abn);

-- ---------------------------------------------------------------------
-- Manufacturers (demand)
-- ---------------------------------------------------------------------

create table public.manufacturers (
  id                     uuid primary key default gen_random_uuid(),

  -- business identity
  name                   text not null,
  abn                    text not null check (abn ~ '^[0-9]{11}$'),
  legal_entity           text,
  activity               text,
  website                text,

  -- location
  locality               text not null,
  address                text,
  postcode               text check (postcode ~ '^[0-9]{4}$'),
  state                  text not null default 'NSW'
                           check (state in ('NSW','VIC','QLD','SA','WA','TAS','ACT','NT')),
  lat                    double precision check (lat between -90 and 90),
  lng                    double precision check (lng between -180 and 180),

  -- what they need
  required_material      text not null references public.materials (key),
  product                text,                     -- what they make with it
  required_quantity_t    numeric(12, 2) not null check (required_quantity_t > 0),
  budget_aud             numeric(14, 2) not null check (budget_aud >= 0), -- total for the tender
  max_price_aud_per_t    numeric(12, 2)
                           generated always as (round(budget_aud / required_quantity_t, 2)) stored,
  output_grade_request   public.material_grade not null,
  order_by               date not null,            -- timeframe: order deadline
  deliver_by             date not null,            -- timeframe: delivery deadline
  purchase_start         date,
  purchase_end           date,

  -- bookkeeping
  is_synthetic           boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  check (deliver_by >= order_by),
  check (purchase_end is null or purchase_start is null or purchase_end >= purchase_start)
);

create index manufacturers_material_grade_idx on public.manufacturers (required_material, output_grade_request);
create index manufacturers_abn_idx on public.manufacturers (abn);

-- ---------------------------------------------------------------------
-- Keep updated_at current
-- ---------------------------------------------------------------------

create function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger producers_set_updated_at
  before update on public.producers
  for each row execute function public.set_updated_at();

create trigger manufacturers_set_updated_at
  before update on public.manufacturers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row level security
--
-- Anyone with the anon key can read (the marketplace is public).
-- Writes go through the backend with the service_role key, which bypasses RLS,
-- so the backend can validate input (ABN format, material, grade) first.
-- ---------------------------------------------------------------------

alter table public.materials     enable row level security;
alter table public.producers     enable row level security;
alter table public.manufacturers enable row level security;

create policy "Materials are readable by everyone"
  on public.materials for select to anon, authenticated using (true);

create policy "Producers are readable by everyone"
  on public.producers for select to anon, authenticated using (true);

create policy "Manufacturers are readable by everyone"
  on public.manufacturers for select to anon, authenticated using (true);
