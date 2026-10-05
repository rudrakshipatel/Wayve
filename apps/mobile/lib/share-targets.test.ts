import { describe, expect, it } from "vitest";
import { shareMessage, shareTargetUrl } from "./share-targets";

const url = "https://wave.app/journey/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCdE";

describe("share targets", () => {
  it("only distributes the Wave link", () => {
    expect(shareMessage(url, "Evening drive")).toContain(url);
    for (const target of ["whatsapp", "sms", "telegram", "email"] as const) {
      const out = shareTargetUrl(target, url, "Evening drive");
      expect(decodeURIComponent(out)).toContain(url);
    }
  });
  it("uses platform-specific SMS syntax", () => {
    expect(shareTargetUrl("sms", url, "x", "android")).toMatch(/^sms:\?body=/);
    expect(shareTargetUrl("sms", url, "x", "ios")).toMatch(/^sms:&body=/);
  });
  it("targets public share endpoints", () => {
    expect(shareTargetUrl("whatsapp", url, "x")).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(shareTargetUrl("telegram", url, "x")).toMatch(/^https:\/\/t\.me\/share\/url\?url=/);
    expect(shareTargetUrl("email", url, "x")).toMatch(/^mailto:\?subject=/);
  });
});
