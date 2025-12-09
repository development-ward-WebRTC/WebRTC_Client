import { useState, useEffect, useRef, useCallback } from "react";
import io from "socket.io-client";

const SIGNALING_SERVER = import.meta.env.VITE_REACT_APP_SIGNALING_SERVER || "http://localhost:3001";

// ICE(Interactive Connectivity Establishment)는 두 Peer의 사용자가 서로의 네트워크 주소를 찾아 직접 통신 경로를 확립하는 과정이다.
// STUN 서버 역할: 클라이언트의 공인 IP 주소와 포트를 알려주는 역할을 한다. 이는 NAT 뒤에 숨어진 Peer가 자신의 외부 주소를 알아내어 서로 연결할 수 있는 후보를 생성하는데 사용된다.
const ICE_CONFIG = {
  iceServers: [
    { urls: import.meta.env.VITE_REACT_APP_STUN_SERVER || "stun:stun.l.google.com:19302" },
    { urls: import.meta.env.VITE_REACT_APP_STUN_SERVER_2 || "stun:stun1.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10, // WebRTC 연결이 확립되는 동안 미리 생성하여 보관할 ICE 후보(Candidate)의 최대 개수
};

export const useWebRTC = (roomId, onMessage, onConnecitionChange) => {
  const [connectionState, setConnectionState] = useState("disconnected");
  const [isHost, setIsHost] = useState(false);

  // useRef는 React의 Hooks 중 하나로, 컴포넌트의 수명 주기 동안 변경 가능(Mutable)한 값을 저장하는 데 사용된다. 이 값은 상태(useState)와 달리 업데이트되어도 컴포넌트를 재렌더링(Re-render)시키지 않는다는 특징을 가지고 있다.
  const socketRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const dataChannelRef = useRef(null);
  const messageQueueRef = useRef([]);
  const reconnectTimeoutRef = useRef(null);
  const initializePCRef = useRef(null);
  const attemptReconnectFuncRef = useRef(null);

  // Offer 생성 및 전송
  const createAndSendOffer = useCallback(
    async (pc) => {
      try {
        // 1. Offer 생성
        /* 
        RTCPeerConnection 객체에게 현재 로컬 머신의 잠재적 미디어 포맷, 프로토콜, 암호화 키 등의 정보가 담긴 SDP Offer를 생성하도록 지시한다.
      */
        const offer = await pc.createOffer();
        // 2. Local Description 설정
        /* 
        생성된 offer 정보를 자신의 로컬 연결 설정으로 등록한다. 이 정보가 등록되어야 pc.localDescription을 통해 접근할 수 있다.
      */
        await pc.setLocalDescription(offer);

        // 3. Offer 전송 (시그널링)
        /* 
        시그널링 서버(Socket.IO)를 통해 생성된 Offer(SDP)를 상대방에게 안전하게 전달한다.
      */
        socketRef.current.emit("offer", {
          roomId,
          offer: pc.localDescription, // 방금 설정된 Offer (SDP)
        });
        console.log("Offer sent");
      } catch (error) {
        console.error("Failed to create offer:", error);
      }
    },
    [roomId]
  );

  // Offer 처리
  const handleOffer = async (offer) => {
    try {
      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error("PeerConnection not initialized");
        return;
      }

      // 1. Remote Description 설정
      /* 
        상대방(Host)이 보낸 Offer(SDP)를 자신의 원격 연결 설정으로 등록한다. pc는 상대방이 원하는 연결 사양을 알게 된다.
      */
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // 2. Answer 생성
      /* 
        상대방의 Offer를 바탕으로 호환되는 미디어 및 네트워크 설정을 담은 SDP Answer를 생성한다.
      */
      const answer = await pc.createAnswer();
      // 3. Local Description 설정
      /* 
        생성된 Answer를 자신의 로컬 연결 설정으로 등록한다.
      */
      await pc.setLocalDescription(answer);

      // 4. Answer 전송 (시그널링)
      /* 
        Answer(SDP)를 시그널링 서버를 통해 Offer를 보냈던 Host에게 다시 전달한다. 이 Answer를 Host가 수신하여 등록하면 SDP 교환이 완료되고, WebRTC 연결이 본격적으로 시작된다.
      */
      socketRef.current.emit("answer", {
        roomId,
        answer: pc.localDescription,
      });
      console.log("Answer sent");
    } catch (error) {
      console.error("Failed to handle offer:", error);
    }
  };

  // Answer 처리
  /* 
    answer: Guest(응답자)로부터 시그널링 서버를 통해 수신된 Answer SDP(Session Description Protocol) 정보이다. 이 정보에는 Guest의 미디어 기능, 네트워크 포트 등 연결에 필요한 사양이 담겨 있다.
  */
  const handleAnswer = async (answer) => {
    try {
      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error("PeerConnection not initialized");
        return;
      }

      /*
        new RTCSessionDescription(answer): 수신된 원시 Answer 객체/문자열을 WebRTC에서 사용하는 RTCSessionDescription 객체로 변환한다.

        pc.setRemoteDescription(...): RTCPeerConnection 객체에게 상대방의 연결 사양을 이 Answer 정보로 공식적으로 등록하도록 지시한다.

        역할: Offer를 보냈던 Host는 이 Answer를 등록함으로써, SDP 교환을 최종적으로 완료하고 두 피어 간의 통신 사양에 대한 최종 합의를 이끌어낸다.
      */
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("Answer processed");
    } catch (error) {
      console.error("Failed to handle answer:", error);
    }
  };

  // ICE Candidate 처리
  const handleIceCandidate = async (candidate) => {
    try {
      const pc = peerConnectionRef.current;
      if (!pc) {
        console.error("PeerConnection not initialized");
        return;
      }

      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error("Failed to add ICE candidate:", error);
    }
  };

  // 메시지 전송
  const sendMessage = useCallback((message) => {
    const channel = dataChannelRef.current;

    if (!channel || channel.readyState !== "open") {
      console.log("Channel not ready, queueing message");
      /* 
        messageQueueRef.current.push(message): 전송하려던 메시지를 **messageQueueRef (메시지 큐)**에 저장합니다. 이 큐에 저장된 메시지는 나중에 DataChannel이 "open" 상태가 되거나, 내부 버퍼가 비었을 때 (onbufferedamountlow) flushMessageQueue() 함수를 통해 일괄 전송된다.
      */
      messageQueueRef.current.push(message);
      return false;
    }

    try {
      const data = JSON.stringify(message);
      channel.send(data);
      console.log("Sent:", message.type);
      return true;
    } catch (error) {
      console.error("Failed to send message:", error);
      messageQueueRef.current.push(message);
      return false;
    }
  }, []);

  // 대기 중인 메시지 전송
  const flushMessageQueue = useCallback(() => {
    while (messageQueueRef.current.length > 0) {
      // shift(): 배열의 가장 앞쪽 요소를 제거하고 그 요소를 반환한다
      const message = messageQueueRef.current.shift();
      // 재귀적 호출
      sendMessage(message);
    }
  }, [sendMessage]);

  // DataChannel 이벤트 설정
  /* 
    setupDataChannel(event.channel);
    channel은 RTCPeerConnection을 통해 생성되거나 수신된 RTCDataChannel 객체이다. (pc.createDataChannel())
    dataChannelRef.current: React의 useRef로 생성된 객체에 이 DataChannel 인스턴스를 저장한다.
    목적은 컴포넌트의 다른 부분(예: 메시지 전송 함수 sendMessage)에서 이 채널 객체를 참조하여 데이터를 보낼 수 있도록 접근 경로를 확보하고 지속성을 유지한다.
  */
  const setupDataChannel = useCallback(
    (channel) => {
      dataChannelRef.current = channel;

      channel.onopen = () => {
        console.log("DataChannel opened");
      };

      channel.onclose = () => {
        console.log("DataChannel closed");
      };

      channel.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log("Received", message.type);
          onMessage?.(message);
        } catch (error) {
          console.error("Failed to parse message:", error);
        }
      };

      // 버퍼 관리
      channel.onbufferedamountlow = () => {
        flushMessageQueue();
      };
    },
    [flushMessageQueue, onMessage]
  );
  // 재연결 시도 (hoisted function)
  /* 
    clearTimeout(...): 만약 재연결 요청이 빠르게 여러 번 들어오면 (예: 네트워크가 불안정할 때), 이미 실행 대기 중인 이전 타이머를 취소한다.

    목적: 새로운 재연결 시도가 들어올 때마다 이전 타이머를 제거하고 새로운 타이머를 설정함으로써, 연결 재시도 명령이 중복으로 쌓이는 것을 방지하고 가장 최근의 요청만 유효하도록 만든다. (일종의 디바운스(Debounce) 역할)
  */
  const attemptReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      console.log("Attempting to reconnect...");
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      // Use the ref to avoid accessing initializePeerConnection before it's declared
      initializePCRef.current?.(isHost);
    }, 3000);
  }, [isHost]);

  // PeerConnection 초기화
  const initializePeerConnection = useCallback(
    (isInitiator) => {
      /* 
      RTCPeerConnection은 WebRTC에서 두 peer 간의 연결을 나타내는 주요 인터페이스이다. 이 객체를 통해 미디어 스트림을 전송하거나, 데이터 채널을 통해 임의의 데이터를 주고받을 수 있다. 
    */
      const pc = new RTCPeerConnection(ICE_CONFIG);
      peerConnectionRef.current = pc;

      // ICE Candidate 수집
      /* 
      onicecandidate는 RTCPeerConnection 객체에 설정하는 이벤트 핸들러이다.
      발생시점: pc 객체가 STUN/TURN 서버를 통해 클라이언트의 네트워크 경로 후보(ICE Candidate)를 성공적으로 발견할 때마다 이 함수가 호출된다.

      event.candidate는 onicecandidate 이벤트 객체에 포함된 속성이다. 이 속성은 발견된 네크워크 주소 정보(IP, 포트, 프로토콜 등)를 담고있는 RTCIceCandidate 객체이거나, 모든 후보가 수집되었음을 나타내는 null 값이다.
    */
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("Sending ICE candidate");
          socketRef.current.emit("ice-candidate", {
            roomId,
            candidate: event.candidate,
          });
        }
      };

      // ICE 연결 상태 변경
      /*
        oniceconnectionstatechange는 ICE 과정의 상태변화를 추적한다.
        주요 상태: checking (후보 검색 중), connected (하나의 경로로 연결됨), completed (모든 경로 확인 완료), failed (경로 확립 실패) 등이 있다.
      */
      pc.oniceconnectionstatechange = () => {
        console.log("ICE connection state:", pc.iceConnectionState);
      };

      // 연결 상태 변경
      pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);
        // React의 상태를 업데이트하여 UI에 현재 연결 상태를 표시한다
        setConnectionState(pc.connectionState);
        // onConnecitionChange?.(...): 외부에서 전달받은 콜백 함수를 호출하여 연결 상태 변화를 상위 컴포넌트나 다른 훅에 알린다.
        onConnecitionChange?.(pc.connectionState);

        if (pc.connectionState === "connected") {
          console.log("P2P connection established");
          // 대기 중인 메시지 전송
          flushMessageQueue();
        } else if (pc.connectionState === "disconnected") {
          console.log("Connection disconnected, attempting reconnect...");
          attemptReconnectFuncRef.current?.();
        } else if (pc.connectionState === "failed") {
          console.log("Connection failed");
        }
      };

      // DataChannel 설정
      if (isInitiator) {
        // Host가 DataChannel 생성
        const DataChannel = pc.createDataChannel("game-data", {
          ordered: true, // 메시지를 보낸 순서대로 상대방이 수신하도록 보장한다.
          maxRetransmits: 3, // 데이터 전송 실패 시 최대 3번까지 재전송을 시도한다.
        });
        setupDataChannel(DataChannel);

        // Offer 생성 및 전송
        createAndSendOffer(pc);
      } else {
        // Guest는 DataChannel 수신 대기
        pc.ondatachannel = (event) => {
          console.log("DataChannel received");
          setupDataChannel(event.channel);
        };
      }
    },
    [roomId, onConnecitionChange, createAndSendOffer, flushMessageQueue, setupDataChannel]
  );

  useEffect(() => {
    initializePCRef.current = initializePeerConnection;
    attemptReconnectFuncRef.current = attemptReconnect;
  }, [initializePeerConnection, attemptReconnect]);

  const setupSocketListeners = () => {
    const socket = socketRef.current;

    socket.on("connect", () => {
      console.log("Signaling server connected");
    });

    socket.on("disconnect", () => {
      console.log("Signaling server disconnected");
    });

    socket.on("room-created", ({ roomId: newRoomId }) => {
      console.log("Room created:", newRoomId);
      setIsHost(true);
      initializePeerConnection(true);
    });

    socket.on("room-joined", () => {
      console.log("Joined room");
      setIsHost(false);
      initializePeerConnection(false);
    });

    socket.on("guest-joined", ({ guestId }) => {
      console.log("Guest joined:", guestId);
      if (peerConnectionRef.current) {
        console.log("Creating offer as host...");
        createAndSendOffer(peerConnectionRef.current);
      } else {
        console.error("PeerConnection not initialized yet");
      }
    });

    socket.on("offer", async ({ offer, from }) => {
      console.log("Received offer from", from);
      await handleOffer(offer);
    });

    socket.on("answer", async ({ answer, from }) => {
      console.log("Received answer from", from);
      await handleAnswer(answer);
    });

    socket.on("ice-candidate", async ({ candidate, from }) => {
      console.log("Received ICE candidate from", from);
      await handleIceCandidate(candidate);
    });

    // 서버를 통한 게임 초기화 수신 (호스트가 시그널링으로도 보낼 경우 대비)
    socket.on("game-init", ({ state }) => {
      console.log("Received game-init via signaling");
      onMessage?.({ type: "GAME_INIT", state });
    });

    socket.on("opponent-disconnected", () => {
      console.log("Opponent disconnected");
      alert("상대방의 연결이 끊어졌습니다.");
    });

    socket.on("error", ({ message }) => {
      console.error("Socket error:", message);
      alert(message);
    });
  };

  // 방 생성
  const createRoom = useCallback((userId) => {
    socketRef.current.emit("create-room", {
      userId,
    });
  }, []);

  // 방 참가
  const joinRoom = useCallback((targetRoomId, userId) => {
    socketRef.current.emit("join-room", {
      roomId: targetRoomId,
      userId,
    });
  }, []);

  // 정리
  const cleanup = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    if (dataChannelRef.current) {
      dataChannelRef.current.close();
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
    }
  };

  // Signaling Server 연결
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(SIGNALING_SERVER, {
        reconnection: true, // 재연결 시도 활성화
        reconnectionDelay: 1000, // 첫 재연결 시도 딜레이 (1초)
        reconnectionDelayMax: 5000, // 최대 재연결 딜레이 (5초)
        reconnectionAttempts: 5, // 최대 재연결 시도 횟수 (5번)
      });

      setupSocketListeners();
    }

    return () => {
      cleanup();
    };
  }, [setupSocketListeners]);

  // emit via signaling socket helper
  const emitSignaling = useCallback((event, payload) => {
    if (socketRef.current) {
      const data = { roomId, ...(payload || {}) };
      console.log("Emit signaling", event, data);
      socketRef.current.emit(event, data);
    }
  }, [roomId]);

  return {
    connectionState,
    isHost,
    createRoom,
    joinRoom,
    sendMessage,
    emitSignaling,
    peerConnection: peerConnectionRef,
  };
};
