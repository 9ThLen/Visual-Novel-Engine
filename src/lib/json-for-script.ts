/**
 * A value as JSON that can stand inside an HTML `<script>` element, or inside
 * script handed to a WebView: every `<` is escaped, so no `</script>` in the
 * value can end the element it travels in. Shared by the editor's frame and the
 * comic frame, which the player ships.
 */
export function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}
