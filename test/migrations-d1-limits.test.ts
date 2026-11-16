import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";

/**
 * D1 rejects a compound SELECT with more than 5 terms ("too many terms in
 * compound SELECT"). Local sqlite3 and the miniflare test pool do not enforce
 * this, so a migration can pass every local rehearsal and still fail on the
 * remote apply. Guard new migrations here.
 *
 * Scoped to migrations numbered 0284 and up: older ones are already applied.
 */

const D1_MAX_COMPOUND_TERMS = 5;
const FIRST_CHECKED_MIGRATION = 284;

function checkedMigrations(): { name: string; sql: string }[] {
  return env.TEST_MIGRATIONS
    .filter((m) => Number(m.name.slice(0, 4)) >= FIRST_CHECKED_MIGRATION)
    .map((m) => ({ name: m.name, sql: m.queries.join(";\n") }));
}

describe("migrations stay within D1 limits", () => {
  it("finds the migrations it checks", () => {
    expect(checkedMigrations().map((m) => m.name)).toContain("0284_rsi_accounts.sql");
  });

  it(`no statement has more than ${D1_MAX_COMPOUND_TERMS} compound SELECT terms`, () => {
    const offenders: string[] = [];
    for (const { name, sql } of checkedMigrations()) {
      const code = sql.replace(/--[^\n]*/g, "");
      code.split(";").forEach((statement, index) => {
        const unions = (statement.match(/\bUNION\b/gi) ?? []).length;
        if (unions > D1_MAX_COMPOUND_TERMS - 1) {
          offenders.push(`${name} statement #${index + 1}: ${unions + 1} terms`);
        }
      });
    }
    expect(
      offenders,
      `D1 rejects a compound SELECT with more than ${D1_MAX_COMPOUND_TERMS} terms ` +
        `("too many terms in compound SELECT"); rewrite with EXISTS: ${offenders.join("; ")}`,
    ).toEqual([]);
  });
});
