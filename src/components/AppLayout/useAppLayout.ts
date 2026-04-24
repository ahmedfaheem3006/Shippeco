import { useOutletContext } from 'react-router-dom'

export type AppLayoutOutletContext = {
  openSidebar: () => void
}

export function useAppLayout() {
  return useOutletContext<AppLayoutOutletContext>()
}
