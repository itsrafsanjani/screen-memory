/**
 * Build a renderer `src` URL for a stored screenshot file.
 *
 * Screenshots are served by the custom `screenmemory://` protocol registered in the
 * main process (see `src/main/index.ts`). Keep that protocol name in this one place so
 * the renderer never re-derives it inline.
 */
export const screenshotSrc = (filePath: string): string =>
  `screenmemory://${encodeURIComponent(filePath)}`
