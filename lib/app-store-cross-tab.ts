/** Native/test fallback; Metro selects app-store-cross-tab.web.ts on web. */
export function startAppStoreCrossTabWarning(): () => void {
  return () => {};
}
