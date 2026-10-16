/**
 * Whether the orchestrator kept the commit + reveal an import reported (#605).
 *
 * A report about a pair the row does not track changes nothing and still answers 200, so the
 * import has to compare the reveal it sent with the one the row tracks to know it was ignored.
 * An import that named no reveal reported no pair, and is never "ignored".
 */
export function importedPairIgnored(importedRevealTxid: string | null, trackedRevealTxid: string | undefined): boolean {
	if (importedRevealTxid === null) return false
	return importedRevealTxid.toLowerCase() !== trackedRevealTxid?.toLowerCase()
}

export const IMPORTED_PAIR_IGNORED_NOTICE =
	'The imported commit + reveal was not recorded: this proposal already tracks a different pair.'
