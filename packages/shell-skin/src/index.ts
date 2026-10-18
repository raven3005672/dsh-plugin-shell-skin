/**
 * Host half of shell-skin: an empty Loader seat. Everything this plugin does
 * happens in the browser, so the row exists only to put the package into the
 * client module graph.
 */
export const name = 'shell-skin'

/** No host-side registrations. */
export function apply(): void {}
