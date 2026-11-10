const missing = Symbol('missing');
export function sameDraft(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameDraft(a[key], b[key]));
}

// A line is indivisible: independently replacing its words and recording could
// silently pair the wrong take with the subtitles. Conflicting lines stay local.
export function mergeDrafts(base, local, remote) {
  const conflicts = [];
  function choose(before, mine, theirs, path) {
    if (sameDraft(mine, before) || sameDraft(mine, theirs)) return theirs;
    if (sameDraft(theirs, before)) return mine;
    conflicts.push(path);
    return mine;
  }
  function entries(before, mine, theirs, path = '') {
    return Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(mine), ...Object.keys(theirs)])].flatMap(key => {
      const values = [before, mine, theirs].map(value => Object.hasOwn(value, key) ? value[key] : missing);
      const value = !path && ['lines', 'speakers', 'portraits'].includes(key) && values.every(v => v !== missing)
        ? entries(...values, key)
        : choose(...values, path ? path + '.' + key : key);
      return value === missing ? [] : [[key, value]];
    }));
  }
  return {document:structuredClone(entries(base, local, remote)), conflicts};
}
