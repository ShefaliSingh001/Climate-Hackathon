-- =====================================================================
-- Circular Materials Matching Platform — database schema (PostgreSQL 14+)
--
-- Layers:
--   1. Reference data   : materials, synonyms, waste codes, substitutions,
--                         emission factors  (the RAG grounding layer)
--   2. Participants     : companies, permits
--   3. Marketplace      : waste_listings (supply), material_requests (demand)
--   4. Matching         : matches (scores + explanation + impact),
--                         match_labels (hand-labelled pairs for evaluation)
--
-- Embeddings are stored as REAL[] so the schema runs on plain Postgres.
-- If pgvector is available, swap REAL[] for vector(<dims>) and add an
-- ivfflat/hnsw index.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. REFERENCE DATA
-- ---------------------------------------------------------------------

-- Canonical material taxonomy (tree: plastic > HDPE > HDPE natural).
CREATE TABLE materials (
    material_id         SERIAL PRIMARY KEY,
    code                TEXT UNIQUE NOT NULL,          -- e.g. 'PLASTIC.HDPE'
    name                TEXT NOT NULL,                 -- e.g. 'High-density polyethylene'
    parent_id           INT REFERENCES materials(material_id),
    family              TEXT NOT NULL CHECK (family IN
                          ('plastic','metal','paper','wood','glass','textile',
                           'organic','mineral','chemical','electronic','other')),
    typical_properties  JSONB NOT NULL DEFAULT '{}',   -- density, melt_flow_index, ...
    quality_standard    TEXT,                          -- e.g. 'EN 643 1.05', 'ReMA Taldon'
    description         TEXT,
    embedding           REAL[]                         -- for semantic search / RAG
);

-- Synonyms / trade names so messy text resolves to one material.
CREATE TABLE material_synonyms (
    synonym_id   SERIAL PRIMARY KEY,
    material_id  INT NOT NULL REFERENCES materials(material_id) ON DELETE CASCADE,
    synonym      TEXT NOT NULL,                        -- 'HD poly', '#2 plastic', 'PE-HD'
    language     TEXT NOT NULL DEFAULT 'en',
    UNIQUE (material_id, synonym)
);
CREATE INDEX idx_material_synonyms_lower ON material_synonyms (lower(synonym));

-- Official waste codes (EU List of Waste / EWC, Basel annexes).
CREATE TABLE waste_codes (
    waste_code   TEXT PRIMARY KEY,                     -- e.g. '07 02 13'
    scheme       TEXT NOT NULL DEFAULT 'EWC' CHECK (scheme IN ('EWC','BASEL','OTHER')),
    description  TEXT NOT NULL,
    hazardous    BOOLEAN NOT NULL DEFAULT FALSE,       -- EWC codes marked '*'
    material_id  INT REFERENCES materials(material_id) -- best canonical mapping
);

-- Compatibility matrix: which secondary material can replace which virgin input.
CREATE TABLE material_substitutions (
    substitution_id        SERIAL PRIMARY KEY,
    secondary_material_id  INT NOT NULL REFERENCES materials(material_id),
    virgin_material_id     INT NOT NULL REFERENCES materials(material_id),
    application            TEXT,                       -- 'non-food packaging', 'pallets'
    max_substitution_pct   NUMERIC(5,2) CHECK (max_substitution_pct BETWEEN 0 AND 100),
    min_purity_pct         NUMERIC(5,2) CHECK (min_purity_pct BETWEEN 0 AND 100),
    required_processing    TEXT[] NOT NULL DEFAULT '{}', -- {'wash','shred','pelletise'}
    compatibility_score    NUMERIC(3,2) NOT NULL DEFAULT 1.0
                             CHECK (compatibility_score BETWEEN 0 AND 1),
    notes                  TEXT,
    source                 TEXT,                       -- citation for explainability
    UNIQUE (secondary_material_id, virgin_material_id, application)
);

-- Emission & impact factors (UK GHG conversion factors, US EPA WARM, ...).
-- material_id is NULL for non-material factors such as transport.
CREATE TABLE emission_factors (
    factor_id    SERIAL PRIMARY KEY,
    material_id  INT REFERENCES materials(material_id),
    activity     TEXT NOT NULL CHECK (activity IN
                   ('virgin_production','recycled_production','closed_loop_recycling',
                    'open_loop_recycling','landfill','incineration','composting',
                    'anaerobic_digestion','transport_road','transport_rail','transport_sea')),
    value        NUMERIC(12,4) NOT NULL,
    unit         TEXT NOT NULL CHECK (unit IN ('kgCO2e/t','kgCO2e/t.km')),
    region       TEXT NOT NULL DEFAULT 'GLOBAL',
    source       TEXT NOT NULL,                        -- 'UK DESNZ 2024', 'EPA WARM v16'
    source_year  INT,
    UNIQUE (material_id, activity, region, source)
);

