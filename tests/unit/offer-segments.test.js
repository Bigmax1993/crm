import { describe, it, expect } from "vitest";
import { OFFER_SEGMENT_OPTIONS, offerSegmentLabel } from "@/lib/offer-segments";

describe("offer-segments", () => {
  it("offerSegmentLabel zwraca etykietę dla znanego kodu", () => {
    expect(offerSegmentLabel("hale_sportowe")).toBe("Hale sportowe");
    expect(offerSegmentLabel("boiska_pilkarskie")).toBe("Boiska piłkarskie");
  });

  it("offerSegmentLabel dla pustego lub nieznanego", () => {
    expect(offerSegmentLabel("")).toBe("—");
    expect(offerSegmentLabel(undefined)).toBe("—");
    expect(offerSegmentLabel("custom_xyz")).toBe("custom_xyz");
  });

  it("OFFER_SEGMENT_OPTIONS zawiera pustą opcję i segmenty", () => {
    const values = OFFER_SEGMENT_OPTIONS.map((o) => o.value);
    expect(values).toContain("");
    expect(values).toContain("renowacje");
    expect(values).toContain("place_zabaw");
  });
});
