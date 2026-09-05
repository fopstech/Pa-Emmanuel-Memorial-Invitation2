import { normalize } from "./guest-utils";

export type ParsedGuestRow = {
  rowNumber: number;
  name: string;
  phone: string | null;
  email: string | null;
};

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length) {
    row.push(cell.trim());
    if (row.some((value) => value !== "")) rows.push(row);
  }
  return rows;
}

export function parseGuestCsv(text: string) {
  const allRows = parseCsv(text);
  const headers = (allRows.shift() ?? []).map((header) => normalize(header));
  const nameIndex = headers.findIndex((header) => header === "name" || header === "guest name");
  const phoneIndex = headers.findIndex((header) => header === "phone" || header === "phone number");
  const emailIndex = headers.findIndex((header) => header === "email" || header === "email address");

  return {
    headers,
    rows: allRows.map((values, index) => ({
      rowNumber: index + 2,
      name: values[nameIndex] ?? "",
      phone: phoneIndex >= 0 ? values[phoneIndex] ?? null : null,
      email: emailIndex >= 0 ? values[emailIndex] ?? null : null,
    })),
    hasNameColumn: nameIndex >= 0,
  };
}