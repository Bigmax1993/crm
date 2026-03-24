const LS_KEY = "fakturowo_financial_ai_conversations_v1";

export function makeConversationId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

export function deriveConversationTitle(messages) {
  const first = [...(messages || [])].find(
    (m) => m.role === "user" && String(m.content || "").trim() && !m.loading
  );
  const t = String(first?.content || "").trim();
  if (!t) return "Nowa rozmowa";
  return t.length > 48 ? `${t.slice(0, 45)}…` : t;
}

export function sanitizeMessagesForPersist(messages) {
  return (messages || [])
    .filter((m) => m && !m.loading && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({ role: m.role, content: m.content ?? "" }));
}

export function loadFinancialChatState() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || !Array.isArray(o.conversations)) return null;
    const conversations = o.conversations.map((c) => ({
      id: String(c.id || makeConversationId()),
      title: String(c.title || "Rozmowa"),
      updatedAt: Number(c.updatedAt) || 0,
      messages: Array.isArray(c.messages) ? c.messages : [],
    }));
    const activeId = o.activeId && conversations.some((x) => x.id === o.activeId) ? o.activeId : null;
    return { conversations, activeId };
  } catch {
    return null;
  }
}

export function saveFinancialChatState(conversations, activeId) {
  try {
    const sanitized = (conversations || []).map((c) => {
      const messages = sanitizeMessagesForPersist(c.messages);
      return {
        ...c,
        messages,
        title: deriveConversationTitle(messages),
      };
    });
    localStorage.setItem(LS_KEY, JSON.stringify({ conversations: sanitized, activeId }));
  } catch {
    /* quota */
  }
}

export function createEmptyConversation() {
  const id = makeConversationId();
  return {
    id,
    title: "Nowa rozmowa",
    updatedAt: Date.now(),
    messages: [],
  };
}
