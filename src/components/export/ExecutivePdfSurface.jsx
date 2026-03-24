import React, { forwardRef, useMemo } from "react";
import {
  EXPORT_BRAND_RGB,
  getExportReportTitle,
  EXPORT_ADDRESS,
  EXPORT_WEB,
} from "@/lib/brand-brief";

const BG = "hsl(40, 7%, 96%)";
const CARD = "hsl(40, 7%, 96%)";
const TEXT = "#323130";
const MUTED = "#605e5c";
const BORDER = "#e1dfdd";
const ACCENT = `rgb(${EXPORT_BRAND_RGB.r}, ${EXPORT_BRAND_RGB.g}, ${EXPORT_BRAND_RGB.b})`;
const GREEN = "#107c10";
const RED = "#d13438";

function formatPln(n) {
  if (n == null || !Number.isFinite(Number(n))) return "—";
  return `${Number(n).toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} zł`;
}

function KpiCard({ label, value, tone }) {
  const borderColor = tone === "positive" ? GREEN : tone === "negative" ? RED : ACCENT;
  return (
    <div
      style={{
        background: CARD,
        borderRadius: 10,
        padding: "18px 20px",
        boxShadow: "0 1.6px 3.6px rgba(0,0,0,.08), 0 0.3px 0.9px rgba(0,0,0,.06)",
        borderLeft: `4px solid ${borderColor}`,
        flex: 1,
        minWidth: 200,
      }}
    >
      <div style={{ fontSize: 11, color: MUTED, fontWeight: 600, letterSpacing: "0.02em", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color: TEXT, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2
      style={{
        fontSize: 14,
        fontWeight: 700,
        color: TEXT,
        margin: "0 0 14px 0",
        letterSpacing: "0.01em",
      }}
    >
      {children}
    </h2>
  );
}

function CashFlowBars({ rows }) {
  const { slice, max } = useMemo(() => {
    const s = rows.slice(-8);
    let m = 1;
    s.forEach((r) => {
      m = Math.max(m, r.wplywy || 0, r.wydatki || 0);
    });
    return { slice: s, max: m };
  }, [rows]);

  if (!slice.length) {
    return (
      <div style={{ color: MUTED, fontSize: 12, padding: "8px 0" }}>Brak danych cash flow (brak opłaconych FV w okresie).</div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {slice.map((r) => (
        <div key={r.month}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: TEXT }}>{r.month}</span>
            <span style={{ fontSize: 10, color: MUTED }}>
              saldo narastające: <strong style={{ color: TEXT }}>{formatPln(r.saldoNarastajace)}</strong>
            </span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 22 }}>
            <div
              title={`Wpływy ${formatPln(r.wplywy)}`}
              style={{
                width: `${Math.max(4, (r.wplywy / max) * 100)}%`,
                maxWidth: "100%",
                height: 18,
                background: GREEN,
                borderRadius: 4,
                opacity: 0.92,
              }}
            />
            <div
              title={`Wydatki ${formatPln(r.wydatki)}`}
              style={{
                width: `${Math.max(4, (r.wydatki / max) * 100)}%`,
                maxWidth: "100%",
                height: 18,
                background: RED,
                borderRadius: 4,
                opacity: 0.85,
              }}
            />
          </div>
          <div style={{ fontSize: 9, color: MUTED, marginTop: 2 }}>
            <span style={{ color: GREEN }}>■</span> wpływy &nbsp;
            <span style={{ color: RED }}>■</span> wydatki
          </div>
        </div>
      ))}
    </div>
  );
}

