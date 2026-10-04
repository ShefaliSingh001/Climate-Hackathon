-- CircuLink: producers (supply) and manufacturers (demand). SQLite.
--
-- Producers offer recycled material; manufacturers post tenders for it.
-- The same business (same ABN) can appear in both tables.
-- Money is AUD excluding GST and transport; quantities are metric tonnes.
-- Dates are ISO 8601 text ('2026-11-01'); timestamps are UTC text.

pragma foreign_keys = on;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------

-- Materials both sides can trade. Text keys match the frontend's MaterialKey
-- ('steel', 'copper', ...), so the API can pass them through unchanged.
create table if not exists materials (
  key    text primary key,
  label  text not null,
  family text not null check (family in ('ferrous', 'non_ferrous', 'other'))
);

insert or ignore into materials (key, label, family) values
  ('steel',     'Steel',                     'ferrous'),
  ('alloys',    'Stainless & other alloys',  'ferrous'),
  ('aluminium', 'Aluminium',                 'non_ferrous'),
  ('copper',    'Copper',                    'non_ferrous'),
  ('brass',     'Brass',                     'non_ferrous'),
  ('plastics',  'Plastics',                  'other'),
  ('paper',     'Paper & card',              'other'),
  ('glass',     'Glass',                     'other'),
  ('ewaste',    'E-scrap',                   'other');

-- Quality grade, ranked lowest to highest so a join on rank means "at least this good".
-- A manufacturer asking for 'medium' can be matched with 'medium' or 'high'.
create table if not exists grades (
  key   text primary key,
  label text not null,
  rank  integer not null unique
);

insert or ignore into grades (key, label, rank) values
  ('short_use', 'Short use',      1),
  ('medium',    'Medium quality', 2),
  ('high',      'High quality',   3);

-- ---------------------------------------------------------------------
-- Producers (supply)
-- ---------------------------------------------------------------------

create table if not exists producers (
  id                 integer primary key,

  -- business identity
  name               text not null,
  abn                text not null check (length(abn) = 11 and abn not glob '*[^0-9]*'),
  legal_entity       text,                         -- registered name on ABN Lookup
  activity           text,                         -- what the business publicly says it does
  website            text,

  -- location
  locality           text not null,                -- suburb / town, e.g. 'Silverwater'
  address            text,                         -- street address, blank if unpublished
  postcode           text check (postcode is null or (length(postcode) = 4 and postcode not glob '*[^0-9]*')),
  state              text not null default 'NSW'
                       check (state in ('NSW','VIC','QLD','SA','WA','TAS','ACT','NT')),
  lat                real check (lat between -90 and 90),
  lng                real check (lng between -180 and 180),
  geo_source         text check (geo_source in ('npi', 'locality', 'user')), -- npi = facility, locality = suburb centre

  -- what they produce
  material_focus     text,                         -- free text from the sign-up form
  input_materials    text not null,                -- e.g. 'Steel plate, sheet and coil'
  output_material    text not null references materials (key),
  output_quantity_t  real not null check (output_quantity_t > 0),
  output_grade       text not null references grades (key),
  compliance         text not null default '[]',   -- JSON array, e.g. '["Cert A","Cert C"]'
  price_aud_per_t    real not null check (price_aud_per_t >= 0),
  supply_start       text,
  supply_end         text,

  -- bookkeeping
  is_synthetic       integer not null default 0 check (is_synthetic in (0, 1)), -- 1 for the demo dataset
  created_at         text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at         text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  check (json_valid(compliance) and json_type(compliance) = 'array'),
  check (supply_end is null or supply_start is null or supply_end >= supply_start)
);

create index if not exists producers_material_grade_idx on producers (output_material, output_grade);
create index if not exists producers_abn_idx on producers (abn);

-- ---------------------------------------------------------------------
-- Manufacturers (demand)
-- ---------------------------------------------------------------------

