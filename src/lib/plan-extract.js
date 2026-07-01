import { claudeInvokeWithFile, isClaudeConfigured } from "@/lib/openai-crm";
import { base44 } from "@/api/base44Client";
import { getUploadFilePublicUrl } from "@/lib/upload-file-url";
import { INVOICE_OCR_SCAN_ADDENDUM } from "@/lib/invoice-ocr-prompts";
import { attachProjectMatch, getProjectDisplayName } from "@/lib/match-project";
import { normalizeRooms, projectMatchPayloadFromPlan } from "@/lib/construction-plan-schema";

const PLAN_TYPES = new Set(["site", "floor", "section", "elevation", "detail", "other"]);

export function buildProjectsContextForClaude(projects = []) {
  return projects.map((p) => ({
    id: p.id,
    nazwa_obiektu: p.object_name || "",
    miasto: p.city || "",
    kod_pocztowy: p.postal_code || "",
    klient: p.client_name || "",
    slowa_kluczowe: p.project_match_keywords || "",
    status: p.workflow_status || "",
  }));
}

export function buildPlanExtractionPrompt(projects = []) {
  const projectsJson = JSON.stringify(buildProjectsContextForClaude(projects), null, 2);
  return `Jesteś ekspertem od dokumentacji budowlanej (plany, rzuty, przekroje, elewacje, plany zagospodarowania).

Z załączonego pliku (PDF lub skan/obraz planu) odczytaj metadane i dopasuj plan do JEDNEGO projektu z listy poniżej.

LISTA PROJEKTÓW W SYSTEMIE (użyj dokładnego pola "id" jako projekt_id):
${projectsJson}

WYJŚCIE: wyłącznie jeden obiekt JSON (bez markdown).

Pola planu:
- tytul — tytuł / nazwa rysunku z planu
- numer_arkusza — np. A-01, 1.01, Blatt 3
- rewizja — rewizja / wersja (np. Rev.2, Indeks B)
- skala — np. 1:100, 1:50
- typ_planu — jedna z: site, floor, section, elevation, detail, other
- data_wystawienia — YYYY-MM-DD jeśli widoczna
- projektant — autor / biuro projektowe / architekt
- adres_obiektu — adres budowy z planu
- miasto — miasto z planu
- opis — krótki opis zawartości planu (max 300 znaków)
- pomieszczenia — tablica: { "nazwa": "", "powierzchnia_m2": 0 } (jeśli widać na rzucie)

Dopasowanie projektu (Claude decyduje):
- projekt_id — id z listy projektów powyżej LUB pusty string "" jeśli brak pewnego dopasowania
- projekt_dopasowanie_pewnosc — 0–100
- projekt_dopasowanie_uzasadnienie — 1–2 zdania: dlaczego ten projekt (miasto, nazwa obiektu, klient, adres, słowa kluczowe)

Zasady dopasowania:
- Porównuj miasto, nazwę obiektu, klienta/inwestora, adres, słowa kluczowe z planu z listą projektów.
- Wybierz najbardziej prawdopodobny projekt tylko gdy pewność >= 50; inaczej zostaw projekt_id pusty.
- Nie wymyślaj id spoza listy.

Szablon:
{
  "tytul": "",
  "numer_arkusza": "",
  "rewizja": "",
  "skala": "",
  "typ_planu": "floor",
  "data_wystawienia": "",
  "projektant": "",
  "adres_obiektu": "",
  "miasto": "",
  "opis": "",
  "pomieszczenia": [{ "nazwa": "", "powierzchnia_m2": 0 }],
  "projekt_id": "",
  "projekt_dopasowanie_pewnosc": 0,
  "projekt_dopasowanie_uzasadnienie": ""
}`;
}

export function mapPlanJsonToInternal(j, { fileName } = {}) {
  if (!j) return null;
  const planType = String(j.typ_planu ?? j.plan_type ?? "floor").toLowerCase();
  const projectId = String(j.projekt_id ?? j.project_id ?? "").trim();
  const confidence = Number(j.projekt_dopasowanie_pewnosc ?? j.project_match_confidence ?? 0) || 0;
  return {
    title: String(j.tytul ?? j.title ?? "").trim(),
    sheet_number: String(j.numer_arkusza ?? j.sheet_number ?? "").trim(),
    revision: String(j.rewizja ?? j.revision ?? "").trim(),
    scale: String(j.skala ?? j.scale ?? "").trim(),
    plan_type: PLAN_TYPES.has(planType) ? planType : "other",
    issue_date: String(j.data_wystawienia ?? j.issue_date ?? "").trim(),
    architect: String(j.projektant ?? j.architect ?? "").trim(),
    site_address: String(j.adres_obiektu ?? j.site_address ?? "").trim(),
    city: String(j.miasto ?? j.city ?? "").trim(),
    description: String(j.opis ?? j.description ?? "").trim(),
    rooms: normalizeRooms(
      (j.pomieszczenia || j.rooms || []).map((r) => ({
        name: r.nazwa ?? r.name,
        area_m2: r.powierzchnia_m2 ?? r.area_m2,
      }))
    ),
    project_id: projectId,
    _projectMatchConfidence: confidence,
    _projectMatchNote: String(j.projekt_dopasowanie_uzasadnienie ?? j.project_match_note ?? "").trim(),
    fileName: fileName || "",
  };
}

