const CROP_VARIETIES_BY_SLUG: Record<string, string[]> = {
  jitomate: ["Saladette", "Roma", "Villa", "Strongton", "Cherry", "Bola", "Grape", "Heirloom"],
  arandano: ["Ventura"],
  manzana: ["Golden"]
};

export function cropVarietyOptionsForSlug(slug?: string | null, currentValue?: string | null) {
  const baseOptions = CROP_VARIETIES_BY_SLUG[slug ?? ""] ?? [];
  const current = currentValue?.trim();
  const options = current && !baseOptions.some((option) => option.toLowerCase() === current.toLowerCase())
    ? [...baseOptions, current]
    : baseOptions;

  return Array.from(new Set([...options, "Otra"]));
}
