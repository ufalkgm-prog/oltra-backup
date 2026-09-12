import { Duffel } from '@duffel/api'

let _duffel: Duffel | null = null

export function getDuffel(): Duffel {
  if (_duffel) return _duffel

  const token = process.env.DUFFEL_ACCESS_TOKEN
  if (!token) {
    throw new Error('DUFFEL_ACCESS_TOKEN is not set')
  }

  _duffel = new Duffel({ token })
  return _duffel
}

/* DUFFEL'S TEST ENVIRONMENT INVENTS A NONSTOP ON EVERY ROUTE, and anything that
 * compares routes has to know that.
 *
 * Measured, not assumed: with a `duffel_test` token, CPH-AXA comes back as a
 * single segment, "Duffel Airways", 10h31 nonstop to Anguilla, and CPH-CMF as a
 * nonstop British Airways to Chambery. Neither exists. Real routes have more
 * test data - CPH-GVA returns 89 offers against 2 - but every one of them is
 * one segment.
 *
 * WHY THAT MATTERS HERE and not anywhere else in the flights code: the fare
 * cards display what the supplier said and a test fare is obviously a test
 * fare, but `gatewayRanking.ts` DECIDES something with these durations. Fed
 * fabricated nonstops, every airport looks equally reachable and the shortest
 * drive wins - which is exactly the fault the ranking was built to remove, so a
 * test-token environment reproduces the bug and looks like a failed fix.
 *
 * So the gateway comparison asks this first and declines to rank rather than
 * ranking on fiction. Inert in production, where the token is a live one. */
export function flightDataIsSynthetic(): boolean {
  return (process.env.DUFFEL_ACCESS_TOKEN ?? "").startsWith("duffel_test")
}
