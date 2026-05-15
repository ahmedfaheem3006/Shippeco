import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { env } from '../utils/env';
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

  useEffect(() => {
    // Initialize socket connection
    const socketInstance = io(env.apiUrl.replace('/api', ''), {
      auth: { token },
      transports: ['websocket', 'polling']
    });

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

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [token]);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};
