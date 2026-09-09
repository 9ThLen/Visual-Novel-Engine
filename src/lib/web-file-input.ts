/**
 * Open the browser file dialog and resolve with the chosen File, or null when
 * the user cancels.
 *
 * A bare `<input type="file">` only fires `change` on selection — never on
 * cancel — so a naive Promise wrapper hangs forever if the dialog is dismissed.
 * We resolve cancellation two ways for coverage across browsers:
 *   - the native `cancel` event (Chromium, Firefox, Safari 16+), and
 *   - a window `focus` fallback: when focus returns after the dialog closes and
 *     no file was selected, treat it as a cancel.
 * The listeners and the transient input are always torn down once settled.
 */
export function openWebFileDialog(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';

    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', onFocus);
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      input.remove();
      resolve(file);
    };

    const onChange = () => finish(input.files?.[0] ?? null);
    const onCancel = () => finish(null);
    const onFocus = () => {
      // `change` may fire slightly after `focus`; defer so a real selection is
      // observed before we conclude the dialog was cancelled.
      setTimeout(() => {
        if (!settled && !input.files?.length) finish(null);
      }, 300);
    };

    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    document.body.appendChild(input);
    window.addEventListener('focus', onFocus);
    input.click();
  });
}

/** Read a File as a UTF-8 text string, resolving null on failure. */
export function readFileAsText(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

/** Read a File as a data: URL, resolving null on failure. */
export function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}
