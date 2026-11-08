/** The fixture board named by `?board=`, if the page was opened on one. */
export const FIXTURE = new URLSearchParams(location.search).get('board') ?? undefined
