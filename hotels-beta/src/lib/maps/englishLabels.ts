/* ENGLISH ON THE MAP, EVERYWHERE (Ulrik, 2026-09-21).
 *
 * MapTiler's streets-v4 is only partly English, which is why some labels came
 * back in the local language. Counted from the live style on 2026-09-21, of
 * its 54 label layers:
 *
 *   17  already prefer English — `coalesce(name:en, name)`, plus Continent
 *       labels on a bare `{name:en}`
 *   22  are the legacy token `"{name}"`, which is the local name and nothing
 *       else — Ocean labels, Food, Sport, Street furniture, Tree name…
 *    3  are `coalesce(name, "")` — Ferry terminal, Subway station, Railway
 *       station
 *    4  have it the wrong way round, `coalesce(name, name:en)`: the local name
 *       first and English only as a fallback. The three State labels layers
 *       and Airport labels.
 *    8  carry no name at all — road shields, house numbers, gate refs
 *
 * `?language=en` on the style URL does NOT fix this: the style it returns is
 * byte-identical, checked both ways. So the expressions are rewritten here
 * after the style loads.
 *
 * THE RULE IS ONE SUBSTITUTION, applied everywhere it appears at any depth:
 * `["get", "name"]` becomes `["coalesce", ["get", "name:en"], ["get", "name"]]`.
 *
 * Recursing rather than replacing the whole text-field is what keeps the
 * awkward layers right. Airport labels read
 * `step(zoom, coalesce(iata, icao, ""), 12, coalesce(name, iata, icao, ""))` —
 * wrapping that whole expression in an English preference would put the
 * airport's name at every zoom and lose the IATA code the low zooms show. Only
 * the inner `name` moves.
 *
 * A layer whose English preference is already in place is left untouched, so
 * running this twice changes nothing. */

type Expression = unknown;

const ENGLISH_FIRST = ["coalesce", ["get", "name:en"], ["get", "name"]];

function isGetName(value: Expression): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === "get" &&
    value[1] === "name"
  );
}

/** Already `coalesce(name:en, …)` — the substitution has been made, or the
 * style shipped it that way. */
function isEnglishFirst(value: Expression): boolean {
  return (
    Array.isArray(value) &&
    value[0] === "coalesce" &&
    Array.isArray(value[1]) &&
    value[1][0] === "get" &&
    value[1][1] === "name:en"
  );
}

export function englishLabelExpression(textField: Expression): Expression {
  /* The legacy token form. Only an exact "{name}" is converted: a mixed
   * template ("{ref} {name}") would need parsing, and no layer in this style
   * uses one for a name. */
  if (typeof textField === "string") {
    return textField.trim() === "{name}" ? ENGLISH_FIRST : textField;
  }

  if (!Array.isArray(textField)) return textField;
  if (isEnglishFirst(textField)) return textField;
  if (isGetName(textField)) return ENGLISH_FIRST;

  return textField.map((item) =>
    isGetName(item) ? ENGLISH_FIRST : englishLabelExpression(item)
  );
}

/** What `applyEnglishLabels` needs of a map, so it can be called with a real
 * MapLibre map or anything that behaves like one. */
type LabelledMap = {
  getStyle: () => { layers?: { id: string; layout?: Record<string, unknown> }[] } | undefined;
  setLayoutProperty: (layer: string, property: string, value: unknown) => void;
};

/** Rewrite every label layer to prefer English. Call once the style has
 * loaded — `getStyle()` has no layers before that. */
export function applyEnglishLabels(map: LabelledMap): void {
  const layers = map.getStyle()?.layers ?? [];

  for (const layer of layers) {
    const textField = layer.layout?.["text-field"];
    if (textField === undefined) continue;

    const next = englishLabelExpression(textField);
    if (JSON.stringify(next) === JSON.stringify(textField)) continue;

    try {
      map.setLayoutProperty(layer.id, "text-field", next);
    } catch {
      /* One layer refusing its new expression is not a reason to leave the
         other fifty in the local language. */
    }
  }
}
