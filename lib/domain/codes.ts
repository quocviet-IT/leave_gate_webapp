/**
 * Request codes and lookup links — PRD sections III and X.
 *
 * The public zone has no login, so these two strings carry the whole security
 * model: a person quotes the short code plus their employee code to look a
 * request up, or opens the long link handed to them when they filed it.
 */

import { ICT_OFFSET_MINUTES } from "./workhours";

export type RequestKind = "leave" | "gate";

/** Prefix per kind: nghỉ phép, ra cổng. Short enough to read over the phone. */
export const KIND_PREFIX: Record<RequestKind, string> = {
  leave: "NP",
  gate: "RC",
};

/** Characters a lookup token may contain — hex, so it is unambiguous by phone. */
const TOKEN_ALPHABET = "0123456789abcdef";
/** 32 hex characters ≈ 128 bits: not guessable by trying. */
export const LOOKUP_TOKEN_LENGTH = 32;

/**
 * Human-facing request code, e.g. `NP-2607-0148`: kind, ICT year and month of
 * filing, then the sequence within that month. The sequence comes from the
 * database so two requests can never share a code.
 */
export function formatRequestCode(
  kind: RequestKind,
  submittedAt: Date,
  sequence: number,
): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    throw new Error(`Số thứ tự đơn phải là số nguyên 1–9999, nhận được: ${sequence}`);
  }
  const ict = new Date(submittedAt.getTime() + ICT_OFFSET_MINUTES * 60_000);
  const yy = String(ict.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(ict.getUTCMonth() + 1).padStart(2, "0");
  return `${KIND_PREFIX[kind]}-${yy}${mm}-${String(sequence).padStart(4, "0")}`;
}

const CODE_PATTERN = /^(NP|RC)-(\d{2})(\d{2})-(\d{4})$/;

/** Whether a string is shaped like a request code, ignoring case and spaces. */
export function isRequestCode(value: string): boolean {
  return CODE_PATTERN.test(normalizeRequestCode(value));
}

/**
 * What people actually type: lower case, spaces, a missing dash. Normalise
 * before matching so `np 2607 0148` finds the same request as `NP-2607-0148`.
 */
export function normalizeRequestCode(value: string): string {
  const bare = value.trim().toUpperCase().replace(/[\s-]+/g, "");
  const match = /^(NP|RC)(\d{4})(\d{4})$/.exec(bare);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : value.trim().toUpperCase();
}

/** The kind a code belongs to, or null if it is not a code at all. */
export function kindOfRequestCode(value: string): RequestKind | null {
  const match = CODE_PATTERN.exec(normalizeRequestCode(value));
  if (!match) return null;
  return match[1] === "NP" ? "leave" : "gate";
}

/** A fresh lookup token. Uses the platform CSPRNG, never Math.random. */
export function generateLookupToken(): string {
  const bytes = new Uint8Array(LOOKUP_TOKEN_LENGTH / 2);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += TOKEN_ALPHABET[byte >> 4] + TOKEN_ALPHABET[byte & 0x0f];
  }
  return out;
}

export function isLookupToken(value: string): boolean {
  return new RegExp(`^[0-9a-f]{${LOOKUP_TOKEN_LENGTH}}$`).test(value);
}

/** The link handed to the employee after filing. Relative on purpose. */
export function lookupPath(token: string): string {
  return `/tra-cuu/${token}`;
}

/**
 * Employee codes are typed by people standing at a workshop noticeboard, so
 * compare them case-insensitively and ignore the separators they add.
 */
export function normalizeEmployeeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s.–—-]+/g, "");
}

export function employeeCodesMatch(a: string, b: string): boolean {
  return normalizeEmployeeCode(a) === normalizeEmployeeCode(b) && a.trim() !== "";
}
