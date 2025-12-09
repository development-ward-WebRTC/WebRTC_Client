import io from "socket.io-client";

// 하나의 시그널링 소켓 인스턴스를 앱 전체에서 재사용한다.
export const SIGNALING_SERVER = import.meta.env.VITE_REACT_APP_SIGNALING_SERVER || "http://localhost:3001";

let socketInstance = null;

export const getSignalingSocket = () => {
  if (!socketInstance) {
    socketInstance = io(SIGNALING_SERVER, {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });
  }
  return socketInstance;
};

