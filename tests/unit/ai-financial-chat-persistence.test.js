import { describe, it, expect, beforeEach } from "vitest";
import {
  deriveConversationTitle,
  sanitizeMessagesForPersist,
  saveFinancialChatState,
  loadFinancialChatState,
  createEmptyConversation,
} from "@/lib/ai-financial-chat-persistence";

describe("ai-financial-chat-persistence", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("wyprowadza tytuł z pierwszej wiadomości użytkownika", () => {
    expect(
      deriveConversationTitle([
        { role: "assistant", content: "OK" },
        { role: "user", content: "Pytanie o cash flow" },
      ])
    ).toBe("Pytanie o cash flow");
  });

  it("usuwa loading i zapisuje tylko treści wiadomości", () => {
    const out = sanitizeMessagesForPersist([
      { role: "user", content: "A" },
      { role: "assistant", content: null, loading: true },
      { role: "assistant", content: "B" },
    ]);
    expect(out).toEqual([
      { role: "user", content: "A" },
      { role: "assistant", content: "B" },
    ]);
  });

  it("zapisuje i wczytuje stan (bez loading w pamięci)", () => {
    const c = createEmptyConversation();
    c.messages = [{ role: "user", content: "Test" }];
    c.messages.push({ role: "assistant", content: "", loading: true });
    saveFinancialChatState([c], c.id);
    const d = loadFinancialChatState();
    expect(d.conversations[0].messages).toEqual([{ role: "user", content: "Test" }]);
    expect(d.activeId).toBe(c.id);
  });

  it("skraca bardzo długi tytuł rozmowy", () => {
    const long = "a".repeat(55);
    const title = deriveConversationTitle([{ role: "user", content: long }]);
    expect(title).toHaveLength(46);
    expect(title).toMatch(/…$/);
  });

  it("loadFinancialChatState zwraca null przy uszkodzonym localStorage", () => {
    localStorage.setItem("fakturowo_financial_ai_conversations_v1", "{broken");
    expect(loadFinancialChatState()).toBeNull();
  });

  it("loadFinancialChatState odrzuca activeId spoza listy konwersacji", () => {
    const c = createEmptyConversation();
    saveFinancialChatState([c], "nie-istnieje");
    const d = loadFinancialChatState();
    expect(d.activeId).toBeNull();
    expect(d.conversations).toHaveLength(1);
  });

  it("createEmptyConversation zwraca id i pustą listę wiadomości", () => {
    const c = createEmptyConversation();
    expect(c.id).toBeTruthy();
    expect(c.messages).toEqual([]);
    expect(c.title).toBe("Nowa rozmowa");
  });
});
