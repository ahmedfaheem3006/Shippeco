import { io, Socket } from 'socket.io-client'
import { env } from '../utils/env'

/**
 * Module-level singleton so the socket can be reached (and force-disconnected)
 * from outside React — e.g. from the auth store's logout(), which runs
 * outside any component tree.
 */
let socket: Socket | null = null
let socketToken: string | null | undefined = undefined

export function connectSocket(token: string | null): Socket {
  // The auth token is only sent during the initial handshake, so a token
  // change (login/logout/switch user) needs a fresh connection — mutating
  // `.auth` on a live socket would not re-authenticate it on the server.
  if (socket && socketToken !== token) {
    socket.disconnect()
    socket = null
  }

  if (socket) return socket

  socketToken = token
  socket = io(env.apiUrl.replace('/api', ''), {
    auth: { token },
    transports: ['websocket', 'polling'],
  })

  return socket
}

export function disconnectSocket() {
  socketToken = undefined
  if (!socket) return
  socket.disconnect()
  socket = null
}

export function getSocket(): Socket | null {
  return socket
}
