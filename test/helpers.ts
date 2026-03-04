/**
 * Test helpers — auth forging, seed data, request builders.
 *
 * Inserts directly into Better Auth's user/session tables to create
 * authenticated test contexts without going through the auth flow.
 */

interface TestUser {
  userId: string;
  sessionToken: string;
}

/**
 * Create a test user with an active session in the database.
 * Returns the userId and sessionToken for use in requests.
 */
export async function createTestUser(
  db: D1Database,
  overrides?: {
    id?: string;
    name?: string;
    email?: string;
    role?: string;
    status?: string;
  }
): Promise<TestUser> {
  const id = overrides?.id ?? crypto.randomUUID();
  const name = overrides?.name ?? "Test User";
  const email = overrides?.email ?? `test-${id.slice(0, 8)}@example.com`;
  const role = overrides?.role ?? "user";
  const status = overrides?.status ?? "active";
  const now = new Date().toISOString();

  // Insert into Better Auth's user table
  await db
    .prepare(
      `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt, role)
       VALUES (?, ?, ?, 1, ?, ?, ?)`
    )
    .bind(id, name, email, now, now, role)
    .run();

  // Set status (column added by migration 0004)
  await db
    .prepare(`UPDATE "user" SET status = ? WHERE id = ?`)
    .bind(status, id)
    .run();

  // Create a session
  const sessionToken = `tok-${crypto.randomUUID()}`;
  const sessionId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare(
      `INSERT INTO "session" (id, expiresAt, token, createdAt, updatedAt, userId)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(sessionId, expiresAt, sessionToken, now, now, id)
    .run();

  return { userId: id, sessionToken };
}

/**
 * Create a super_admin user with an active session.
 */
export async function createAdminUser(
  db: D1Database,
  overrides?: { id?: string; name?: string; email?: string }
): Promise<TestUser> {
  return createTestUser(db, { ...overrides, role: "super_admin" });
}

/**
 * Sign a session token the same way Better Auth does (HMAC-SHA-256).
 * Cookie value = encodeURIComponent(`${token}.${base64(HMAC(token, secret))}`)
 */
async function signSessionToken(
  token: string,
  secret: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(token)
  );
  const b64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return encodeURIComponent(`${token}.${b64}`);
}

/**
 * Build Cookie header for an authenticated request.
 * Must be awaited — signs the token with HMAC-SHA-256 matching Better Auth's format.
 */
export async function authHeaders(
  sessionToken: string
): Promise<Record<string, string>> {
  const signed = await signSessionToken(
    sessionToken,
    "test-secret-value-for-testing-xx"
  );
  return {
    Cookie: `better-auth.session_token=${signed}`,
  };
}

/**
 * Insert a vehicle into the vehicles table. Returns the vehicle id.
 */
export async function seedVehicle(
  db: D1Database,
  overrides?: {
    slug?: string;
    name?: string;
    focus?: string;
    size_label?: string;
    cargo?: number;
    crew_min?: number;
    crew_max?: number;
    pledge_price?: number;
    classification?: string;
    production_status_id?: number;
    manufacturer_id?: number;
  }
): Promise<number> {
  const slug = overrides?.slug ?? `test-ship-${crypto.randomUUID().slice(0, 8)}`;
  const name = overrides?.name ?? `Test Ship ${slug}`;

  await db
    .prepare(
      `INSERT INTO vehicles (slug, name, focus, size_label, cargo, crew_min, crew_max,
         pledge_price, classification, production_status_id, manufacturer_id,
         game_version_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         (SELECT id FROM game_versions WHERE is_default = 1), datetime('now'))`
    )
    .bind(
      slug,
      name,
      overrides?.focus ?? "Light Fighter",
      overrides?.size_label ?? "Small",
      overrides?.cargo ?? 0,
      overrides?.crew_min ?? 1,
      overrides?.crew_max ?? 1,
      overrides?.pledge_price ?? 100,
      overrides?.classification ?? "Combat",
      overrides?.production_status_id ?? 1, // flight_ready
      overrides?.manufacturer_id ?? null
    )
    .run();

  // Get the inserted ID
  const row = await db
    .prepare("SELECT id FROM vehicles WHERE slug = ? ORDER BY id DESC LIMIT 1")
    .bind(slug)
    .first<{ id: number }>();

  const vehicleId = row!.id;

  // Also insert into vehicle_images (required by schema)
  await db
    .prepare("INSERT OR IGNORE INTO vehicle_images (vehicle_id) VALUES (?)")
    .bind(vehicleId)
    .run();

  return vehicleId;
}

/**
 * Insert a fleet entry for a user. Returns the fleet entry id.
 */
export async function seedFleetEntry(
  db: D1Database,
  userId: string,
  vehicleId: number,
  overrides?: {
    insurance_type_id?: number;
    warbond?: boolean;
    pledge_id?: string;
    pledge_name?: string;
    pledge_cost?: string;
    pledge_date?: string;
    custom_name?: string;
  }
): Promise<number> {
  await db
    .prepare(
      `INSERT INTO user_fleet (user_id, vehicle_id, insurance_type_id, warbond, is_loaner,
         pledge_id, pledge_name, pledge_cost, pledge_date, custom_name, imported_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, datetime('now'))`
    )
    .bind(
      userId,
      vehicleId,
      overrides?.insurance_type_id ?? null,
      overrides?.warbond ? 1 : 0,
      overrides?.pledge_id ?? null,
      overrides?.pledge_name ?? null,
      overrides?.pledge_cost ?? null,
      overrides?.pledge_date ?? null,
      overrides?.custom_name ?? null
    )
    .run();

  const row = await db
    .prepare(
      "SELECT id FROM user_fleet WHERE user_id = ? ORDER BY id DESC LIMIT 1"
    )
    .bind(userId)
    .first<{ id: number }>();

  return row!.id;
}

/**
 * Insert a loot item into the loot_map table. Returns the id.
 */
export async function seedLootItem(
  db: D1Database,
  overrides?: {
    uuid?: string;
    name?: string;
    type?: string;
    sub_type?: string;
    rarity?: string;
    containers_json?: string;
    category?: string;
    manufacturer_name?: string;
  }
): Promise<{ id: number; uuid: string }> {
  const uuid = overrides?.uuid ?? crypto.randomUUID();
  const name = overrides?.name ?? `Test Item ${uuid.slice(0, 8)}`;

  await db
    .prepare(
      `INSERT INTO loot_map (uuid, name, type, sub_type, rarity, containers_json,
         category, manufacturer_name, game_version_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?,
         (SELECT id FROM game_versions WHERE is_default = 1), datetime('now'))`
    )
    .bind(
      uuid,
      name,
      overrides?.type ?? "Weapon",
      overrides?.sub_type ?? "Pistol",
      overrides?.rarity ?? "Rare",
      overrides?.containers_json ?? null,
      overrides?.category ?? "weapon",
      overrides?.manufacturer_name ?? null
    )
    .run();

  const row = await db
    .prepare("SELECT id FROM loot_map WHERE uuid = ?")
    .bind(uuid)
    .first<{ id: number }>();

  return { id: row!.id, uuid };
}
