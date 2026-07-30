/**
 * Turning a pasted staff list into rows the database will accept.
 *
 * HR pastes out of Excel, so the input is tab-separated with a header row, a
 * BOM, CRLF endings, and the occasional duplicate. Every one of those is a
 * parsing problem, not a database problem, so it is absorbed here where it can
 * be tested without a network.
 *
 * Column order is fixed and documented on the import screen:
 *   code · full name · job title · department · email
 *
 * The code is HR's own employee number. It is the key the import upserts on so
 * one person stays one row — never a credential, and never asked of an employee.
 */

import { normalizeEmployeeCode } from "./codes";

export type EmployeeImportRow = {
  code: string;
  fullName: string;
  title: string | null;
  department: string | null;
  email: string | null;
};

export type ImportIssue = { line: number; message: string };

export type ParsedImport = { rows: EmployeeImportRow[]; issues: ImportIssue[] };

/**
 * A first cell equal to one of these means the line is a header. Exact match,
 * not a substring: "Mai Thị Hồng" contains "ma" and is a person, not a heading.
 */
const HEADER_FIRST_CELLS = new Set([
  "mã cbnv",
  "ma cbnv",
  "mã",
  "ma",
  "mã nv",
  "manv",
  "mã số",
  "ma so",
  "code",
  "employee code",
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Excel pastes use tabs; a saved CSV may use commas or semicolons. */
function delimiterOf(line: string): string {
  if (line.includes("\t")) return "\t";
  if (line.includes(";")) return ";";
  return ",";
}

function splitCells(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch !== '"') {
        current += ch;
      } else if (line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = false;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);

  return cells.map((cell) => cell.trim());
}

function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

export function parseEmployeeList(text: string): ParsedImport {
  const rows: EmployeeImportRow[] = [];
  const issues: ImportIssue[] = [];
  const seenAtLine = new Map<string, number>();

  const lines = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  let headerChecked = false;

  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    if (raw.trim() === "") return;

    const cells = splitCells(raw, delimiterOf(raw));

    if (!headerChecked) {
      headerChecked = true;
      if (HEADER_FIRST_CELLS.has((cells[0] ?? "").toLowerCase())) return;
    }

    const code = normalizeEmployeeCode(cells[0] ?? "");
    if (code === "") {
      issues.push({ line: lineNumber, message: "Thiếu mã CBNV" });
      return;
    }

    const fullName = (cells[1] ?? "").replace(/\s+/g, " ").trim();
    if (fullName.length < 2) {
      issues.push({ line: lineNumber, message: "Thiếu họ tên" });
      return;
    }

    const email = (cells[4] ?? "").trim().toLowerCase();
    if (email !== "" && !EMAIL.test(email)) {
      issues.push({ line: lineNumber, message: `Email không hợp lệ: ${email}` });
      return;
    }

    const firstSeen = seenAtLine.get(code);
    if (firstSeen !== undefined) {
      issues.push({ line: lineNumber, message: `Mã ${code} đã có ở dòng ${firstSeen}` });
      return;
    }
    seenAtLine.set(code, lineNumber);

    rows.push({
      code,
      fullName,
      title: blankToNull(cells[2]),
      department: blankToNull(cells[3]),
      email: email === "" ? null : email,
    });
  });

  return { rows, issues };
}
