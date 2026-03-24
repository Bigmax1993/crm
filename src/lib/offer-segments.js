/**
 * Segmenty oferty (budownictwo sportowe / obiekty).
 */
export const OFFER_SEGMENT_OPTIONS = [
  { value: "", label: "— nie wybrano —" },
  { value: "boiska_wielofunkcyjne", label: "Boiska wielofunkcyjne i korty" },
  { value: "boiska_pilkarskie", label: "Boiska piłkarskie" },
  { value: "hale_sportowe", label: "Hale sportowe" },
  { value: "lekkoatletyka", label: "Obiekty lekkoatletyczne" },
  { value: "renowacje", label: "Renowacje nawierzchni" },
  { value: "place_zabaw", label: "Place zabaw" },
  { value: "podlogi_wewnetrzne", label: "Podłogi wewnętrzne" },
  { value: "inne", label: "Inne / mieszane" },
];

export function offerSegmentLabel(value) {
  if (value == null || value === "") return "—";
  const o = OFFER_SEGMENT_OPTIONS.find((x) => x.value === value);
  return o ? o.label : String(value);
}
