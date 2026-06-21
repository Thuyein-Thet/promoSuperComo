import { Pool } from "pg";

export const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

export interface StoreRow {
  id: number;
  tokubaiStoreId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

export interface FlyerRow {
  id: number;
  storeId: number;
  tokubaiImageId: string;
  blobUrl: string;
}

export interface StoreWithFlyers extends StoreRow {
  flyers: { tokubaiImageId: string; blobUrl: string }[];
}

export async function ensureSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS stores (
      id serial PRIMARY KEY,
      tokubai_store_id text UNIQUE NOT NULL,
      name text NOT NULL,
      address text,
      lat double precision,
      lng double precision,
      last_scraped_at timestamptz
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS flyers (
      id serial PRIMARY KEY,
      store_id integer NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      tokubai_image_id text NOT NULL,
      blob_url text NOT NULL,
      updated_at timestamptz DEFAULT now(),
      UNIQUE (store_id, tokubai_image_id)
    )
  `);
}

function toStoreRow(row: Record<string, unknown>): StoreRow {
  return {
    id: row.id as number,
    tokubaiStoreId: row.tokubai_store_id as string,
    name: row.name as string,
    address: row.address as string | null,
    lat: row.lat as number | null,
    lng: row.lng as number | null,
  };
}

export async function upsertStore(input: {
  tokubaiStoreId: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}): Promise<StoreRow> {
  const { rows } = await pool.query(
    `INSERT INTO stores (tokubai_store_id, name, address, lat, lng, last_scraped_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (tokubai_store_id)
     DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address,
                   lat = EXCLUDED.lat, lng = EXCLUDED.lng, last_scraped_at = now()
     RETURNING id, tokubai_store_id, name, address, lat, lng`,
    [input.tokubaiStoreId, input.name, input.address, input.lat, input.lng],
  );
  return toStoreRow(rows[0]);
}

export async function getFlyerImageIdsForStore(storeId: number): Promise<string[]> {
  const { rows } = await pool.query("SELECT tokubai_image_id FROM flyers WHERE store_id = $1", [storeId]);
  return rows.map((r) => r.tokubai_image_id as string);
}

export async function upsertFlyer(input: { storeId: number; tokubaiImageId: string; blobUrl: string }): Promise<void> {
  await pool.query(
    `INSERT INTO flyers (store_id, tokubai_image_id, blob_url, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (store_id, tokubai_image_id)
     DO UPDATE SET blob_url = EXCLUDED.blob_url, updated_at = now()`,
    [input.storeId, input.tokubaiImageId, input.blobUrl],
  );
}

export async function deleteFlyersNotIn(storeId: number, keepImageIds: string[]): Promise<FlyerRow[]> {
  const { rows } = await pool.query(
    `DELETE FROM flyers
     WHERE store_id = $1
       AND tokubai_image_id <> ALL($2)
     RETURNING id, store_id, tokubai_image_id, blob_url`,
    [storeId, keepImageIds.length ? keepImageIds : [""]],
  );
  return rows.map((r) => ({
    id: r.id as number,
    storeId: r.store_id as number,
    tokubaiImageId: r.tokubai_image_id as string,
    blobUrl: r.blob_url as string,
  }));
}

export async function getAllStoresWithFlyers(): Promise<StoreWithFlyers[]> {
  const { rows: storeRows } = await pool.query("SELECT * FROM stores ORDER BY id");
  const { rows: flyerRows } = await pool.query("SELECT * FROM flyers ORDER BY id");

  return storeRows.map((s) => ({
    ...toStoreRow(s),
    flyers: flyerRows
      .filter((f) => f.store_id === s.id)
      .map((f) => ({ tokubaiImageId: f.tokubai_image_id as string, blobUrl: f.blob_url as string })),
  }));
}
