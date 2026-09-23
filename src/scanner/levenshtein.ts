/** Classic edit-distance, used to fuzzy-match OCR'd echo names against the known echo list. */
export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let previousRow = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) previousRow[j] = j;

  for (let i = 0; i < a.length; i++) {
    const currentRow = [i + 1];
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      currentRow.push(
        Math.min(
          currentRow[j] + 1, // insertion
          previousRow[j + 1] + 1, // deletion
          previousRow[j] + cost, // substitution
        ),
      );
    }
    previousRow = currentRow;
  }
  return previousRow[b.length];
}

/** 1 = identical, 0 = completely different. */
export function levenshteinSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}
