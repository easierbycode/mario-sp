// Shared loader for /codemonkey.json — fetched once and cached, so the
// gamepad mapping and the touch-controls option read the same config.

let promise: Promise<any | null> | null = null

export function loadCodemonkeyConfig(): Promise<any | null> {
  // BASE_URL-relative so it works under a GitHub Pages subpath
  promise ??= fetch(`${import.meta.env.BASE_URL}codemonkey.json`)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
  return promise
}
