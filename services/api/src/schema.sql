CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  seller_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  exclusion_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  store_url TEXT,
  sandbox_id TEXT,
  band_room_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  condition TEXT NOT NULL,
  condition_notes TEXT NOT NULL,
  photo_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
  naive_price NUMERIC(10, 2),
  measured_price NUMERIC(10, 2),
  floor_price NUMERIC(10, 2),
  listing_v1 JSONB,
  listing_v2 JSONB,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS studies (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'terac',
  status TEXT NOT NULL,
  sample_size INTEGER,
  raw_response_location TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS price_evidence (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
  study_id TEXT NOT NULL REFERENCES studies(id),
  sample_size INTEGER NOT NULL,
  price_points JSONB NOT NULL,
  curve_fit_quality NUMERIC(5, 4) NOT NULL,
  recommended_price NUMERIC(10, 2) NOT NULL,
  floor_price NUMERIC(10, 2) NOT NULL,
  expected_revenue_before NUMERIC(10, 2) NOT NULL,
  expected_revenue_after NUMERIC(10, 2) NOT NULL,
  listing_defects JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  version SMALLINT NOT NULL CHECK (version IN (1, 2)),
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, version)
);

CREATE TABLE IF NOT EXISTS verdicts (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE REFERENCES items(id) ON DELETE CASCADE,
  decision TEXT NOT NULL,
  rules_triggered JSONB NOT NULL DEFAULT '[]'::jsonb,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  opted_in BOOLEAN NOT NULL,
  opted_in_at TIMESTAMPTZ,
  engagement_events JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id),
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL,
  channel TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  buyer_handle TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT NOT NULL,
  channel TEXT NOT NULL,
  stripe_reference TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_items_campaign_id ON items(campaign_id);
CREATE INDEX IF NOT EXISTS idx_events_campaign_occurred_at ON events(campaign_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_item_id ON orders(item_id);
