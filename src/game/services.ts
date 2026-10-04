import { getDock } from './dock'
import { getSector } from './sector'
import type { StationSpec } from './station'

/** What a station offers. Stations declare their services as data so new kinds can be added without touching the UI. */
export type ServiceId = 'drydock' | 'trade' | 'contracts'

export const SERVICE_LABELS: Record<ServiceId, string> = {
  drydock: 'Drydock',
  trade: 'Cargo exchange',
  contracts: 'Contracts board',
}

export const ALL_SERVICES: readonly ServiceId[] = ['drydock', 'trade', 'contracts']

/** Every station built so far is a full drydock hub, so a station that lists no services offers all of them. */
export const stationServices = (station: Pick<StationSpec, 'services'>): readonly ServiceId[] => station.services ?? ALL_SERVICES

/** The station the ship is docked at (or docking with), if any. */
export function dockedStation(): StationSpec | null {
  const dock = getDock()
  if (dock.phase === 'free') return null
  return getSector().stations.find((station) => station.id === dock.stationId) ?? null
}

/** Whether the ship is fully docked at a station that offers `service`. */
export function dockedHasService(service: ServiceId): boolean {
  if (getDock().phase !== 'docked') return false
  const station = dockedStation()
  return station !== null && stationServices(station).includes(service)
}
