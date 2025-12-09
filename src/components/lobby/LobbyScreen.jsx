import { useEffect, useState, useRef } from "react";
import styles from "./LobbyScreen.module.css";
import { FaPlus } from "react-icons/fa";
import { IoReloadCircle } from "react-icons/io5";
import { useNavigate } from "react-router-dom";
import io from "socket.io-client";

const SIGNALING_SERVER = import.meta.env.VITE_REACT_APP_SIGNALING_SERVER || "http://localhost:3000";

export default function LobbyScreen({ user, onChangeUsername }) {
  const [serverStatus, setServerStatus] = useState("연결 중...");
  const [isEditingName, setIsEditingName] = useState(false);
  const [tempUsername, setTempUsername] = useState(user.username);
  const [rooms, setRooms] = useState([]);
  const socketRef = useRef(null);
  const [showGuestAlert, setShowGuestAlert] = useState(true);
  const navigate = useNavigate();

  const fetchRooms = () => {
    if (socketRef.current) {
      socketRef.current.emit("get-rooms");
    }
  };

  useEffect(() => {
    // Socket.IO 연결
    const newSocket = io(SIGNALING_SERVER);
    socketRef.current = newSocket;

    newSocket.on("connect", () => {
      console.log("Connected to signaling server", { id: newSocket.id });
      setServerStatus("연결됨");
      // 직접 newSocket을 사용하여 rooms 요청
      newSocket.emit("get-rooms");
    });

    newSocket.on("disconnect", (reason) => {
      // reason: "io server disconnect", "transport close", "ping timeout", etc.
      console.log("Disconnected from signaling server", { reason, id: newSocket.id });
      setServerStatus("연결 끊김");
    });

    newSocket.on("room-created", ({ roomId }) => {
      console.log("Room created:", roomId);
      // 로그를 남기고 네비게이션 진행
      console.log("Navigating to game", { roomId, socketId: newSocket.id });
      navigate(`/game/${roomId}`);
    });

    newSocket.on("room-list", ({ rooms }) => {
      setRooms(rooms);
    });

    return () => {
      if (newSocket) {
        // 컴포넌트 언마운트 시 소켓을 끊지 않고 리스너만 제거합니다.
        newSocket.removeAllListeners();
      }
    };
  }, []);

  const handleCreateRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit("create-room", {
        userId: null,
      });
    }
  };

  const handleRefresh = () => {
    fetchRooms();
  };

  const handleSaveUsername = () => {
    if (tempUsername.trim().length >= 2) {
      onChangeUsername(tempUsername.trim());
      setIsEditingName(false);
    } else {
      alert("닉네임은 최소 2글자 이상이어야 합니다.");
    }
  };

  const handleCancelEdit = () => {
    setTempUsername(user.username);
    setIsEditingName(false);
  };

  const handleTempUsername = (e) => {
    setTempUsername(e.target.value);
  };

  const handleEditUsername = () => {
    setIsEditingName(true);
  };

  const handleJoinRoom = (roomId) => {
    navigate(`/game/${roomId}`);
  };

  return (
    <div className={`${styles["main-container"]} min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 pb-32`}>
      <div className="p-8 lg:p-12">
        {/* 상단바 */}
        <div className={`${styles["card"]} mb-16`}>
          <div className="flex justify-between items-center">
            <h1 className={styles["h1"]}>⚔️ TCG Arena</h1>
            <span className={styles["span"]}>🟢 {serverStatus}</span>
          </div>
        </div>

        {/* 닉네임 표시/수정 */}
        <div className="px-2">
          <div className="flex items-center gap-4 mb-6">
            <span className={styles["span"]}>⚜️ 닉네임:</span>
            {isEditingName ? (
              <>
                <input
                  type="text"
                  value={tempUsername}
                  onChange={handleTempUsername}
                  className={styles["input"]}
                  placeholder="닉네임을 입력하세요."
                  maxLength={20}
                />
                <button onClick={handleSaveUsername} className={styles["blue-main-button"]}>
                  저장
                </button>
                <button onClick={handleCancelEdit} className={styles["gray-button"]}>
                  취소
                </button>
              </>
            ) : (
              <>
                <span className="text-yellow-100 font-bold text-lg">{user.username}</span>
                <button onClick={handleEditUsername} className={styles["blue-button"]}>
                  변경
                </button>
              </>
            )}
          </div>
        </div>

        <div>
          <div className={`${styles["card"]} mb-16`}>
            <h2 className={styles["h2"]}>⚡ 새 게임 시작</h2>
            <button onClick={handleCreateRoom} className={styles["blue-main-button"]}>
              <FaPlus />방 만들기
            </button>
          </div>

          <div className={`${styles["card"]} mb-16`}>
            <div className="flex justify-between items-center mb-8">
              <h2 className={styles["h2"]}>🚪 대기 중인 방</h2>
              <button onClick={handleRefresh} className={styles["gray-button"]}>
                <IoReloadCircle />
                새로고침
              </button>
            </div>

            {rooms.length === 0 ? (
              <div className="text-center py-16 text-gray-400">
                <p className="text-lg font-bold text-yellow-200 mb-2">대기 중인 방이 없습니다</p>
                <p className="text-sm text-gray-500">새로운 방을 만들어보세요!</p>
              </div>
            ) : (
              <div className="space-y-4">
                {rooms.map((room) => (
                  <div key={room.id} className={styles["room-card"]}>
                    <div>
                      <p className="text-yellow-100 font-bold text-lg">⚔️ {room.id}</p>
                      <p className="text-gray-400 text-sm mt-1">
                        생성: {new Date(room.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                    <button onClick={() => handleJoinRoom(room.id)} className={styles["blue-button"]}>
                      참가하기
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={`${styles["card"]} mb-20`}>
            <h3 className={styles["h3"]}>📜 게임 규칙</h3>
            <ul className="text-gray-300 space-y-3 ml-4">
              <li className="flex items-start gap-3">
                <span className="text-yellow-400 font-bold mt-0.5">•</span>
                <span>2인용 실시간 카드 게임</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-yellow-400 font-bold mt-0.5">•</span>
                <span>각자 30장 덱, 시작 체력 20</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-yellow-400 font-bold mt-0.5">•</span>
                <span>상대 체력을 0으로 만들면 승리</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-yellow-400 font-bold mt-0.5">•</span>
                <span>크리처와 주문 카드 사용</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-yellow-400 font-bold mt-0.5">•</span>
                <span>턴마다 마나 증가 (최대 10)</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-yellow-400 font-bold mt-0.5">•</span>
                <span>WebRTC P2P 통신으로 지연 없는 플레이</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {showGuestAlert && (
        <div className={styles["guest-alert"]}>
          <div className="flex items-center gap-4 w-full">
            <div className="text-2xl flex-shrink-0">✨</div>
            <div className="flex-1">
              <p className="text-cyan-300 font-bold text-lg mb-2">게스트 모드</p>
              <p className="text-gray-200 text-sm leading-relaxed">
                현재 게스트로 플레이 중입니다. 게임 기록은 저장되지 않지만, 모든 게임 기능을 자유롭게 이용하실 수
                있습니다.
              </p>
            </div>
            <button
              onClick={() => setShowGuestAlert(false)}
              className="text-cyan-300 hover:text-cyan-200 flex-shrink-0 text-2xl font-bold transition-colors"
              aria-label="Close alert"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
