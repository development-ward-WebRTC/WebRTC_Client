import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWebRTC } from "../../hooks/useWebRTC";
import { useGameState } from "../../hooks/useGameState";
import VoiceControl from "../common/VoiceControl";

const GameBoard = ({ user }) => {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [connectionStatus, setConnectionStatus] = useState("연결 중...");
  const [spellTarget, setSpellTarget] = useState(null);

  // WebRTC 연결
  const { connectionState, isHost, guestJoined, sendMessage, joinRoom, emitSignaling, peerConnection } = useWebRTC(
    roomId,
    handleMessage,
    handleConnectionChange
  );

  // 게임 상태 관리
  const playerId = isHost ? "player1" : "player2";
  const {
    gameState,
    myPlayer,
    opponent,
    isMyTurn,
    selectedCard,
    setSelectedCard,
    drawCard,
    playCard,
    attackWithCreature,
    endTurn,
    handleRemoteAction,
    handleGameInit,
  } = useGameState(playerId, sendMessage, isHost, emitSignaling);

  // 방 참가 (Host가 아닐 때만; 로비에서 만든 호스트는 sessionStorage로 구분)
  useEffect(() => {
    const hostRoomId = sessionStorage.getItem("hostRoomId");
    if (roomId && !isHost && hostRoomId !== roomId) {
      // Guest만 방에 참가
      joinRoom(roomId, user.userId);
    }
  }, [roomId, isHost, joinRoom]);

  // 게스트가 늦게 들어온 경우, Host가 초기 상태를 다시 전송
  useEffect(() => {
    if (isHost && guestJoined && gameState) {
      // 데이터채널로 전송
      sendMessage({
        type: "GAME_INIT",
        state: gameState,
      });
      // 시그널링 백업 전송
      emitSignaling("game-init", { state: gameState });
    }
  }, [isHost, guestJoined, gameState, sendMessage, emitSignaling]);

  // 연결/상태 백업 전송 및 요청
  useEffect(() => {
    if (isHost && connectionState === "connected" && gameState) {
      sendMessage({
        type: "GAME_INIT",
        state: gameState,
      });
      emitSignaling("game-init", { state: gameState });
    }

    // 게스트가 방에 참가했는데 초기 상태가 없으면 호스트에게 요청
    // 연결 상태와 관계없이 요청 (시그널링으로 받을 수 있음)
    if (!isHost && !gameState) {
      const timer1 = setTimeout(() => {
        if (!gameState) {
          console.log("Guest: requesting game-init (initial)");
          emitSignaling("request-game-init", { requester: user.userId });
        }
      }, 1000);
      
      // 연결이 완전히 수립된 경우에도 재요청
      if (connectionState === "connected") {
        const timer2 = setTimeout(() => {
          if (!gameState) {
            console.log("Guest: requesting game-init (after connected)");
            emitSignaling("request-game-init", { requester: user.userId, retry: true });
          }
        }, 2000);
        return () => {
          clearTimeout(timer1);
          clearTimeout(timer2);
        };
      }
      
      return () => clearTimeout(timer1);
    }
  }, [isHost, connectionState, gameState, sendMessage, emitSignaling, user.userId]);

  // 메시지 처리
  function handleMessage(message) {
    switch (message.type) {
      case "GAME_INIT":
        handleGameInit(message.state);
        break;
      case "GAME_ACTION":
        handleRemoteAction(message.action);
        break;
      case "REQUEST_GAME_INIT":
        if (isHost && gameState) {
          sendMessage({ type: "GAME_INIT", state: gameState });
          emitSignaling("game-init", { state: gameState });
        }
        break;
      default:
        console.warn("Unknown message type:", message.type);
    }
  }

  // 연결 상태 변경
  function handleConnectionChange(state) {
    const statusMap = {
      connecting: "연결 중...",
      connected: "연결됨",
      disconnected: "연결 끊김",
      failed: "연결 실패",
    };
    setConnectionStatus(statusMap[state] || state);

    if (state === "failed") {
      alert("연결에 실패했습니다. 로비로 돌아갑니다.");
      navigate("/lobby");
    }
  }

  // 카드 선택
  const handleCardSelect = (cardIndex) => {
    if (!isMyTurn || gameState.phase !== "main") return;

    const card = myPlayer.hand[cardIndex];

    // 마나 부족 체크
    if (myPlayer.mana < card.cost) {
      alert(`마나가 부족합니다! (필요: #{card.cost}, 현재: ${myPlayer.mana})`);
      return;
    }

    // 주문 카드면 대상 선택 모드로
    if (card.type == "spell") {
      if (card.target === "creature") {
        setSelectedCard(cardIndex);
        setSpellTarget("awaiting"); // 대상 선택 대기
        alert("공격할 상대 크리처를 선택하세요");
      } else {
        // 플레이어 대상 주문은 즉시 실행
        playCard(cardIndex, null);
        setSelectedCard(null);
      }
    } else {
      setSelectedCard(cardIndex);
      setSpellTarget(null);
    }
  };

  // 슬롯 선택 (카드 플레이)
  const handleSlotSelect = (slotIndex) => {
    if (!isMyTurn || gameState.phase !== "main") return;

    if (selectedCard !== null) {
      const card = myPlayer.hand[selectedCard];
      if (card.type == "creature") {
        playCard(selectedCard, slotIndex);
        setSelectedCard(null);
      }
    }
  };

  // 상대 크리처 클릭 (주문 대상 선택)
  const handleOpponentCreatureClick = (slotIndex) => {
    if (!isMyTurn || gameState.phase !== "main") return;

    // 주문 대상 선택 중인 경우
    if (spellTarget == "awaiting" && selectedCard !== null) {
      const card = myPlayer.hand[selectedCard];
      if (card.type === "spell" && card.target === "creature") {
        const targetCreature = opponent.field[slotIndex];
        if (targetCreature) {
          playCard(selectedCard, slotIndex);
          setSelectedCard(null);
          setSpellTarget(null);
        } else {
          alert("해당 슬롯에 크리처가 없습니다");
        }
      }
    }
  };

  // 크리처 공격
  const handleCreatureAttack = (attackerSlot, defenderSlot = null) => {
    if (!isMyTurn || gameState.phase !== "combat") return;
    attackWithCreature(attackerSlot, defenderSlot);
  };

  // 페이즈 진행
  const handleAdvancePhase = () => {
    if (!isMyTurn) return;

    if (gameState.phase == "draw") {
      drawCard();
    } else if (gameState.phase === "main") {
      sendMessage({
        type: "GAME_ACTION",
        action: { type: "PHASE_CHANGE", phase: "combat", player: playerId },
      });
    } else if (gameState.phase === "combat") {
      endTurn();
    }
  };

  // 게임 나가기
  const handleExit = () => {
    if (confirm("정말 게임을 나가시겠습니까? (패배 처리됩니다)")) {
      navigate("/lobby");
    }
  };

  if (!gameState) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] via-[#1a1f3a] to-[#0d1221] flex items-center justify-center p-8">
        <div className="text-center max-w-md w-full">
          <div className="text-white text-2xl mb-4 font-bold">{connectionStatus}</div>
          {connectionState === "connected" && <div className="text-gray-400 mb-6">상대방을 기다리는 중...</div>}
          <button
            onClick={() => navigate("/lobby")}
            className="w-full px-6 py-3 bg-gradient-to-br from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] text-white rounded-lg font-bold border-2 border-[#3b82f6] transition-all shadow-lg hover:shadow-xl"
          >
            취소
          </button>
        </div>
      </div>
    );
  }

  // 승리 확인
  if (gameState.winner) {
    const isWinner = gameState.winner == playerId;

    if (isHost) {
      sendMessage({
        type: "GAME_END",
        winnerId: gameState.winner,
        gameData: {
          totalTurns: gameState.turn,
        },
      });
    }

    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] via-[#1a1f3a] to-[#0d1221] flex items-center justify-center p-8">
        <div
          className="text-center max-w-md w-full bg-gradient-to-br from-[#1a1f3a] to-[#16213e] rounded-2xl border-2 border-[#3b82f6] p-8 shadow-2xl"
          style={{ boxShadow: "0 0 30px rgba(59, 130, 246, 0.2), 0 8px 16px rgba(0, 0, 0, 0.4)" }}
        >
          <div className={`text-8xl mb-6 ${isWinner ? "animate-bounce" : ""}`}>{isWinner ? "🏆" : "💀"}</div>
          <div className={`text-6xl mb-4 font-bold ${isWinner ? "text-blue-300" : "text-red-400"}`}>
            {isWinner ? "승리!" : "패배"}
          </div>
          <div className="text-blue-200 text-xl mb-8">{isWinner ? "축하합니다!" : "다음엔 더 잘하실 거예요!"}</div>
          <button
            onClick={() => navigate("/lobby")}
            className="w-full px-8 py-3 bg-gradient-to-br from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] text-white rounded-lg text-lg font-bold border-2 border-[#3b82f6] transition-all shadow-lg hover:shadow-xl hover:translate-y-[-3px]"
          >
            로비로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0e27] via-[#1a1f3a] to-[#0d1221] p-8">
      {/* 상단바 */}
      <div
        className="bg-gradient-to-br from-[#1a1f3a] to-[#16213e] rounded-xl p-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-2 border-[#3b82f6]"
        style={{ boxShadow: "0 0 30px rgba(59, 130, 246, 0.2)" }}
      >
        <div className="text-blue-100 flex flex-col md:flex-row items-start md:items-center gap-4">
          <span className="font-bold text-lg">방 ID: {roomId}</span>
          <span className="text-gray-400">{connectionStatus}</span>
          <span className={`font-bold ${isMyTurn ? "text-green-400" : "text-gray-400"}`}>
            {isMyTurn ? "내 턴 ⭐" : "상대 턴"}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-blue-100">
            턴 {gameState.turn} | 페이즈: <span className="font-bold text-blue-300">{gameState.phase}</span>
          </div>

          {/* 💡 VoiceControl 컴포넌트 삽입 */}
          <VoiceControl peerConnection={peerConnection} connectionState={connectionState} />

          <button
            onClick={handleExit}
            className="px-4 py-2 bg-gradient-to-br from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-lg transition-all font-bold border border-red-500 shadow-lg"
          >
            나가기
          </button>
        </div>
      </div>

      {/* 상대 영역 */}
      <div className="mb-8">
        <div
          className="bg-gradient-to-br from-[#1a1f3a] to-[#16213e] rounded-xl p-6 border-2 border-[#3b82f6]"
          style={{ boxShadow: "0 0 30px rgba(59, 130, 246, 0.2)" }}
        >
          <div className="flex justify-between items-center mb-6">
            <div className="text-blue-100 text-xl font-bold">
              ❤️ {opponent.health} | 💎 {opponent.mana}/{opponent.maxMana}
            </div>
            <div className="text-gray-400">
              🎴 덱: {opponent.deck.length} | ✋ 손패: {opponent.hand.length}
            </div>
          </div>

          {/* 상대 필드 */}
          <div className="grid grid-cols-5 gap-2">
            {opponent.field.map((card, index) => (
              <div
                key={index}
                onClick={() => handleOpponentCreatureClick(index)}
                className={`h-32 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                  card
                    ? `bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] border-blue-500 ${
                        spellTarget === "awaiting" ? "hover:border-yellow-400 cursor-pointer" : ""
                      }`
                    : "bg-gradient-to-br from-[#2d3748] to-[#1a202c] border-gray-600"
                }`}
              >
                {card ? (
                  <>
                    <div className="text-3xl">{card.image}</div>
                    <div className="text-white text-sm mt-1 text-center px-1 font-semibold">{card.name}</div>
                    <div className="text-yellow-300 text-xs font-bold">
                      ⚔️{card.attack} ❤️{card.currentHealth}
                    </div>
                  </>
                ) : (
                  <div className="text-gray-500 text-sm">빈 슬롯</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 내 영역 */}
      <div>
        <div
          className="bg-gradient-to-br from-[#1a1f3a] to-[#16213e] rounded-xl p-6 border-2 border-[#3b82f6]"
          style={{ boxShadow: "0 0 30px rgba(59, 130, 246, 0.2)" }}
        >
          {/* 내 필드 */}
          <div className="grid grid-cols-5 gap-2 mb-6">
            {myPlayer.field.map((card, index) => (
              <div
                key={index}
                onClick={() => {
                  if (gameState.phase === "combat" && card && !myPlayer.attackedThisTurn.includes(index)) {
                    handleCreatureAttack(index, null);
                  }
                }}
                className={`h-32 rounded-lg border-2 flex flex-col items-center justify-center transition-all ${
                  card
                    ? `bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] border-blue-500 ${
                        gameState.phase === "combat" && !myPlayer.attackedThisTurn.includes(index)
                          ? "hover:border-yellow-400 cursor-pointer"
                          : ""
                      }`
                    : "bg-gradient-to-br from-[#2d3748] to-[#1a202c] border-gray-600"
                } ${selectedCard !== null && !card ? "border-green-400 cursor-pointer" : ""}`}
              >
                {card ? (
                  <>
                    <div className="text-3xl">{card.image}</div>
                    <div className="text-white text-sm mt-1 text-center px-1 font-semibold">{card.name}</div>
                    <div className="text-yellow-300 text-xs font-bold">
                      ⚔️{card.attack} ❤️{card.currentHealth}
                    </div>
                    {myPlayer.attackedThisTurn.includes(index) && <div className="text-gray-400 text-xs">공격함</div>}
                  </>
                ) : (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSlotSelect(index);
                    }}
                    className="text-gray-500 text-sm cursor-pointer"
                  >
                    {selectedCard !== null ? "배치하기" : "빈 슬롯"}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 내 손패 */}
          <div className="flex justify-center gap-2 mb-6 overflow-x-auto pb-2">
            {myPlayer.hand.map((card, index) => (
              <div
                key={index}
                onClick={() => handleCardSelect(index)}
                className={`min-w-[6rem] w-24 h-36 rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer transition-all font-semibold ${
                  selectedCard === index
                    ? "border-yellow-400 bg-gradient-to-br from-[#3b82f6] to-[#2563eb] scale-110"
                    : "border-blue-500 bg-gradient-to-br from-[#1a1f3a] to-[#0a0e27] hover:scale-105"
                } ${myPlayer.mana < card.cost ? "opacity-50" : ""}`}
              >
                <div className="text-3xl">{card.image}</div>
                <div className="text-blue-100 text-xs text-center px-1 mt-1">{card.name}</div>
                <div className="text-yellow-300 text-xs font-bold">💎 {card.cost}</div>
                {card.type === "creature" ? (
                  <div className="text-green-300 text-xs font-bold">
                    ⚔️{card.attack} ❤️{card.health}
                  </div>
                ) : (
                  <div className="text-purple-300 text-xs font-bold">주문</div>
                )}
              </div>
            ))}
          </div>

          {/* 내 정보 */}
          <div className="flex justify-between items-center mb-6 border-t border-blue-500 pt-6">
            <div className="text-blue-100 text-xl font-bold">
              ❤️ {myPlayer.health} | 💎 {myPlayer.mana}/{myPlayer.maxMana}
            </div>
            <div className="text-gray-400">
              🎴 덱: {myPlayer.deck.length} | 🪦 묘지: {myPlayer.graveyard.length}
            </div>
          </div>

          {/* 액션 버튼 */}
          {isMyTurn && (
            <div className="flex justify-center gap-4">
              {gameState.phase === "draw" && (
                <button
                  onClick={handleAdvancePhase}
                  className="px-8 py-4 bg-gradient-to-br from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl hover:translate-y-[-3px] border-2 border-[#3b82f6]"
                >
                  🎴 카드 뽑기
                </button>
              )}
              {gameState.phase === "main" && (
                <>
                  <button
                    onClick={handleAdvancePhase}
                    className="px-8 py-4 bg-gradient-to-br from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl hover:translate-y-[-3px] border-2 border-[#3b82f6]"
                  >
                    ⚔️ 전투 시작
                  </button>
                  <button
                    onClick={endTurn}
                    className="px-8 py-4 bg-gradient-to-br from-[#6b7280] to-[#4b5563] hover:from-[#4b5563] hover:to-[#374151] text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl hover:translate-y-[-3px] border-2 border-[#6b7280]"
                  >
                    ⏭️ 턴 종료
                  </button>
                </>
              )}
              {gameState.phase === "combat" && (
                <button
                  onClick={handleAdvancePhase}
                  className="px-8 py-4 bg-gradient-to-br from-[#3b82f6] to-[#2563eb] hover:from-[#2563eb] hover:to-[#1d4ed8] text-white rounded-lg font-bold text-lg transition-all shadow-lg hover:shadow-xl hover:translate-y-[-3px] border-2 border-[#3b82f6]"
                >
                  ✅ 턴 종료
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GameBoard;
