/** Downloads embedded content, including from a standalone HTML file or a subpath. */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  try {
    document.body.appendChild(anchor);
    anchor.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    anchor.remove();
  }
  // Some browsers consume the URL after the click handler has returned.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A false result leaves the code selected so the user can copy it manually. */
export async function copyText(text: string, textarea: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Clipboard permissions may be unavailable in an embedded or offline page.
  }
  if (!textarea) return false;
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}
