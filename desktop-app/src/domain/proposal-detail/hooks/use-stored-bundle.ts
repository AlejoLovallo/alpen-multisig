import { useEffect, useState } from 'react'
import { hasStoredBundle } from '@/api/proposals'

/**
 * Whether this desktop still keeps a commit + reveal bundle for the proposal (#605), read again
 * whenever `refreshKey` changes. `null` while unknown, or when the desktop could not say.
 */
export function useStoredBundle(actionId: string | undefined, refreshKey: unknown): boolean | null {
	const [holdsBundle, setHoldsBundle] = useState<boolean | null>(null)

	useEffect(() => {
		if (actionId === undefined) return
		let active = true
		void hasStoredBundle(actionId).then((res) => {
			if (active) setHoldsBundle(res.ok ? res.data : null)
		})
		return () => {
			active = false
		}
	}, [actionId, refreshKey])

	return holdsBundle
}
