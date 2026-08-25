// Issues the guard booth's PIN.
//
// The booth was built and verified in migration 0010, but lg_set_booth_pin had
// never been called outside a test transaction, so lg_booth held no rows and no
// PIN existed — the guard could not sign in for the same reason nobody could
// sign in to /admin. This is the tool that was missing.
//
// Run:  node --env-file=.env.local scripts/set-booth-pin.mjs "<tên chốt>" <PIN>
//
// Safe to re-run: the booth name is unique, so a second run changes the PIN
// rather than adding a booth. Changing it signs every booth machine out, which
// is the point — that is how a leaked PIN is revoked.
//
// A script rather than a migration, because a migration is committed to a public
// repository and must never carry a credential.
import pg from "pg";

const [name, pin] = process.argv.slice(2);

if (!name || !pin) {
  console.error('Cần: node ... scripts/set-booth-pin.mjs "<tên chốt>" <PIN>');
  process.exit(1);
}
if (!/^\d{4,10}$/.test(pin)) {
  console.error("PIN phải là 4 đến 10 chữ số — bảo vệ gõ nó trên bàn phím số.");
  process.exit(1);
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL chưa được đặt (dùng node --env-file=.env.local).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();

  const before = await client.query("select count(*)::int as n from lg_booth_session where token is not null");

  // The function hashes the PIN with bcrypt; nothing here ever stores it.
  await client.query("select lg_set_booth_pin($1, $2, $3)", [name, pin, "script:set-booth-pin"]);

  const booth = await client.query(
    "select id, name, active, updated_at from lg_booth where name = $1",
    [name.trim()],
  );
  const row = booth.rows[0];
  console.log(`chốt "${row.name}" đã có PIN  (cập nhật ${row.updated_at.toISOString()})`);
  console.log(`  đang hoạt động: ${row.active}`);

  // Changing a PIN must lock every machine that held the old one, or a revoked
  // PIN is not revoked. verify:booth asserts this; it is printed here so the
  // person changing it sees what they just did.
  const after = await client.query("select count(*)::int as n from lg_booth_session");
  console.log(`  phiên đang mở: ${before.rows[0].n} → ${after.rows[0].n}`);

  const all = await client.query("select name, active from lg_booth order by name");
  console.log("\nlg_booth giờ có:");
  for (const b of all.rows) console.log(`  ${b.name}${b.active ? "" : "  (đã tắt)"}`);

  await client.end();
}

main().catch(async (err) => {
  console.error("\nLỗi:", err.message);
  await client.end().catch(() => {});
  process.exitCode = 1;
});
