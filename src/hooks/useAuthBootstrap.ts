import { useEffect, useState } from 'react'

type BootstrapState = {
  bootstrapped: boolean
  hasUsers: boolean
}

export function useAuthBootstrap(): BootstrapState {
  const [state, setState] = useState<BootstrapState>({ bootstrapped: false, hasUsers: true })

  useEffect(() => {
    // We assume users exist since we migrated them to PostgreSQL
    // In a real scenario, we could call a backend /health or /public/setup-status endpoint.
    setState({ bootstrapped: true, hasUsers: true })
  }, [])

  return state
}


