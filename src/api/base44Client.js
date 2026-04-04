import { createClient } from "@base44/sdk";
import { appParams } from "@/lib/app-params";
import { createLocalCrmClient } from "@/api/localCrmClient";

const { appId, token, functionsVersion, appBaseUrl } = appParams;

function shouldUseLocalCrmBackend() {
  if (import.meta.env.VITE_USE_LOCAL_CRM === "true") return true;
  if (import.meta.env.VITE_USE_LOCAL_CRM === "false") return false;
  return !String(import.meta.env.VITE_BASE44_APP_ID || "").trim();
}

/** Backend: Base44 (chmura) albo SQLite w przeglądarce — zależnie od zmiennych środowiska. */
export const base44 = shouldUseLocalCrmBackend()
  ? createLocalCrmClient()
  : createClient({
      appId,
      token,
      functionsVersion,
      serverUrl: "",
      requiresAuth: false,
      appBaseUrl,
    });
