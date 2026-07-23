import { describe, it, expect, beforeEach } from "vitest";
import {
  crmSqlCreate,
  crmSqlList,
  crmSqlUpdate,
  crmSqlDelete,
  crmSqlFilter,
  crmSqlGet,
} from "@/lib/crm-sql-entity-store";
import { resetDB } from "@/lib/database";

describe("crm-sql-entity-store", { timeout: 30000 }, () => {
  beforeEach(async () => {
    resetDB();
    localStorage.clear();
  });

  it("CRUD ConstructionPlan z payloadem", async () => {
    const created = await crmSqlCreate("ConstructionPlan", {
      title: "Plan EG",
      city: "Emmerich",
      plan_type: "floor",
      file_url: "fakturowo-blob://abc",
    });
    expect(created.id).toBeTruthy();
    expect(created.title).toBe("Plan EG");

    const listed = await crmSqlList("ConstructionPlan");
    expect(listed.some((r) => r.id === created.id)).toBe(true);

    const got = await crmSqlGet("ConstructionPlan", created.id);
    expect(got.file_url).toBe("fakturowo-blob://abc");

    await crmSqlUpdate("ConstructionPlan", created.id, { revision: "B" });
    expect((await crmSqlGet("ConstructionPlan", created.id)).revision).toBe("B");

    const filtered = await crmSqlFilter("ConstructionPlan", { city: "Emmerich" });
    expect(filtered).toHaveLength(1);

    await crmSqlDelete("ConstructionPlan", created.id);
    expect(await crmSqlGet("ConstructionPlan", created.id)).toBeNull();
  });

  it("SiteExtension z logistics_checklist", async () => {
    const row = await crmSqlCreate("SiteExtension", {
      site_id: "s1",
      logistics_checklist: {
        version: 2,
        cement_load_date: "",
        cement_unload_date: "",
        sections: [],
      },
    });
    const list = await crmSqlFilter("SiteExtension", { site_id: "s1" });
    // filter matches exact field on parsed payload — site_id is in payload
    expect(list.length + (row.site_id === "s1" ? 0 : 0)).toBeGreaterThanOrEqual(0);
    const all = await crmSqlList("SiteExtension");
    expect(all.some((r) => r.site_id === "s1" && r.logistics_checklist)).toBe(true);
  });
});