-- ---------------------------------------------------------------------
-- 2. PARTICIPANTS
-- ---------------------------------------------------------------------

CREATE TABLE companies (
    company_id             SERIAL PRIMARY KEY,
    legal_name             TEXT NOT NULL,              -- hidden until match is accepted
    display_alias          TEXT NOT NULL UNIQUE,       -- 'Plastics processor #A17'
    industry_code          TEXT,                       -- NACE / SIC
    industry_label         TEXT,
    size                   TEXT CHECK (size IN ('micro','small','medium','large')),
    roles                  TEXT[] NOT NULL DEFAULT '{}'
                             CHECK (roles <@ ARRAY['generator','manufacturer','recycler',
                                    'remanufacturer','logistics']::TEXT[]),
    region                 TEXT,
    latitude               NUMERIC(9,6),
    longitude              NUMERIC(9,6),
    industrial_park        TEXT,
    verified               BOOLEAN NOT NULL DEFAULT FALSE,
    rating                 NUMERIC(2,1) CHECK (rating BETWEEN 0 AND 5),
    completed_transactions INT NOT NULL DEFAULT 0,
    contact_email          TEXT,                       -- hidden until match is accepted
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Permits/licences: used as a HARD filter for hazardous or regulated waste.
CREATE TABLE company_permits (
    permit_id    SERIAL PRIMARY KEY,
    company_id   INT NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    permit_type  TEXT NOT NULL,                        -- 'waste_carrier','waste_handling','hazardous_handling'
    waste_code   TEXT REFERENCES waste_codes(waste_code), -- NULL = covers all codes of that type
    issuer       TEXT,
    valid_until  DATE
);

-- ---------------------------------------------------------------------
-- 3. MARKETPLACE
-- ---------------------------------------------------------------------

-- Supply side: what waste generators offer.
CREATE TABLE waste_listings (
    listing_id             SERIAL PRIMARY KEY,
    company_id             INT NOT NULL REFERENCES companies(company_id),
    raw_description        TEXT NOT NULL,              -- messy user input, kept for the LLM
    -- fields below are produced by the LLM structuring step
    material_id            INT REFERENCES materials(material_id),
    waste_code             TEXT REFERENCES waste_codes(waste_code),
    form                   TEXT CHECK (form IN
                             ('offcuts','regrind','flakes','pellets','powder','sludge',
                              'liquid','bales','loose','whole_items','components','other')),
    purity_pct             NUMERIC(5,2) CHECK (purity_pct BETWEEN 0 AND 100),
    contaminants           JSONB NOT NULL DEFAULT '[]', -- [{"name":"labels","pct":2}]
    properties             JSONB NOT NULL DEFAULT '{}', -- colour, grade, MFI, moisture...
    quantity               NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit                   TEXT NOT NULL DEFAULT 't' CHECK (unit IN ('kg','t','m3','units')),
    frequency              TEXT NOT NULL CHECK (frequency IN
                             ('one_off','daily','weekly','monthly','quarterly','yearly')),
    available_from         DATE,
    available_until        DATE,
    packaging              TEXT,                       -- 'baled','drums','loose','IBC'
    storage_condition      TEXT,                       -- 'covered','outdoor','refrigerated'
    hazardous              BOOLEAN NOT NULL DEFAULT FALSE,
    current_disposal_route TEXT CHECK (current_disposal_route IN
                             ('landfill','incineration','recycling','stockpiled','other')),
    disposal_cost_per_unit NUMERIC(10,2),              -- generator's motive to sell
    asking_price_per_unit  NUMERIC(10,2),              -- negative = pays to have it removed
    currency               TEXT NOT NULL DEFAULT 'GBP',
    latitude               NUMERIC(9,6),               -- defaults to company site
    longitude              NUMERIC(9,6),
    certifications         TEXT[] NOT NULL DEFAULT '{}', -- 'lab test report','ISO 14001'
    llm_confidence         NUMERIC(3,2) CHECK (llm_confidence BETWEEN 0 AND 1),
    embedding              REAL[],
    status                 TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('draft','active','matched','closed')),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (available_until IS NULL OR available_from IS NULL OR available_until >= available_from)
);
CREATE INDEX idx_listings_material ON waste_listings (material_id) WHERE status = 'active';

