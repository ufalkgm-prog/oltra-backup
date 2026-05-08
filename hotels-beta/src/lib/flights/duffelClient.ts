import { Duffel } from '@duffel/api'

let _duffel: Duffel | null = null

export function getDuffel(): Duffel {
  if (_duffel) return _duffel

  const isProduction = process.env.VERCEL_ENV === 'production'
  const token = isProduction
    ? process.env.DUFFEL_ACCESS_TOKEN_LIVE
    : process.env.DUFFEL_ACCESS_TOKEN_TEST

  if (!token) {
    throw new Error(
      isProduction
        ? 'DUFFEL_ACCESS_TOKEN_LIVE is not set'
        : 'DUFFEL_ACCESS_TOKEN_TEST is not set'
    )
  }

  _duffel = new Duffel({ token })
  return _duffel
}