export function planMappedHasUsableData(mapped) {
  if (!mapped) return false;
  return Boolean(
    mapped.title?.trim() ||
      mapped.sheet_number?.trim() ||
      mapped.site_address?.trim() ||
      mapped.city?.trim()
  );
}

export function titleFromFileName(fileName = "") {
  return String(fileName || "")
    .replace(/\.(pdf|png|jpe?g|webp)$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

/** Waliduje projekt_id zwrócony przez Claude względem listy projektów. */
export function resolveClaudeProjectMatch(mapped, projects = []) {
  if (!mapped) return mapped;
  const id = String(mapped.project_id ?? "").trim();
  if (!id) {
    return {
      ...mapped,
      project_id: "",
      _projectMatchReason: null,
      _projectMatchConfidence: mapped._projectMatchConfidence ?? null,
    };
  }
  const found = projects.find((p) => p.id === id);
  if (!found) {
    return {
      ...mapped,
      project_id: "",
      _projectMatchReason: null,
      _projectMatchNote: mapped._projectMatchNote
        ? `${mapped._projectMatchNote} (Claude podał nieznane id — wymaga ręcznego wyboru)`
        : "Claude podał nieznane id projektu — wymaga ręcznego wyboru",
    };
  }
  const confidence = Number(mapped._projectMatchConfidence ?? 0);
  if (confidence < 50) {
    return {
      ...mapped,
      project_id: "",
      _projectMatchReason: null,
      _projectMatchNote: mapped._projectMatchNote || `Niska pewność (${confidence}%) — wybierz projekt ręcznie`,
    };
  }
  return {
    ...mapped,
    project_id: found.id,
    _projectMatchReason: "claude",
    _projectMatchConfidence: confidence,
  };
}

export function attachPlanProjectMatch(plan, projects, options = {}) {
  if (plan._projectMatchManual) return plan;
  if (plan.project_id && plan._projectMatchReason === "claude") return plan;
  const withClaude = resolveClaudeProjectMatch(plan, projects);
  if (withClaude.project_id) return withClaude;
  return attachProjectMatch(
    { ...withClaude, ...projectMatchPayloadFromPlan(withClaude) },
    projects,
    options
  );
}

export async function extractPlanFromFileClaude(file, projects = []) {
  const prompt = buildPlanExtractionPrompt(projects);
  const parsed = await claudeInvokeWithFile({
    prompt: `${prompt}\n\n${INVOICE_OCR_SCAN_ADDENDUM}`,
    file,
    max_tokens: 8192,
  });
  return { parsed, rawText: JSON.stringify(parsed) };
}

export async function extractPlanFromFileBase44(file, projects = []) {
  const uploadRes = await base44.integrations.Core.UploadFile({ file });
  const fileUrl = getUploadFilePublicUrl(uploadRes);
  if (!fileUrl) {
    throw new Error("Upload pliku nie zwrócił adresu — sprawdź integrację Base44.");
  }
  const prompt = buildPlanExtractionPrompt(projects);
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `${prompt}\n\n${INVOICE_OCR_SCAN_ADDENDUM}`,
    file_urls: [fileUrl],
  });
  const parsed = typeof result === "string" ? JSON.parse(result) : result;
  return { parsed, rawText: JSON.stringify(parsed) };
}

export async function extractPlanFromFile(file, projects = []) {
  let mapped = null;
  let extractionSource = null;

  if (isClaudeConfigured()) {
    try {
      const { parsed } = await extractPlanFromFileClaude(file, projects);
      mapped = mapPlanJsonToInternal(parsed, { fileName: file.name });
      if (planMappedHasUsableData(mapped)) extractionSource = "claude";
    } catch (e) {
      console.warn("Claude plan extract:", e);
    }
  }

  if (!extractionSource) {
    try {
      const { parsed } = await extractPlanFromFileBase44(file, projects);
      mapped = mapPlanJsonToInternal(parsed, { fileName: file.name });
      if (planMappedHasUsableData(mapped)) extractionSource = "base44";
    } catch (e) {
      console.warn("Base44 plan extract:", e);
    }
  }

  if (!planMappedHasUsableData(mapped)) {
    mapped = mapPlanJsonToInternal(
      { tytul: titleFromFileName(file.name) },
      { fileName: file.name }
    );
    extractionSource = extractionSource || "manual";
  }

  const resolved = attachPlanProjectMatch(mapped, projects);

  return {
    mapped: { ...resolved, _extractionSource: extractionSource },
    extractionSource,
  };
}

export function planProjectMatchLabel(row, projects) {
  if (!row.project_id) return "Brak projektu";
  const project = projects.find((p) => p.id === row.project_id);
  const name = getProjectDisplayName(project);
  if (row._projectMatchReason === "claude") {
    const conf = row._projectMatchConfidence ? ` (${row._projectMatchConfidence}%)` : "";
    return `Claude: ${name}${conf}`;
  }
  if (row._projectMatchReason === "manual") return `Ręcznie: ${name}`;
  return name;
}