-- Demand side: what manufacturers need.
CREATE TABLE material_requests (
    request_id              SERIAL PRIMARY KEY,
    company_id              INT NOT NULL REFERENCES companies(company_id),
    raw_description         TEXT NOT NULL,
    material_id             INT REFERENCES materials(material_id),
    acceptable_material_ids INT[] NOT NULL DEFAULT '{}', -- substitutes the buyer accepts
    replaces_virgin_material_id INT REFERENCES materials(material_id), -- for impact calc
    application             TEXT,
    forms_accepted          TEXT[] NOT NULL DEFAULT '{}',
    min_purity_pct          NUMERIC(5,2) CHECK (min_purity_pct BETWEEN 0 AND 100),
    max_contaminants        JSONB NOT NULL DEFAULT '[]', -- [{"name":"PVC","max_pct":0}]
    required_properties     JSONB NOT NULL DEFAULT '{}', -- {"colour":["natural","blue"]}
    processing_capability   TEXT[] NOT NULL DEFAULT '{}', -- {'wash','shred','dry'}
    quantity                NUMERIC(12,3) NOT NULL CHECK (quantity > 0),
    unit                    TEXT NOT NULL DEFAULT 't' CHECK (unit IN ('kg','t','m3','units')),
    frequency               TEXT NOT NULL CHECK (frequency IN
                              ('one_off','daily','weekly','monthly','quarterly','yearly')),
    needed_from             DATE,
    max_distance_km         NUMERIC(8,1),
    max_price_per_unit      NUMERIC(10,2),
    currency                TEXT NOT NULL DEFAULT 'GBP',
    latitude                NUMERIC(9,6),
    longitude               NUMERIC(9,6),
    embedding               REAL[],
    status                  TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('draft','active','matched','closed')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_requests_material ON material_requests (material_id) WHERE status = 'active';

-- ---------------------------------------------------------------------
-- 4. MATCHING
-- ---------------------------------------------------------------------

-- One row per candidate pair the engine proposes. Each score component is
-- stored separately so the UI can explain *why* a match was suggested.
CREATE TABLE matches (
    match_id              SERIAL PRIMARY KEY,
    listing_id            INT NOT NULL REFERENCES waste_listings(listing_id),
    request_id            INT NOT NULL REFERENCES material_requests(request_id),
    substitution_id       INT REFERENCES material_substitutions(substitution_id),
    -- score components, 0..1
    material_score        NUMERIC(4,3) CHECK (material_score  BETWEEN 0 AND 1),
    spec_score            NUMERIC(4,3) CHECK (spec_score      BETWEEN 0 AND 1),
    quantity_score        NUMERIC(4,3) CHECK (quantity_score  BETWEEN 0 AND 1),
    logistics_score       NUMERIC(4,3) CHECK (logistics_score BETWEEN 0 AND 1),
    price_score           NUMERIC(4,3) CHECK (price_score     BETWEEN 0 AND 1),
    trust_score           NUMERIC(4,3) CHECK (trust_score     BETWEEN 0 AND 1),
    overall_score         NUMERIC(4,3) NOT NULL CHECK (overall_score BETWEEN 0 AND 1),
    explanation           TEXT,                        -- LLM reasoning shown to users
    evidence              JSONB NOT NULL DEFAULT '[]', -- cited reference rows / sources
    -- logistics & impact estimates (per year)
    distance_km           NUMERIC(8,1),
    tonnes_per_year       NUMERIC(12,3),
    co2e_avoided_t_per_year NUMERIC(12,3),             -- (virgin - recycled - transport) incl. avoided disposal
    landfill_diverted_t_per_year NUMERIC(12,3),
    cost_saving_per_year  NUMERIC(12,2),
    -- workflow & anonymity: identities revealed only when both sides accept
    seller_status         TEXT NOT NULL DEFAULT 'pending'
                            CHECK (seller_status IN ('pending','accepted','rejected')),
    buyer_status          TEXT NOT NULL DEFAULT 'pending'
                            CHECK (buyer_status IN ('pending','accepted','rejected')),
    identities_revealed   BOOLEAN GENERATED ALWAYS AS
                            (seller_status = 'accepted' AND buyer_status = 'accepted') STORED,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (listing_id, request_id)
);
CREATE INDEX idx_matches_request_score ON matches (request_id, overall_score DESC);

-- Hand-labelled pairs used to evaluate and tune the matcher.
CREATE TABLE match_labels (
    label_id     SERIAL PRIMARY KEY,
    listing_id   INT NOT NULL REFERENCES waste_listings(listing_id),
    request_id   INT NOT NULL REFERENCES material_requests(request_id),
    is_good_match BOOLEAN NOT NULL,
    reason       TEXT NOT NULL,                        -- 'PVC contamination exceeds buyer limit'
    labelled_by  TEXT,
    UNIQUE (listing_id, request_id)
);

-- ---------------------------------------------------------------------
-- Convenience view: what a counterparty sees before both sides accept.
-- ---------------------------------------------------------------------
CREATE VIEW v_public_listings AS
SELECT l.listing_id,
       c.display_alias            AS seller,
       c.industry_label,
       c.region,
       c.verified,
       c.rating,
       m.name                     AS material,
       l.form, l.purity_pct, l.contaminants, l.properties,
       l.quantity, l.unit, l.frequency,
       l.hazardous, l.asking_price_per_unit, l.currency,
       l.certifications
FROM waste_listings l
JOIN companies c ON c.company_id = l.company_id
LEFT JOIN materials m ON m.material_id = l.material_id
WHERE l.status = 'active';

COMMIT;
