import { z } from "zod";

const roomSchema = z.object({
  name: z.string().default(""),
  area_m2: z.coerce.number().default(0),
});

export const CONSTRUCTION_PLAN_TYPES = {
  site: "Plan zagospodarowania",
  floor: "Plan piętra / rzut",
  section: "Przekrój",
  elevation: "Elewacja",
  detail: "Detal",
  other: "Inny",
};

export const constructionPlanSchema = z.object({
  title: z.string().min(1, "Podaj tytuł planu"),
  sheet_number: z.string().optional().default(""),
  revision: z.string().optional().default(""),
  scale: z.string().optional().default(""),
  plan_type: z.enum(["site", "floor", "section", "elevation", "detail", "other"]).default("floor"),
  issue_date: z.string().optional().default(""),
  architect: z.string().optional().default(""),
  site_address: z.string().optional().default(""),
  city: z.string().optional().default(""),
  description: z.string().optional().default(""),
  rooms: z.array(roomSchema).default([]),
  project_id: z.string().optional().default(""),
  fileName: z.string().optional().default(""),
  file_url: z.string().optional().default(""),
});

export function emptyConstructionPlan(overrides = {}) {
  return {
    title: "",
    sheet_number: "",
    revision: "",
    scale: "",
    plan_type: "floor",
    issue_date: "",
    architect: "",
    site_address: "",
    city: "",
    description: "",
    rooms: [],
    project_id: "",
    fileName: "",
    file_url: "",
    ...overrides,
  };
}

export function normalizeRooms(rooms) {
  if (Array.isArray(rooms)) {
    return rooms.map((r) => ({
      name: String(r.name ?? r.nazwa ?? "").trim(),
      area_m2: Number(r.area_m2 ?? r.powierzchnia_m2 ?? 0) || 0,
    }));
  }
  return [];
}

export function roomsToDisplay(rooms) {
  const arr = normalizeRooms(rooms);
  if (!arr.length) return "—";
  return arr
    .filter((r) => r.name || r.area_m2)
    .map((r) => (r.area_m2 ? `${r.name || "?"}: ${r.area_m2} m²` : r.name))
    .join("; ");
}

export function projectMatchPayloadFromPlan(plan) {
  const rooms = normalizeRooms(plan.rooms);
  const roomsText = rooms.map((r) => `${r.name} ${r.area_m2}`).join(" ");
  return {
    position: `${plan.title || ""} ${plan.site_address || ""} ${plan.city || ""} ${plan.description || ""} ${roomsText}`.trim(),
    order_number: plan.sheet_number || "",
    seller_name: plan.architect || "",
    contractor_name: "",
    currency: "PLN",
  };
}

export function pickConstructionPlanApiPayload(row) {
  const rooms = normalizeRooms(row.rooms);
  return {
    title: String(row.title ?? "").trim(),
    sheet_number: row.sheet_number || undefined,
    revision: row.revision || undefined,
    scale: row.scale || undefined,
    plan_type: row.plan_type || "floor",
    issue_date: row.issue_date || undefined,
    architect: row.architect || undefined,
    site_address: row.site_address || undefined,
    city: row.city || undefined,
    description: row.description || undefined,
    rooms: rooms.length ? rooms : undefined,
    project_id: row.project_id || undefined,
    fileName: row.fileName || undefined,
    file_url: row.file_url || undefined,
    project_match_reason: row._projectMatchReason || undefined,
    project_match_confidence: row._projectMatchConfidence ?? undefined,
    project_match_note: row._projectMatchNote || undefined,
  };
}
