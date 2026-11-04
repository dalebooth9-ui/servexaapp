/** Try the selected header first, then the generating company's logo. */
export async function loadHeaderLogo<T>(selected: string, fallback: string, load: (url: string) => Promise<T | null>): Promise<{url: string; image: T | null}> {
  for (const url of [...new Set([selected, fallback].filter(Boolean))]) {
    const image = await load(url).catch(() => null);
    if (image) return {url, image};
  }
  return {url: '', image: null};
}