import { useCallback, useEffect, useState, useRef } from "react";
import { CARD_DATABASE } from "../utils/cardData";
import { applyAction, validateAction } from "../utils/gameLogic";

const INITIAL_HEALTH = 20;
const INITIAL_HAND_SIZE = 5;

export const useGameState = (playerId, sendMessage, isHost, signalingEmit) => {
  const [gameState, setGameState] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const pendingActionsRef = useRef([]); // gameState 초기화 전 받은 액션 버퍼
  const gameStateRef = useRef(null); // 최신 gameState를 항상 참조하기 위한 ref

  // 덱 셔플
  const shuffleDeck = useCallback((deck) => {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  // 게임 초기화
  const intializeGame = useCallback(() => {
    if (gameState) {
      return; // 이미 초기화됨
    }

    const createDeck = () => {
      const deck = [];
      // 간단한 덱 구성: 크리처 20장, 주문 10장
      const creatures = CARD_DATABASE.creatures;
      const spells = CARD_DATABASE.spells;

      for (let i = 0; i < 20; i++) {
        deck.push({ ...creatures[i % creatures.length] });
      }
      for (let i = 0; i < 10; i++) {
        deck.push({ ...spells[i % spells.length] });
      }
      return shuffleDeck(deck);
    };

    const deck1 = createDeck();
    const deck2 = createDeck();

    const initialState = {
      turn: 1,
      currentPlayer: "player1",
      phase: "draw",
      winner: null,

      player1: {
        id: "player1",
        health: INITIAL_HEALTH,
        mana: 5,
        maxMana: 10,
        deck: deck1.slice(INITIAL_HAND_SIZE),
        hand: deck1.slice(0, INITIAL_HAND_SIZE),
        field: [null, null, null, null, null],
        graveyard: [],
        attackedThisTurn: [],
      },

      player2: {
        id: "player2",
        health: INITIAL_HEALTH,
        mana: 5,
        maxMana: 10,
        deck: deck2.slice(INITIAL_HAND_SIZE),
        hand: deck2.slice(0, INITIAL_HAND_SIZE),
        field: [null, null, null, null, null],
        graveyard: [],
        attackedThisTurn: [],
      },
    };

    setGameState(initialState);
    gameStateRef.current = initialState; // ref 즉시 업데이트

    // Host가 초기 상태를 Guest에게 전송
    if (isHost) {
      setTimeout(() => {
        // 기본은 DataChannel을 통한 전송
        sendMessage({
          type: "GAME_INIT",
          state: initialState,
        });
        // 안전장치: 시그널링 소켓으로도 전송하여 데이터채널이 늦게 열려도 초기화 수신 보장
        try {
          console.log("Host: emitting game-init via signaling");
          signalingEmit?.("game-init", { state: initialState });
        } catch (e) {
          console.warn("signalingEmit failed:", e);
        }
      }, 1000); // 연결 완료 대기
    }
  }, [isHost, sendMessage, shuffleDeck, signalingEmit]); // gameState 제거하여 무한 루프 방지

  useEffect(() => {
    // Host일 때만 초기화 (Guest가 로컬에서 초기화하지 않도록 함)
    if (isHost === true && !gameState) {
      intializeGame();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, gameState]);

  // 액션 실행 (로컬 + 전송)
  const executeAction = useCallback(
    (action) => {
      console.log("executeAction - action:", action, "playerId:", playerId, "gameState:", {
        currentPlayer: gameState?.currentPlayer,
        phase: gameState?.phase,
        turn: gameState?.turn,
      });

      if (!gameState) {
        console.error("Game state not initialized");
        return false;
      }

      // 액션 유효성 검증
      const validation = validateAction(gameState, action, playerId);
      console.log("Validation result:", validation);
      
      if (!validation.valid) {
        console.error("Invalid action:", validation.error);
        alert(validation.error);
        return false;
      }

      // 로컬 상태 업데이트
      const newState = applyAction(gameState, action);
      console.log("✅ New state after action:", {
        currentPlayer: newState.currentPlayer,
        phase: newState.phase,
        turn: newState.turn,
      });
      setGameState(newState);

      // 상대방에게 전송
      const message = {
        type: "GAME_ACTION",
        action,
        timestamp: Date.now(),
      };
      console.log("📤 Sending action to opponent:", action.type);
      const sent = sendMessage(message);
      console.log("📤 Message sent result:", sent);

      return true;
    },
    [gameState, playerId, sendMessage]
  );

  // gameState 변경 시 ref 동기화
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  // 원격 액션 처리
  const handleRemoteAction = useCallback(
    (action) => {
      const currentState = gameStateRef.current; // 최신 gameState 사용
      console.log("📥 handleRemoteAction - action:", action, "current gameState:", {
        currentPlayer: currentState?.currentPlayer,
        phase: currentState?.phase,
        turn: currentState?.turn,
      });

      if (!currentState) {
        console.warn("⚠️ Game state not initialized yet, buffering action:", action.type);
        pendingActionsRef.current.push(action);
        return;
      }

      // 상대방의 액션 적용
      const newState = applyAction(currentState, action);
      console.log("✅ Remote action applied - new state:", {
        currentPlayer: newState.currentPlayer,
        phase: newState.phase,
        turn: newState.turn,
      });
      setGameState(newState);
      gameStateRef.current = newState; // ref도 즉시 업데이트
    },
    [] // gameState 의존성 제거, gameStateRef 사용
  );

  // 게임 초기화 수신 (Guest용)
  const handleGameInit = useCallback((initialState) => {
    console.log("🎮 Received game initialization, initial state:", {
      currentPlayer: initialState?.currentPlayer,
      phase: initialState?.phase,
      turn: initialState?.turn,
    });
    setGameState(initialState);
    gameStateRef.current = initialState; // ref 즉시 업데이트
    
    // 버퍼에 쌓인 액션들 처리
    if (pendingActionsRef.current.length > 0) {
      console.log(`📦 Processing ${pendingActionsRef.current.length} buffered actions...`);
      let currentState = initialState;
      
      pendingActionsRef.current.forEach((action, index) => {
        console.log(`  ${index + 1}. Applying buffered action:`, action.type);
        currentState = applyAction(currentState, action);
      });
      
      console.log("✅ All buffered actions applied, final state:", {
        currentPlayer: currentState.currentPlayer,
        phase: currentState.phase,
        turn: currentState.turn,
      });
      setGameState(currentState);
      gameStateRef.current = currentState; // 최종 상태도 ref 업데이트
      pendingActionsRef.current = [];
    }
  }, []);

  // 카드 드로우
  const drawCard = useCallback(() => {
    console.log("🎴 drawCard called - playerId:", playerId);
    return executeAction({
      type: "DRAW_CARD",
      player: playerId,
    });
  }, [executeAction, playerId]);

  // 카드 플레이
  const playCard = useCallback(
    (cardIndex, targetSlot = null) => {
      if (!gameState) return false;

      const myPlayer = gameState[playerId];
      const card = myPlayer.hand[cardIndex];

      if (!card) {
        alert("유효하지 않은 카드입니다");
        return false;
      }

      if (card.type === "creature") {
        if (targetSlot === null) {
          alert("필드 슬롯을 선택하세요");
          return false;
        }
        return executeAction({
          type: "PLAY_CREATURE",
          player: playerId,
          cardIndex,
          slot: targetSlot,
        });
      } else if (card.type === "spell") {
        return executeAction({
          type: "PLAY_SPELL",
          player: playerId,
          cardIndex,
          targetSlot,
        });
      }

      return false;
    },
    [executeAction, gameState, playerId]
  );

  // 공격 선언
  const attackWithCreature = useCallback(
    (attackerSlot, defenderSlot = null) => {
      return executeAction({
        type: "ATTACK",
        player: playerId,
        attackerSlot,
        defenderSlot,
      });
    },
    [executeAction, playerId]
  );

  // 페이즈 변경
  const changePhase = useCallback(
    (newPhase) => {
      return executeAction({
        type: "PHASE_CHANGE",
        player: playerId,
        phase: newPhase,
      });
    },
    [executeAction, playerId]
  );

  // 턴 종료
  const endTurn = useCallback(() => {
    return executeAction({
      type: "END_TURN",
      player: playerId,
    });
  }, [executeAction, playerId]);

  // 현재 플레이어 정보
  const myPlayer = gameState ? gameState[playerId] : null;
  const opponentId = playerId === "player1" ? "player2" : "player1";
  const opponent = gameState ? gameState[opponentId] : null;
  const isMyTurn = gameState?.currentPlayer === playerId;

  return {
    gameState,
    myPlayer,
    opponent,
    isMyTurn,
    selectedCard,
    setSelectedCard,

    // 액션 함수들
    drawCard,
    playCard,
    attackWithCreature,
    changePhase,
    endTurn,

    // 원격 처리
    handleRemoteAction,
    handleGameInit,
  };
};
