import { crewStats, hazardStats } from '../game/types'

export const readCrew = () => ({ ...crewStats })
export const readHazards = () => ({ ...hazardStats })
