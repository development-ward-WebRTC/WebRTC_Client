import { React, useEffect, useState } from "react";
import "./App.css";
import LobbyScreen from "./components/lobby/LobbyScreen";
import { Navigate, Route, Router, Routes } from "react-router-dom";
import GameBoard from "./components/game/GameBoard";

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeUser = async () => {
      let user = localStorage.getItem("guest_user");

      if (!user) {
        // 새 게스트 사용자 생성
        const guestUser = {
          userId: null,
          username: `Guest_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
        };
        localStorage.setItem("guest_user", JSON.stringify(guestUser));
        user = JSON.stringify(guestUser);
      }

      // 상태 업데이트를 배치 처리
      setCurrentUser(JSON.parse(user));
      setLoading(false);
    };

    initializeUser();
  }, []);

  const handleChangeUsername = (newUsername) => {
    const updatedUser = {
      ...currentUser,
      username: newUsername,
    };
    setCurrentUser(updatedUser);
    localStorage.setItem("guest_user", JSON.stringify(updatedUser));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white text-2xl">로딩 중...</div>
      </div>
    );
  }

  return (
    <div className="App">
      <Routes>
        <Route path="/lobby" element={<LobbyScreen user={currentUser} onChangeUsername={handleChangeUsername} />} />

        {/* 게임 화면 */}
        <Route path="/game/:roomId" element={<GameBoard user={currentUser} />} />

        {/* 기본 경로 - 로비로 리다이렉트 */}
        <Route path="*" element={<Navigate to="/lobby" />} />
      </Routes>
    </div>
  );
}

export default App;
