// Minimal MongoDB filter/update semantics used by the compression race tests.
function matches(doc, filter) {
  return Boolean(doc) && Object.entries(filter).every(([key, value]) => {
    if (value && typeof value === "object" && !(value instanceof Date)) {
      if ("$in" in value) return value.$in.includes(doc[key]);
      if ("$ne" in value) return value.$ne === null ? doc[key] != null : doc[key] !== value.$ne;
    }
    return value === null ? doc[key] == null : doc[key] === value;
  });
}

function apply(doc, update) {
  Object.assign(doc, update.$set);
  for (const key of Object.keys(update.$unset || {})) delete doc[key];
  for (const [key, value] of Object.entries(update.$max || {})) doc[key] = Math.max(doc[key] || 0, value);
}

module.exports = { matches, apply };
