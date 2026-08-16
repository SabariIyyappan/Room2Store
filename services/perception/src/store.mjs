/**
 * Persistence for sellers, listings, offers and orders.
 *
 * Postgres is required in production: an in-memory store silently loses a sale
 * on restart, and a marketplace that forgets an order is worse than one that
 * refuses to start. The memory backend remains only for tests, and is selected
 * by ALLOW_MEMORY_STORE rather than by DATABASE_URL happening to be absent.
 */

import { randomUUID } from "node:crypto";

let pool = null;
let backend = "memory";

const memory = {
  sellers: new Map(),
  listings: new Map(),
  offers: new Map(),
  orders: new Map()
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sellers (
  id TEXT PRIMARY KEY,
  phone TEXT UNIQUE,
  chat_id TEXT UNIQUE NOT NULL,
  opted_out BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  seller_id TEXT NOT NULL REFERENCES sellers(id) ON DELETE CASCADE,
  seller_chat_id TEXT,
  name TEXT NOT NULL,
  category TEXT,
  model_number TEXT,
  condition TEXT NOT NULL,
  photo_url TEXT,
  price NUMERIC(10, 2),
  floor_price NUMERIC(10, 2),
  price_status TEXT NOT NULL DEFAULT 'being_measured',
  study_id TEXT,
  pickup_zip TEXT NOT NULL,
  pickup_city TEXT,
  pickup_state TEXT,
  pickup_latitude DOUBLE PRECISION NOT NULL,
  pickup_longitude DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'live',
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_chat_id TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_chat_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  seller_payout_cents INTEGER NOT NULL,
  pickup_address TEXT,
  pickup_time TEXT,
  stripe_session_id TEXT,
  stripe_payment_url TEXT,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS listings_status_idx ON listings(status);
`;

/**
 * Columns added after the first deploy. CREATE TABLE IF NOT EXISTS silently
 * skips an existing table, so new columns need adding explicitly or the first
 * query after a schema change fails in production.
 */
const MIGRATIONS = `
ALTER TABLE listings ADD COLUMN IF NOT EXISTS seller_chat_id TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS study_id TEXT;
CREATE INDEX IF NOT EXISTS listings_study_idx ON listings(study_id);
CREATE INDEX IF NOT EXISTS listings_code_idx ON listings(code);
`;

/** Connects to Postgres when configured. Safe to call more than once. */
export async function initStore() {
  if (!process.env.DATABASE_URL) {
    // Falling back to memory here once cost a deploy its listings silently.
    if (process.env.ALLOW_MEMORY_STORE !== "true" && process.env.NODE_ENV === "production") {
      throw new Error("DATABASE_URL is required. Set ALLOW_MEMORY_STORE=true only for tests.");
    }
    backend = "memory";
    return { backend };
  }

  const { default: pg } = await import("pg");
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    // Render's managed Postgres presents a certificate the default chain does
    // not accept over its external hostname.
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false },
    max: 5
  });

  await pool.query(SCHEMA);
  await pool.query(MIGRATIONS);
  backend = "postgres";
  return { backend };
}

export function storeBackend() {
  return backend;
}

/** Short, unambiguous, and safe to read aloud or type into a text message. */
export function generateListingCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let index = 0; index < 4; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `R2S-${code}`;
}

export async function upsertSeller({ chatId, phone }) {
  if (backend === "memory") {
    for (const seller of memory.sellers.values()) {
      if (seller.chatId === chatId) return seller;
    }
    const seller = { id: randomUUID(), chatId, phone: phone ?? null, optedOut: false };
    memory.sellers.set(seller.id, seller);
    return seller;
  }

  const { rows } = await pool.query(
    `INSERT INTO sellers (id, chat_id, phone) VALUES ($1, $2, $3)
     ON CONFLICT (chat_id) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, sellers.phone)
     RETURNING id, chat_id AS "chatId", phone, opted_out AS "optedOut"`,
    [randomUUID(), chatId, phone ?? null]
  );
  return rows[0];
}

export async function insertListing(listing) {
  if (backend === "memory") {
    memory.listings.set(listing.id, listing);
    return listing;
  }

  await pool.query(
    `INSERT INTO listings (
       id, code, seller_id, seller_chat_id, name, category, model_number, condition, photo_url,
       price, floor_price, price_status, pickup_zip, pickup_city, pickup_state,
       pickup_latitude, pickup_longitude, status
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     ON CONFLICT (id) DO NOTHING`,
    [
      listing.id, listing.code, listing.sellerId, listing.sellerChatId, listing.name, listing.category,
      listing.modelNumber, listing.condition, listing.photoUrl, listing.price,
      listing.floorPrice, listing.priceStatus, listing.location.zip, listing.location.city,
      listing.location.state, listing.location.latitude, listing.location.longitude, listing.status
    ]
  );
  return listing;
}

function rowToListing(row) {
  return {
    id: row.id,
    code: row.code,
    sellerId: row.sellerId,
    name: row.name,
    category: row.category,
    modelNumber: row.modelNumber,
    condition: row.condition,
    photoUrl: row.photoUrl,
    price: row.price == null ? null : Number(row.price),
    floorPrice: row.floorPrice == null ? null : Number(row.floorPrice),
    priceStatus: row.priceStatus,
    studyId: row.studyId,
    status: row.status,
    sellerChatId: row.sellerChatId,
    publishedAt: row.publishedAt,
    location: {
      zip: row.pickupZip,
      city: row.pickupCity,
      state: row.pickupState,
      latitude: Number(row.pickupLatitude),
      longitude: Number(row.pickupLongitude)
    }
  };
}

const LISTING_COLUMNS = `
  listings.id, code, seller_id AS "sellerId", name, category, model_number AS "modelNumber",
  condition, photo_url AS "photoUrl", price, floor_price AS "floorPrice",
  price_status AS "priceStatus", study_id AS "studyId", listings.status,
  COALESCE(listings.seller_chat_id, sellers.chat_id) AS "sellerChatId", published_at AS "publishedAt",
  pickup_zip AS "pickupZip", pickup_city AS "pickupCity", pickup_state AS "pickupState",
  pickup_latitude AS "pickupLatitude", pickup_longitude AS "pickupLongitude"
`;

export async function listLiveListings() {
  if (backend === "memory") {
    return [...memory.listings.values()].filter((listing) => listing.status === "live");
  }
  const { rows } = await pool.query(`SELECT ${LISTING_COLUMNS} FROM listings LEFT JOIN sellers ON sellers.id = listings.seller_id WHERE status = 'live'`);
  return rows.map(rowToListing);
}

export async function findListingById(id) {
  if (backend === "memory") return memory.listings.get(id) ?? null;
  const { rows } = await pool.query(`SELECT ${LISTING_COLUMNS} FROM listings LEFT JOIN sellers ON sellers.id = listings.seller_id WHERE listings.id = $1`, [id]);
  return rows[0] ? rowToListing(rows[0]) : null;
}

export async function findListingByCode(code) {
  const normalized = String(code ?? "").toUpperCase();
  if (backend === "memory") {
    const found = [...memory.listings.values()].find((listing) => listing.code === normalized);
    if (!found) return null;
    if (!found.sellerChatId) found.sellerChatId = memory.sellers.get(found.sellerId)?.chatId ?? null;
    return found;
  }
  const { rows } = await pool.query(`SELECT ${LISTING_COLUMNS} FROM listings LEFT JOIN sellers ON sellers.id = listings.seller_id WHERE code = $1`, [normalized]);
  return rows[0] ? rowToListing(rows[0]) : null;
}

/** Finds the listing a Terac study belongs to. */
export async function findListingByStudy(studyId) {
  if (backend === "memory") {
    return [...memory.listings.values()].find((listing) => listing.studyId === studyId) ?? null;
  }
  const { rows } = await pool.query(`SELECT ${LISTING_COLUMNS} FROM listings LEFT JOIN sellers ON sellers.id = listings.seller_id WHERE study_id = $1 LIMIT 1`, [studyId]);
  return rows[0] ? rowToListing(rows[0]) : null;
}

export async function updateListing(id, changes) {
  if (backend === "memory") {
    const listing = memory.listings.get(id);
    if (!listing) return null;
    Object.assign(listing, changes);
    return listing;
  }

  const columns = {
    sellerChatId: "seller_chat_id",
    price: "price",
    floorPrice: "floor_price",
    priceStatus: "price_status",
    studyId: "study_id",
    status: "status"
  };
  const sets = [];
  const values = [];
  for (const [key, column] of Object.entries(columns)) {
    if (changes[key] !== undefined) {
      values.push(changes[key]);
      sets.push(`${column} = $${values.length}`);
    }
  }
  if (sets.length === 0) return findListingById(id);

  values.push(id);
  await pool.query(`UPDATE listings SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
  // Re-read through the joined query so the seller chat id comes back with it.
  return findListingById(id);
}

export async function insertOrder(order) {
  if (backend === "memory") {
    memory.orders.set(order.id, order);
    return order;
  }
  await pool.query(
    `INSERT INTO orders (id, listing_id, buyer_chat_id, amount_cents, platform_fee_cents,
       seller_payout_cents, pickup_address, pickup_time, stripe_session_id, stripe_payment_url, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [order.id, order.listingId, order.buyerChatId, order.amountCents, order.platformFeeCents,
     order.sellerPayoutCents, order.pickupAddress, order.pickupTime, order.stripeSessionId,
     order.stripePaymentUrl, order.status]
  );
  return order;
}

export async function findOrderById(id) {
  if (backend === "memory") return memory.orders.get(id) ?? null;
  const { rows } = await pool.query(
    `SELECT id, listing_id AS "listingId", buyer_chat_id AS "buyerChatId",
            amount_cents AS "amountCents", platform_fee_cents AS "platformFeeCents",
            seller_payout_cents AS "sellerPayoutCents", pickup_address AS "pickupAddress",
            pickup_time AS "pickupTime", stripe_session_id AS "stripeSessionId",
            stripe_payment_url AS "stripePaymentUrl", status
       FROM orders WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function markOrderPaid(id) {
  if (backend === "memory") {
    const order = memory.orders.get(id);
    if (order) {
      order.status = "paid";
      order.paidAt = new Date().toISOString();
    }
    return order ?? null;
  }
  const { rows } = await pool.query(
    `UPDATE orders SET status = 'paid', paid_at = NOW() WHERE id = $1 RETURNING id, status`,
    [id]
  );
  return rows[0] ?? null;
}

/** Test seam. */
export function resetStore() {
  memory.sellers.clear();
  memory.listings.clear();
  memory.offers.clear();
  memory.orders.clear();
  backend = "memory";
}
