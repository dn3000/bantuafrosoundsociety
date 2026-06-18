// Homepage video rails. rail_key (not the videos category enum) is the curation
// key because "Exclusive Sets" is is_exclusive=true across any category — it is
// not a category. Shared by the Pin menu and the Picks sub-section.

export const RAIL_KEYS = [
  'exclusive_sets',
  'bass_sets',
  'music_videos',
  'podcasts',
  'live_sets',
  'mixes',
] as const

export type RailKey = (typeof RAIL_KEYS)[number]

export const RAIL_LABELS: Record<RailKey, string> = {
  exclusive_sets: 'Exclusive Sets',
  bass_sets: 'BASS Sets',
  music_videos: 'Music Videos',
  podcasts: 'Podcasts',
  live_sets: 'Live Sets',
  mixes: 'Mixes',
}

// category → its chronological homepage rail. 'other' maps to nothing (those
// videos have no category row on the homepage).
const CATEGORY_RAIL: Record<string, RailKey | undefined> = {
  mix: 'mixes',
  live_set: 'live_sets',
  music_video: 'music_videos',
  interview: 'podcasts',
  live_show: 'bass_sets',
  other: undefined,
}

export function isRailKey(v: unknown): v is RailKey {
  return typeof v === 'string' && (RAIL_KEYS as readonly string[]).includes(v)
}

// Which rails a video may be pinned to, mirroring the homepage row filters:
//   - is_exclusive=true always offers Exclusive Sets (that row pulls
//     is_exclusive=true across every category).
//   - The category-mapped rail is offered too, EXCEPT for live_set / live_show
//     when is_exclusive=true: those category rows filter is_exclusive=false, so
//     exclusive live content belongs in Exclusive Sets, not its category rail.
//   - category='other' has no category rail (only Exclusive Sets, and only when
//     exclusive).
export function applicableRails(category: string, isExclusive: boolean): RailKey[] {
  const rails: RailKey[] = []
  if (isExclusive) rails.push('exclusive_sets')

  const mapped = CATEGORY_RAIL[category]
  if (mapped) {
    const excludedByExclusive =
      (category === 'live_set' || category === 'live_show') && isExclusive
    if (!excludedByExclusive) rails.push(mapped)
  }
  return rails
}