const ExecutivePdfSurface = forwardRef(function ExecutivePdfSurfaceInner(
  { kpi, cashRows, topProjects, generatedLabel },
  ref
) {
  const maxWynik = useMemo(() => {
    if (!topProjects.length) return 1;
    return Math.max(...topProjects.map((t) => Math.abs(t.wynik) || 0), 1);
  }, [topProjects]);

  return (
    <div
      ref={ref}
      data-export-pdf-surface
      style={{
        width: 794,
        boxSizing: "border-box",
        background: BG,
        fontFamily: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif',
        color: TEXT,
        padding: "28px 32px 36px",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      <header
        style={{
          background: ACCENT,
          color: "#fff",
          margin: "-28px -32px 24px",
          padding: "22px 32px 20px",
          borderRadius: "0 0 12px 12px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
              {getExportReportTitle()}
            </div>
            <div style={{ fontSize: 11, opacity: 0.95, marginTop: 8, lineHeight: 1.5 }}>
              {EXPORT_ADDRESS || "—"}
              <br />
              {EXPORT_WEB ? EXPORT_WEB.replace("https://", "") : ""}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, opacity: 0.9 }}>
            <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>Raport zarządczy</div>
            <div>{generatedLabel}</div>
          </div>
        </div>
      </header>

      <SectionTitle>Wskaźniki (KPI)</SectionTitle>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 28 }}>
        <KpiCard label="Należności" value={formatPln(kpi.naleznosci)} />
        <KpiCard label="Zobowiązania" value={formatPln(kpi.zobowiazania)} />
        <KpiCard label="Wynik netto (FV zapłacone)" value={formatPln(kpi.wynik)} tone={kpi.wynik >= 0 ? "positive" : "negative"} />
      </div>

      <div
        style={{
          background: CARD,
          borderRadius: 10,
          padding: "20px 22px",
          marginBottom: 20,
          boxShadow: "0 1.6px 3.6px rgba(0,0,0,.06)",
          border: `1px solid ${BORDER}`,
        }}
      >
        <SectionTitle>Cash flow — ostatnie miesiące (skrót)</SectionTitle>
        <CashFlowBars rows={cashRows} />
      </div>

      <div
        style={{
          background: CARD,
          borderRadius: 10,
          padding: "20px 22px",
          boxShadow: "0 1.6px 3.6px rgba(0,0,0,.06)",
          border: `1px solid ${BORDER}`,
        }}
      >
        <SectionTitle>Top projekty wg rentowności</SectionTitle>
        {!topProjects.length ? (
          <div style={{ color: MUTED, fontSize: 12 }}>Brak danych o projektach lub powiązań faktur z budowami.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${BORDER}` }}>
                <th style={{ textAlign: "left", padding: "10px 8px", color: MUTED, fontWeight: 600 }}>#</th>
                <th style={{ textAlign: "left", padding: "10px 8px", color: MUTED, fontWeight: 600 }}>Projekt</th>
                <th style={{ textAlign: "right", padding: "10px 8px", color: MUTED, fontWeight: 600 }}>Wynik</th>
                <th style={{ textAlign: "left", padding: "10px 8px 10px 16px", color: MUTED, fontWeight: 600, width: "38%" }}>
                  Skala
                </th>
              </tr>
            </thead>
            <tbody>
              {topProjects.map((t, i) => {
                const name = t.project?.object_name || t.project?.city || "—";
                const pct = Math.min(100, (Math.abs(t.wynik) / maxWynik) * 100);
                const barColor = t.wynik >= 0 ? GREEN : RED;
                return (
                  <tr key={t.project?.id ?? `row-${i}`} style={{ borderBottom: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "12px 8px", fontWeight: 600, color: MUTED }}>{i + 1}</td>
                    <td style={{ padding: "12px 8px", fontWeight: 600 }}>{name}</td>
                    <td style={{ padding: "12px 8px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                      {formatPln(t.wynik)}
                    </td>
                    <td style={{ padding: "12px 8px 12px 16px", verticalAlign: "middle" }}>
                      <div style={{ height: 8, background: "#edebe9", borderRadius: 4, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            background: barColor,
                            borderRadius: 4,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <footer style={{ marginTop: 22, fontSize: 9, color: MUTED, textAlign: "center" }}>
        Dokument wygenerowany w aplikacji Fakturowo · dane w PLN według logiki NBP na dzień wystawienia faktury
      </footer>
    </div>
  );
});

ExecutivePdfSurface.displayName = "ExecutivePdfSurface";

export default ExecutivePdfSurface;
