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
