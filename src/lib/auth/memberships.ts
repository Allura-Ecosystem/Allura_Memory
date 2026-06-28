/**
 * Memberships data-access seam (AC6 — §3.2)
 *
 * Implementation: Knuth (feat/faithmeats-onboarding, migration 30).
 *
 * This file is the read-only auth seam between Woz's AC6 enforcement gate
 * (tenant-resolver.ts) and the memberships table. It does NOT import from
 * src/lib/membership/repository.ts — that module is for the Hosted Platform
 * admin CRUD path; this module is read-only / auth path only.
 *
 * MUTABILITY NOTE (Brooks Nit): memberships is a current-state config table,
 * not append-only. Role changes UPDATE the row; removal is a soft-delete via
 * removed_at. The append-only invariant (POL-002) is preserved in the events
 * table via audit events. Only active rows (removed_at IS NULL) are returned
 * here.
 *
 * The exported type and function signature are contract-stable.
 */

import { getPool } from "@/lib/postgres/connection";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Membership {
  email: string;
  group_id: string;
  role: "owner" | "admin" | "member";
  is_default: boolean;
}

// ── Internal row type ─────────────────────────────────────────────────────────

interface MembershipRow {
  email: string;
  group_id: string;
  role: string;
  is_default: boolean;
}

// ── Data Access ───────────────────────────────────────────────────────────────

/**
 * Return all active memberships for a verified email address.
 *
 * - Normalizes email to lowercase before lookup (CF Access emails are
 *   case-insensitive; stored values are lowercased at seed time).
 * - Returns [] (not an error) when the email has no memberships; the caller
 *   (tenant-resolver.ts) turns an empty result into the appropriate denial.
 * - Excludes allura-system at the query level (belt-and-suspenders: the seed
 *   never inserts allura-system rows; this filter guards against manual errors).
 * - Only returns active rows (removed_at IS NULL).
 *
 * @param email - Verified email from Cloudflare Access JWT or header
 * @returns Active memberships ordered by is_default DESC, group_id ASC;
 *          empty array if no memberships found.
 */
export async function getMembershipsForEmail(email: string): Promise<Membership[]> {
  if (!email || typeof email !== "string") {
    return [];
  }

  // Normalize: CF Access email claims are case-insensitive; always match on
  // lowercase to be safe regardless of how the value arrived in the JWT claim.
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length === 0) {
    return [];
  }

  const pool = getPool();

  const result = await pool.query<MembershipRow>(
    `SELECT email, group_id, role, is_default
       FROM memberships
      WHERE email      = $1
        AND removed_at IS NULL
        AND group_id  != 'allura-system'
      ORDER BY is_default DESC, group_id ASC`,
    [normalizedEmail],
  );

  return result.rows.map((row) => ({
    email: row.email,
    group_id: row.group_id,
    role: row.role as Membership["role"],
    is_default: row.is_default,
  }));
}
