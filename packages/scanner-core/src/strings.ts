/** Short random id for new inventory echoes (same as Wuthering Tools' `utils/strings`). */
export function randomString(len: number = 10): string {
  return Math.random().toString(36).substr(2, len);
}
