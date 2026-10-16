// rowTracksPair — a send screen follows its own pair, not whichever one the row moved to (#605).

import assert from 'node:assert/strict'
import { rowTracksPair } from '../broadcast-proposal.ts'

assert.equal(rowTracksPair('ABCD', 'abcd'), true, 'the same reveal, whatever its case')
assert.equal(rowTracksPair('abcd', 'ef01'), false, 'a row that moved to another pair')
assert.equal(rowTracksPair(undefined, 'abcd'), true, 'no reveal on the row: go by the row')
assert.equal(rowTracksPair('abcd', undefined), true, 'no watched reveal: go by the row')
