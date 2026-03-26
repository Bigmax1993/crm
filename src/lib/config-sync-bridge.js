/**
 * Bi-directional sync bridge between the CRM app (localStorage)
 * and an external host (parent window via postMessage).
 *
 * When the CRM is embedded in an iframe on the portfolio site,
 * this module:
 *  1. Receives config from the parent → applies to localStorage
 *  2. Detects local config changes → posts them to the parent
 *
 * Message protocol:
 *   parent → iframe:  { type: "crm-config-sync",  config: { aiSettings: {...}, fxConfig: {...} } }
 *   iframe → parent:  { type: "crm-settings-changed", payload: { aiSettings: {...} } }
 */

import { getAiSettings, saveAiSettings } from "./openai-crm";

const ORIGIN_WHITELIST = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://bigmax1993.github.io",
];

function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ORIGIN_WHITELIST.some(
    (o) => origin === o || origin.startsWith(o + "/")
  );
}

function isInIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

let suppressOutgoing = false;

function handleIncomingMessage(event) {
  if (!isAllowedOrigin(event.origin)) return;
  const data = event.data;
  if (!data || data.type !== "crm-config-sync") return;

  const config = data.config;
  if (!config) return;

  suppressOutgoing = true;
  try {
    if (config.aiSettings) {
      saveAiSettings(config.aiSettings);
    }
  } finally {
    suppressOutgoing = false;
  }
}

function handleLocalSettingsChange() {
  if (suppressOutgoing) return;
  if (!isInIframe()) return;

  try {
    const payload = { aiSettings: getAiSettings() };
    window.parent.postMessage(
      { type: "crm-settings-changed", payload },
      "*"
    );
  } catch {
    /* cross-origin or popup blocker */
  }
}

export function initConfigSyncBridge() {
  window.addEventListener("message", handleIncomingMessage);
  window.addEventListener("fakturowo-ai-settings", handleLocalSettingsChange);

  if (isInIframe()) {
    try {
      window.parent.postMessage({ type: "crm-bridge-ready" }, "*");
    } catch {
      /* ignore */
    }
  }
}
