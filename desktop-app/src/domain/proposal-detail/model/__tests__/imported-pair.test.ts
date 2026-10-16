// imported-pair — the import tells the user when the orchestrator ignored its pair (#605).

import assert from 'node:assert/strict'
import { importedPairIgnored } from '../imported-pair'

const REVEAL = 'ab'.repeat(32)
const OTHER = 'cd'.repeat(32)

assert.equal(importedPairIgnored(REVEAL, REVEAL), false, 'the row tracks the imported reveal')
assert.equal(importedPairIgnored(REVEAL, REVEAL.toUpperCase()), false, 'txids compare case-insensitively')
assert.equal(importedPairIgnored(REVEAL, OTHER), true, 'the row tracks another pair')
assert.equal(importedPairIgnored(REVEAL, undefined), true, 'the row tracks no pair')
assert.equal(
	importedPairIgnored(null, OTHER),
	true,
	'an import without a reveal does not move a row that tracks a pair',
)
assert.equal(importedPairIgnored(null, undefined), false, 'an import without a reveal on a row with none is applied')

console.log('imported-pair: all assertions passed')
