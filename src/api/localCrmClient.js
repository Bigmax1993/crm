import {
  crmSqlList,
  crmSqlFilter,
  crmSqlCreate,
  crmSqlUpdate,
  crmSqlDelete,
  crmSqlBulkCreate,
} from "@/lib/crm-sql-entity-store";
import { localUploadFile, localInvokeLLM } from "@/lib/local-core-integrations";

function entity(kind) {
  return {
    list: (sort) => crmSqlList(kind, sort),
    filter: (query, sort) => crmSqlFilter(kind, query, sort),
    create: (data) => crmSqlCreate(kind, data),
    update: (id, patch) => crmSqlUpdate(kind, id, patch),
    delete: (id) => crmSqlDelete(kind, id),
    bulkCreate: (rows) => crmSqlBulkCreate(kind, rows),
  };
}

/**
 * Zastępuje klienta Base44: encje w SQLite (sql.js) + Core AI przez OpenAI.
 */
export function createLocalCrmClient() {
  return {
    entities: {
      Invoice: entity("Invoice"),
      ConstructionSite: entity("ConstructionSite"),
      Contractor: entity("Contractor"),
      HotelStay: entity("HotelStay"),
      Transfer: entity("Transfer"),
      Employee: entity("Employee"),
      Contact: entity("Contact"),
      Interaction: entity("Interaction"),
    },
    integrations: {
      Core: {
        UploadFile: localUploadFile,
        InvokeLLM: localInvokeLLM,
      },
    },
    auth: {
      me: async () => null,
    },
    appLogs: {
      logUserInApp: async () => {},
    },
  };
}
