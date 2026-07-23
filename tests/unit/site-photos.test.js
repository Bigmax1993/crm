import { describe, it, expect } from "vitest";
import {
  normalizeSitePhotos,
  primarySitePhoto,
  sitePhotosLabel,
  SITE_PHOTOS_MAX,
} from "@/lib/site-photos";

describe("normalizeSitePhotos", () => {
  it("bierze photos[] gdy są", () => {
    expect(
      normalizeSitePhotos({
        photos: ["a", "b"],
        photo_documentation: "legacy",
      })
    ).toEqual(["a", "b"]);
  });

  it("fallback do photo_documentation", () => {
    expect(normalizeSitePhotos({ photo_documentation: "solo" })).toEqual(["solo"]);
  });

  it("usuwa puste i duplikaty, limituje max", () => {
    const many = Array.from({ length: SITE_PHOTOS_MAX + 5 }, (_, i) => `u${i}`);
    const out = normalizeSitePhotos({ photos: ["x", "", "x", ...many] });
    expect(out[0]).toBe("x");
    expect(out.length).toBe(SITE_PHOTOS_MAX);
  });
});

describe("primarySitePhoto / sitePhotosLabel", () => {
  it("primary", () => {
    expect(primarySitePhoto(["a", "b"])).toBe("a");
    expect(primarySitePhoto([])).toBe("");
  });

  it("label PL", () => {
    expect(sitePhotosLabel(0)).toBe("");
    expect(sitePhotosLabel(1)).toBe("1 zdjęcie");
    expect(sitePhotosLabel(3)).toBe("3 zdjęcia");
    expect(sitePhotosLabel(5)).toBe("5 zdjęć");
  });
});