create table if not exists manufacturers (
  id                     integer primary key,

  -- business identity
  name                   text not null,
  abn                    text not null check (length(abn) = 11 and abn not glob '*[^0-9]*'),
  legal_entity           text,
  activity               text,
  website                text,

  -- location
  locality               text not null,
  address                text,
  postcode               text check (postcode is null or (length(postcode) = 4 and postcode not glob '*[^0-9]*')),
  state                  text not null default 'NSW'
                           check (state in ('NSW','VIC','QLD','SA','WA','TAS','ACT','NT')),
  lat                    real check (lat between -90 and 90),
  lng                    real check (lng between -180 and 180),
  geo_source             text check (geo_source in ('npi', 'locality', 'user')),

  -- what they need
  required_material      text not null references materials (key),
  product                text,                     -- what they make with it
  required_quantity_t    real not null check (required_quantity_t > 0),
  budget_aud             real not null check (budget_aud >= 0), -- total for the tender
  max_price_aud_per_t    real generated always as (round(budget_aud / required_quantity_t, 2)) stored,
  output_grade_request   text not null references grades (key),
  order_by               text not null,            -- timeframe: order deadline
  deliver_by             text not null,            -- timeframe: delivery deadline
  purchase_start         text,
  purchase_end           text,

  -- bookkeeping
  is_synthetic           integer not null default 0 check (is_synthetic in (0, 1)),
  created_at             text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at             text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  check (deliver_by >= order_by),
  check (purchase_end is null or purchase_start is null or purchase_end >= purchase_start)
);

create index if not exists manufacturers_material_grade_idx on manufacturers (required_material, output_grade_request);
create index if not exists manufacturers_abn_idx on manufacturers (abn);

-- ---------------------------------------------------------------------
-- Accounts (logins) and sessions
--
-- One account per email. A seller's account links to the producers row it
-- registered with, a buyer's to its manufacturers row. Passwords are stored
-- only as PBKDF2-SHA256 hashes ('pbkdf2_sha256$<iterations>$<salt>$<hash>').
-- ---------------------------------------------------------------------

