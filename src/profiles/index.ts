import type { AddonProfile } from '../core/profile'
import { biaoge } from './biaoge'

/** Every supported addon, in display order. Register new profiles here. */
export const profiles: readonly AddonProfile[] = [biaoge]

/** Profile shown first in the UI. */
export const defaultProfile: AddonProfile = biaoge

export function findProfile(id: string): AddonProfile | undefined {
  return profiles.find((profile) => profile.id === id)
}
