import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectSocket, disconnectSocket } from '../services/socketClient';
import { useAuthStore } from '../hooks/useAuthStore';
import { toast } from 'react-hot-toast';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, connected: false });

export const useSocket = () => useContext(SocketContext);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const token = useAuthStore(s => s.token);
  const logout = useAuthStore(s => s.logout);

  useEffect(() => {
    const socketInstance = connectSocket(token);

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected to server');
      setConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket] Disconnected from server');
      setConnected(false);
    });

    socketInstance.on('PAYMENT_SUCCESS', (data: any) => {
      console.log('[Socket] Global Payment Success received:', data);
      toast.success(`✅ تم تحصيل دفعة بنجاح! مبلغ: ${data.amount} ر.س`, {
        duration: 8000,
        position: 'top-center',
        icon: '💰'
      });

      // We can use a global event bus or just rely on components listening for INVOICE_UPDATED
    });

    // Server pushes this when an admin disables/deletes this account, or the
    // account otherwise loses access — end the session immediately instead
    // of waiting for the next API call to bounce with a 401.
    socketInstance.on('session:revoked', (data: { reason?: string; message?: string } = {}) => {
      console.log('[Socket] Session revoked by server:', data);
      if (data.message) {
        toast.error(data.message, { duration: 8000 });
      }
      logout();
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.off('PAYMENT_SUCCESS');
      socketInstance.off('session:revoked');
      socketInstance.off('connect');
      socketInstance.off('disconnect');
    };
  }, [token, logout]);

  // Only ever tear the underlying connection down when the whole app
  // unmounts — token changes above should reuse/reauthenticate it, not
  // recreate it, since logout() is responsible for calling disconnectSocket().
  useEffect(() => () => disconnectSocket(), []);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