create table if not exists accounts (
  id                integer primary key,
  email             text not null unique check (email = lower(email) and email like '%_@_%'),
  password_hash     text not null,
  name              text not null,
  company           text not null,
  abn               text not null check (length(abn) = 11 and abn not glob '*[^0-9]*'),
  role              text not null check (role in ('buyer', 'seller')),
  locality          text not null,
  state             text not null check (state in ('NSW','VIC','QLD','SA','WA','TAS','ACT','NT')),
  lat               real not null check (lat between -90 and 90),
  lng               real not null check (lng between -180 and 180),
  producer_id       integer references producers (id) on delete set null,
  manufacturer_id   integer references manufacturers (id) on delete set null,
  is_demo           integer not null default 0 check (is_demo in (0, 1)),
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Login sessions. Only a SHA-256 hash of the bearer token is stored.
create table if not exists sessions (
  token_hash  text primary key,
  account_id  integer not null references accounts (id) on delete cascade,
  created_at  text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  expires_at  text not null
);

create index if not exists sessions_account_idx on sessions (account_id);

-- ---------------------------------------------------------------------
-- Enquiries (quote requests sent from a listing page or a combined order)
-- ---------------------------------------------------------------------

create table if not exists enquiries (
  id                integer primary key,
  producer_id       integer references producers (id) on delete cascade,
  manufacturer_id   integer references manufacturers (id) on delete cascade,
  tonnes_per_month  real not null check (tonnes_per_month > 0),
  first_delivery    text not null,
  message           text not null default '',
  account_id        integer references accounts (id) on delete set null, -- who sent it
  created_at        text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  check ((producer_id is null) <> (manufacturer_id is null)) -- exactly one listing
);

-- ---------------------------------------------------------------------
-- Collaborations: several sellers filling one buyer request together
--
-- One row per team; collaboration_members has one row per seller in it.
-- The member with status 'lead' runs the team and sends the joint offer.
-- ---------------------------------------------------------------------

create table if not exists collaborations (
  id                     integer primary key,
  manufacturer_id        integer not null references manufacturers (id) on delete cascade, -- the buyer request
  created_by_account_id  integer references accounts (id) on delete set null,
  status                 text not null default 'forming' check (status in ('forming', 'offer_sent', 'withdrawn')),
  message                text not null default '',
  is_synthetic           integer not null default 0 check (is_synthetic in (0, 1)),
  created_at             text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at             text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

create table if not exists collaboration_members (
  id                integer primary key,
  collaboration_id  integer not null references collaborations (id) on delete cascade,
  producer_id       integer references producers (id) on delete set null, -- null for a lead with no listing
  name              text not null,
  abn               text not null check (length(abn) = 11 and abn not glob '*[^0-9]*'),
  locality          text not null,
  state             text not null check (state in ('NSW','VIC','QLD','SA','WA','TAS','ACT','NT')),
  tonnes            real not null check (tonnes >= 0),   -- per month
  price_aud_per_t   real not null default 0 check (price_aud_per_t >= 0),
  distance_km       real not null default 0 check (distance_km >= 0), -- yard to the buyer
  status            text not null check (status in ('lead', 'invited', 'accepted', 'declined')),
  responded_at      text,
  unique (collaboration_id, abn)
);

create index if not exists collaboration_members_abn_idx on collaboration_members (abn);

-- ---------------------------------------------------------------------
-- Orders (quote requests, offers and joint offers, then their delivery)
--
-- Both parties are copied onto the order (name, ABN, place), because a party
-- may be a dataset business with no account, or a listing that later changes.
-- An account sees the orders whose buyer_abn or seller_abn is its ABN.
-- ---------------------------------------------------------------------

create table if not exists orders (
  id                 integer primary key,
  producer_id        integer references producers (id) on delete set null,     -- supply listing, if any
  manufacturer_id    integer references manufacturers (id) on delete set null, -- buyer request, if any
  buyer_name         text not null,
  buyer_abn          text not null check (length(buyer_abn) = 11 and buyer_abn not glob '*[^0-9]*'),
  buyer_locality     text not null,
  buyer_state        text not null check (buyer_state in ('NSW','VIC','QLD','SA','WA','TAS','ACT','NT')),
  seller_name        text not null,
  seller_abn         text not null check (length(seller_abn) = 11 and seller_abn not glob '*[^0-9]*'),
  seller_locality    text not null,
  seller_state       text not null check (seller_state in ('NSW','VIC','QLD','SA','WA','TAS','ACT','NT')),
  material           text not null references materials (key),
  grade              text not null,                        -- label, e.g. 'High quality'
  tonnes             real not null check (tonnes > 0),
  price_aud_per_t    real not null check (price_aud_per_t >= 0),
  freight_aud_per_t  real not null default 0 check (freight_aud_per_t >= 0),
  distance_km        real not null default 0 check (distance_km >= 0),
  status             text not null default 'pending'
                       check (status in ('pending', 'confirmed', 'in_transit', 'delivered', 'cancelled')),
  placed_at          text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  delivery_date      text not null,                        -- expected, or actual once delivered
  co2e_avoided_t     real not null default 0,              -- net of trucking
  collaboration_id   integer references collaborations (id) on delete set null,
  partners           text not null default '[]',           -- JSON array of partner company names (joint orders)
  enquiry_id         integer references enquiries (id) on delete set null,
  is_synthetic       integer not null default 0 check (is_synthetic in (0, 1)),
  created_at         text not null default (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),

  check (json_valid(partners) and json_type(partners) = 'array')
);

create index if not exists orders_buyer_abn_idx on orders (buyer_abn);
create index if not exists orders_seller_abn_idx on orders (seller_abn);

-- ---------------------------------------------------------------------
-- Keep updated_at current (recursive_triggers is off by default, so the
-- inner update does not re-fire the trigger)
-- ---------------------------------------------------------------------

create trigger if not exists producers_set_updated_at
  after update on producers for each row
begin
  update producers set updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') where id = new.id;
end;

create trigger if not exists manufacturers_set_updated_at
  after update on manufacturers for each row
begin
  update manufacturers set updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') where id = new.id;
end;

create trigger if not exists collaborations_set_updated_at
  after update on collaborations for each row
begin
  update collaborations set updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') where id = new.id;
end;
