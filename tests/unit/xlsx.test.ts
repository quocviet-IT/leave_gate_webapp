import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildXlsx, columnName } from "@/lib/xlsx";

/**
 * The writer is hand-rolled, so these tests read the ZIP back rather than trust
 * it. Anything Excel would refuse — a broken central directory, a part that is
 * not XML, a raw `&` in a name — has to fail here, because the next place it
 * would surface is Chị Khoa's desk.
 */

/** Minimal ZIP reader: enough to pull the parts back out by name. */
function readZip(buffer: Buffer): Map<string, string> {
  const parts = new Map<string, string>();
  let offset = 0;
  while (offset + 4 <= buffer.length && buffer.readUInt32LE(offset) === 0x04034b50) {
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = buffer.subarray(dataStart, dataStart + compressedSize);
    parts.set(name, inflateRawSync(data).toString("utf8"));
    offset = dataStart + compressedSize;
  }
  return parts;
}

describe("column letters", () => {
  it("count the way Excel does", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(27)).toBe("AB");
    expect(columnName(51)).toBe("AZ");
    expect(columnName(52)).toBe("BA");
  });
});

describe("the workbook", () => {
  const table: (string | number)[][] = [
    ["Mã đơn", "Số giờ"],
    ["NP-2607-0148", 8],
    ["RC-2607-0031", 2.5],
  ];
  const book = buildXlsx("Chấm công", table);
  const parts = readZip(book);

  it("carries the five parts Excel looks for", () => {
    expect([...parts.keys()]).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/worksheets/sheet1.xml",
    ]);
  });

  it("ends with a central directory naming every part", () => {
    expect(book.readUInt32LE(book.length - 22)).toBe(0x06054b50);
    expect(book.readUInt16LE(book.length - 22 + 10)).toBe(5);
  });

  it("keeps Vietnamese text intact", () => {
    expect(parts.get("xl/workbook.xml")).toContain('name="Chấm công"');
    expect(parts.get("xl/worksheets/sheet1.xml")).toContain("Mã đơn");
  });

  it("writes numbers as numbers, not as text", () => {
    const sheet = parts.get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain('<c r="B2"><v>8</v></c>');
    expect(sheet).toContain('<c r="B3"><v>2.5</v></c>');
  });

  it("produces the same bytes for the same table", () => {
    expect(buildXlsx("Chấm công", table).equals(book)).toBe(true);
  });
});

describe("what would otherwise break the file", () => {
  it("escapes the XML characters that would end the document early", () => {
    const sheet = readZip(buildXlsx("S", [['Nguyễn "Văn" Bình & <con>']])).get(
      "xl/worksheets/sheet1.xml",
    )!;
    expect(sheet).toContain("Nguyễn &quot;Văn&quot; Bình &amp; &lt;con&gt;");
  });

  it("drops the control characters XML forbids", () => {
    const dirty = `a${String.fromCharCode(0)}b${String.fromCharCode(7)}c`;
    const sheet = readZip(buildXlsx("S", [[dirty]])).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain(">abc<");
  });

  it("keeps the tab and newline that XML does allow", () => {
    const sheet = readZip(buildXlsx("S", [["a\tb\nc"]])).get("xl/worksheets/sheet1.xml")!;
    expect(sheet).toContain("a\tb\nc");
  });

  it("strips what Excel refuses in a sheet name, and caps its length", () => {
    const wb = readZip(buildXlsx("Chấm/công[2026]:tháng*7 rất là dài quá ba mươi mốt ký tự", [["x"]])).get(
      "xl/workbook.xml",
    )!;
    const name = /name="([^"]*)"/.exec(wb)![1];
    expect(name).not.toContain("/");
    expect(name).not.toContain("[");
    expect(name).not.toContain(":");
    expect(name.length).toBeLessThanOrEqual(31);
  });

  it("leaves an empty cell out rather than writing a blank one", () => {
    const sheet = readZip(buildXlsx("S", [["a", null, undefined, "", "b"]])).get(
      "xl/worksheets/sheet1.xml",
    )!;
    expect(sheet).toContain('r="A1"');
    expect(sheet).toContain('r="E1"');
    expect(sheet).not.toContain('r="B1"');
  });

  it("round-trips its own compression exactly", () => {
    const original = Buffer.from("Số giờ chốt · 8,5 giờ", "utf8");
    expect(inflateRawSync(deflateRawSync(original)).equals(original)).toBe(true);
  });
});
