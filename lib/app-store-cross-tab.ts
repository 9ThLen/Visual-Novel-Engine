/** Native/test fallback; Metro selects app-store-cross-tab.web.ts on web. */
export type TranslateWarning = () => string;

export function startAppStoreCrossTabWarning(_translate: TranslateWarning): () => void {
  return () => {};
}
