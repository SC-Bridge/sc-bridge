/**
 * Slug generation utilities — ported from Go (internal/api/router.go).
 *
 * Used to match HangarXplor ship_codes/names to the vehicle reference DB.
 */

/**
 * Converts a HangarXplor ship_code to a slug.
 * "MISC_Hull_D" → "hull-d", "ANVL_F7A_Hornet_Mk_I" → "f7a-hornet-mk-i"
 *
 * Strips the manufacturer prefix (first underscore-delimited segment),
 * lowercases the rest, joins with hyphens.
 */
export function slugFromShipCode(code: string): string {
  const parts = code.split("_");
  if (parts.length <= 1) {
    return code.toLowerCase();
  }
  const modelParts = parts.slice(1);
  return modelParts
    .filter((p) => p !== "")
    .map((p) => p.toLowerCase())
    .join("-");
}

/**
 * Converts a display name to a slug.
 * "Hull D" → "hull-d", "A.T.L.S." → "atls"
 *
 * Strips punctuation (except hyphens), collapses spaces/underscores to hyphens.
 */
export function slugFromName(name: string): string {
  const result: string[] = [];
  let prevDash = false;

  for (let i = 0; i < name.length; i++) {
    let c = name[i];

    // Lowercase
    if (c >= "A" && c <= "Z") {
      c = String.fromCharCode(c.charCodeAt(0) + 32);
    }

    // Space/underscore → hyphen (no consecutive hyphens)
    if (c === " " || c === "_") {
      if (!prevDash && result.length > 0) {
        result.push("-");
        prevDash = true;
      }
      continue;
    }

    // Keep alphanumeric and hyphens only
    if ((c >= "a" && c <= "z") || (c >= "0" && c <= "9") || c === "-") {
      result.push(c);
      prevDash = c === "-";
    }
  }

  // Trim trailing hyphens
  while (result.length > 0 && result[result.length - 1] === "-") {
    result.pop();
  }

  return result.join("");
}

/**
 * Strips ALL non-alphanumeric characters from a slug.
 * "a-t-l-s" → "atls", "f7a-hornet" → "f7ahornet"
 */
export function compactSlug(s: string): string {
  const result: string[] = [];

  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (c >= "A" && c <= "Z") {
      c = String.fromCharCode(c.charCodeAt(0) + 32);
    }
    if ((c >= "a" && c <= "z") || (c >= "0" && c <= "9")) {
      result.push(c);
    }
  }

  return result.join("");
}

/**
 * Folds diacritics to their base letters: "Hyūn" → "Hyun", "San'tok.yāi" → "San'tok.yai".
 *
 * RSI titles some ships with diacritics while the vehicles table may spell them in
 * plain ASCII (or the other way round). The slug helpers above silently drop
 * non-ASCII letters ("Hyūn" → "hyn"), so fold before slugging or comparing (#282).
 */
export function foldDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
