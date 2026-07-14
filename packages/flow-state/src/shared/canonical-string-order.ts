/**
 * Orders canonical identity strings by their raw UTF-16 code units.
 *
 * JavaScript relational string comparison specifies this order without consulting
 * the host locale or ICU data. Canonical identity deliberately does not normalize
 * Unicode, so distinct source strings remain distinct identities.
 */
export function compareCanonicalStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
