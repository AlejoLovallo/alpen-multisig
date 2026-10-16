/**
 * Whether the orchestrator kept the broadcast state an import reported (#605).
 *
 * A report about a pair the row does not track changes nothing and still answers 200, so the
 * import has to compare the reveal it sent with the one the row tracks to know it was ignored. An
 * import that named no reveal is ignored too once the row tracks a pair: a report that names no
 * reveal does not move a tagged row.
 */
export function importedPairIgnored(importedRevealTxid: string | null, trackedRevealTxid: string | undefined): boolean {
	if (importedRevealTxid === null) return trackedRevealTxid !== undefined
	return importedRevealTxid.toLowerCase() !== trackedRevealTxid?.toLowerCase()
}

export const IMPORTED_PAIR_IGNORED_NOTICE =
	'The imported broadcast state was not recorded: this proposal already tracks a different commit + reveal.'
