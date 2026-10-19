import { getRouteApi } from '@tanstack/react-router'

const wsRoute = getRouteApi('/app/_ws')

/** App context (user, workspace, role) loaded by the /app/_ws layout. */
export function useApp() {
  return wsRoute.useRouteContext().app
}

export function canManage(role: 'owner' | 'admin' | 'member') {
  return role === 'owner' || role === 'admin'
}
