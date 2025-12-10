import React, { useState, useEffect, useRef } from "react";

const VoiceControl = ({ peerConnection, connectionState }) => {
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState("");
  const [warningShown, setWarningShown] = useState(false);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const trackAddedRef = useRef(false); // 트랙이 이미 추가되었는지 추적

  const startVoice = async () => {
    try {
      setError("");

      // 연결 상태 확인
      const pc = peerConnection;
      console.log("VoiceControl startVoice - trackAdded:", trackAddedRef.current, "hasStream:", !!localStreamRef.current, "signalingState:", pc?.signalingState);

      // 이미 스트림이 있으면 그냥 활성화만
      if (localStreamRef.current && trackAddedRef.current) {
        localStreamRef.current.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
        setIsVoiceEnabled(true);
        setIsMuted(false);
        console.log("Voice chat re-enabled (track already added)");
        return;
      }

      // PC 확인
      if (!pc) {
        setError("연결이 초기화되지 않았습니다. 페이지를 새로고침해주세요.");
        return;
      }
      
      if (pc.signalingState === "closed") {
        if (!warningShown) {
          alert("⚠️ WebRTC 연결이 닫혔습니다.\n\n음성 채팅을 사용하려면:\n1. 로비로 돌아가기\n2. 새로운 방 생성\n3. 게임 시작 후 바로 음성 활성화\n\n현재 게임은 계속 진행 가능합니다.");
          setWarningShown(true);
        }
        setError("WebRTC 연결이 닫혔습니다. 새 게임을 시작해주세요.");
        return;
      }

      // 브라우저 미디어 지원 확인 및 디버깅
      console.log("🔍 Checking media support:", {
        hasNavigator: !!navigator,
        hasMediaDevices: !!navigator?.mediaDevices,
        hasGetUserMedia: !!navigator?.mediaDevices?.getUserMedia,
        isSecureContext: window.isSecureContext,
        protocol: window.location.protocol,
      });

      // getUserMedia 참조 확인 (React DevTools hook 우회)
      const getUserMedia = navigator?.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices)
        || navigator?.getUserMedia?.bind(navigator)
        || navigator?.webkitGetUserMedia?.bind(navigator)
        || navigator?.mozGetUserMedia?.bind(navigator);

      if (!getUserMedia) {
        setError("이 브라우저는 마이크 접근을 지원하지 않습니다.");
        console.error("getUserMedia is not supported in this browser");
        return;
      }

      // 마이크 권한 요청 (첫 번째만)
      let stream;
      try {
        // 최신 API 우선 시도
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: false,
          });
        } else {
          // 레거시 API 폴백
          stream = await new Promise((resolve, reject) => {
            getUserMedia(
              { audio: true, video: false },
              resolve,
              reject
            );
          });
        }
      } catch (getUserMediaError) {
        console.error("getUserMedia error:", getUserMediaError);
        throw getUserMediaError;
      }

      if (!stream) {
        setError("마이크 스트림을 가져올 수 없습니다.");
        return;
      }

      localStreamRef.current = stream;
      console.log("✅ Got media stream:", stream.getTracks());

      // 오디오 트랙을 PeerConnection에 추가 (첫 번째만)
      if (pc && pc.signalingState !== "closed" && !trackAddedRef.current) {
        stream.getTracks().forEach((track) => {
          if (track.kind === "audio") {
            try {
              pc.addTrack(track, stream);
              trackAddedRef.current = true;
              console.log("Audio track added successfully");
            } catch (err) {
              console.error("Failed to add track:", err);
              setError("오디오 트랙 추가 실패. 연결을 확인해주세요.");
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
          }
        });
      } else if (trackAddedRef.current) {
        console.log("Track already added, just enabling");
      } else {
        console.error("PeerConnection is closed. Cannot add track.");
        setError("연결이 종료되었습니다. 게임을 다시 시작해주세요.");
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      setIsVoiceEnabled(true);
      setIsMuted(false);
      console.log("Voice chat started");
    } catch (err) {
      console.error("Failed to start voice chat:", err);
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setError("마이크 접근 권한이 필요합니다");
      } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        setError("마이크를 찾을 수 없습니다");
      } else {
        setError("마이크 사용 중 오류가 발생했습니다");
      }
    }
  };

  const stopVoice = () => {
    if (localStreamRef.current) {
      // 트랙을 완전히 종료하지 않고 비활성화만 (재사용 가능)
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = false;
      });
    }
    setIsVoiceEnabled(false);
    setIsMuted(false);
    console.log("Voice chat disabled (track kept for reuse)");
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleVoice = () => {
    if (isVoiceEnabled) {
      stopVoice();
    } else {
      startVoice();
    }
  };

  useEffect(() => {
    const pc = peerConnection;
    if (!pc || pc.signalingState === "closed") return;

    // 원격 오디오 스트림 처리
    const handleTrack = (event) => {
      console.log("Received remote audio track");
      if (remoteAudioRef.current && event.streams[0]) {
        remoteAudioRef.current.srcObject = event.streams[0];
      }
    };

    pc.addEventListener("track", handleTrack);

    return () => {
      pc.removeEventListener("track", handleTrack);
      // cleanup 시 완전히 종료
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
        localStreamRef.current = null;
      }
      trackAddedRef.current = false;
    };
  }, [peerConnection]);

  // 연결 상태 확인
  const pc = peerConnection;
  const signalingState = pc?.signalingState;
  const pcConnectionState = pc?.connectionState;
  
  // 버튼 활성화 조건:
  // 1. PC가 존재하고
  // 2. signalingState가 closed가 아니고 (또는 stable, have-local-offer 등)
  // 3. connectionState가 closed가 아님
  const isConnected = !!pc && signalingState !== "closed" && pcConnectionState !== "closed";
  
  // 디버깅용
  useEffect(() => {
    console.log("🎤 VoiceControl render:", {
      hasPeerConnection: !!pc,
      signalingState: signalingState,
      connectionState: connectionState,
      pcConnectionState: pc?.connectionState,
      iceConnectionState: pc?.iceConnectionState,
      hasLocalDescription: !!pc?.localDescription,
      hasRemoteDescription: !!pc?.remoteDescription,
      isConnected: isConnected,
    });
  }, [pc, signalingState, connectionState, isConnected]);

  return (
    <div className="flex items-center gap-3">
      {/* 원격 오디오 (숨김) */}
      <audio ref={remoteAudioRef} autoPlay />

      {/* 음성 ON/OFF 버튼 - changed from green/gray to blue card game style */}
      <button
        onClick={toggleVoice}
        disabled={!isConnected}
        className={`px-5 py-2 rounded-lg font-bold transition-all ${
          !isConnected
            ? "bg-gradient-to-b from-gray-800 to-gray-900 text-gray-500 border border-gray-700 cursor-not-allowed opacity-50"
            : isVoiceEnabled
            ? "bg-gradient-to-b from-blue-600 to-blue-700 text-white border border-blue-500 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105"
            : "bg-gradient-to-b from-gray-700 to-gray-800 text-gray-300 border border-gray-600 shadow-lg shadow-gray-600/20 hover:shadow-gray-600/40 hover:scale-105"
        }`}
        title={
          !isConnected
            ? `게임 연결 후 사용 가능합니다 (상태: ${connectionState || "unknown"})`
            : isVoiceEnabled
            ? "음성 채팅 끄기"
            : "음성 채팅 켜기"
        }
      >
        🎤 {isVoiceEnabled ? "ON" : "OFF"}
      </button>

      {/* 음소거 버튼 (음성 활성화 시에만 표시) - changed from red/blue to blue card game style */}
      {isVoiceEnabled && (
        <button
          onClick={toggleMute}
          className={`px-5 py-2 rounded-lg font-bold transition-all ${
            isMuted
              ? "bg-gradient-to-b from-red-700 to-red-800 text-white border border-red-600 shadow-lg shadow-red-600/30 hover:shadow-red-600/50 hover:scale-105"
              : "bg-gradient-to-b from-blue-600 to-blue-700 text-white border border-blue-500 shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105"
          }`}
          title={isMuted ? "음소거 해제" : "음소거"}
        >
          {isMuted ? "🔇 음소거" : "🔊 활성"}
        </button>
      )}

      {/* 에러/경고 메시지 */}
      {error && <span className="text-red-400 text-sm font-semibold">{error}</span>}
      {!error && signalingState === "closed" && (
        <span className="text-yellow-400 text-sm">⚠️ 연결 끊김 (게임 재시작 필요)</span>
      )}
    </div>
  );
};

export default VoiceControl;
