import { useEffect, useState } from 'react'

export function useSampled<T>(read: () => T, intervalMs = 200): T {
  const [snapshot, setSnapshot] = useState<T>(read)

  useEffect(() => {
    const id = setInterval(() => setSnapshot(read()), intervalMs)
    return () => clearInterval(id)
  }, [read, intervalMs])

  return snapshot
}
