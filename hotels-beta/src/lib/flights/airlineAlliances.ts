export type Alliance = 'star' | 'oneworld' | 'skyteam'

// SAS (SK) is SkyTeam, not Star: it left Star Alliance on 31 August 2024 and
// joined SkyTeam on 1 September 2024. Listed as Star until 2026-09-24, which
// gave SAS flights "Alliance partner" badges beside Lufthansa and United.
const STAR = new Set([
  'AC', 'CA', 'AI', 'NZ', 'NH', 'OZ', 'OS', 'AV', 'SN', 'CM',
  'OU', 'MS', 'ET', 'BR', 'LO', 'LH', 'ZH', 'SQ', 'SA',
  'LX', 'TP', 'TG', 'TK', 'UA',
])

const ONEWORLD = new Set([
  'AS', 'AA', 'BA', 'CX', 'AY', 'IB', 'JL', 'MH', 'QF', 'QR',
  'AT', 'RJ', 'UL', 'WY', 'FJ',
])

const SKYTEAM = new Set([
  'AR', 'AM', 'UX', 'AF', 'CI', 'MU', 'OK', 'DL', 'GA', 'AZ',
  'KQ', 'KL', 'KE', 'ME', 'SV', 'RO', 'VN', 'VS', 'MF', 'SK',
])

export function getAlliance(iataCode: string | null | undefined): Alliance | null {
  if (!iataCode) return null
  const code = iataCode.toUpperCase()
  if (STAR.has(code)) return 'star'
  if (ONEWORLD.has(code)) return 'oneworld'
  if (SKYTEAM.has(code)) return 'skyteam'
  return null
}

export function sharedAlliance(codes: (string | null | undefined)[]): Alliance | null {
  if (!codes.length) return null
  const first = getAlliance(codes[0])
  if (!first) return null
  for (let i = 1; i < codes.length; i++) {
    if (getAlliance(codes[i]) !== first) return null
  }
  return first
}
