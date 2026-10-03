import { DEFAULT_LOOK, SPECIES, type Look, type SpeciesId } from './species'

export type RoleId = 'engineer' | 'pilot' | 'chef'

export type Role = {
  id: RoleId
  name: string
  tagline: string
  /** One-line description of the bonus, shown on the character screen */
  bonus: string
  /** Multiplier on how fast the shipyard drones assemble blocks (higher is faster) */
  buildSpeed: number
  /** Multiplier on main-engine thrust */
  shipSpeed: number
  /** Multiplier on how fast the Food Dispenser restores Hunger */
  foodRestore: number
}

export const ROLES: Record<RoleId, Role> = {
  engineer: {
    id: 'engineer',
    name: 'Engineer',
    tagline: 'Knows every bolt of the ship',
    bonus: '+10% Build Speed',
    buildSpeed: 1.1,
    shipSpeed: 1,
    foodRestore: 1,
  },
  pilot: {
    id: 'pilot',
    name: 'Pilot',
    tagline: 'Born in the cockpit',
    bonus: '+10% Ship Speed',
    buildSpeed: 1,
    shipSpeed: 1.1,
    foodRestore: 1,
  },
  chef: {
    id: 'chef',
    name: 'Chef',
    tagline: 'Keeps morale up with hot meals',
    bonus: 'Food restores 50% more Hunger',
    buildSpeed: 1,
    shipSpeed: 1,
    foodRestore: 1.5,
  },
}

/** The player's character. Set once on the registration screen, before the game starts. */
export type CrewProfile = { name: string; role: RoleId; species: SpeciesId; look: Look }

export const crewProfile: CrewProfile = {
  name: 'Nova',
  role: 'engineer',
  species: 'human',
  look: { ...DEFAULT_LOOK },
}

export function setCrewProfile(profile: CrewProfile) {
  Object.assign(crewProfile, profile)
}

export const currentRole = () => ROLES[crewProfile.role]
export const currentSpecies = () => SPECIES[crewProfile.species]
