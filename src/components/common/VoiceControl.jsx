import React, { useState, useEffect, useRef } from "react";

const VoiceControl = ({ peerConnection, connectionState }) => {
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState("");
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const startVoice = async () => {
    try {
      setError("");

      // 연결 상태 확인
      const pc = peerConnection; // state로 전달되므로 .current 불필요
      console.log("VoiceControl - connectionState:", connectionState, "peerConnection:", pc, "signalingState:", pc?.signalingState);
      
      if (!pc || pc.signalingState === "closed" || connectionState !== "connected") {
        setError(`연결 상태가 아닙니다. (상태: ${connectionState}, signalingState: ${pc?.signalingState || "N/A"})`);
        return;
      }

      // 마이크 권한 요청
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      localStreamRef.current = stream;

      // 오디오 트랙을 PeerConnection에 추가
      // 연결 상태를 다시 한 번 확인
      if (pc && pc.signalingState !== "closed" && connectionState === "connected") {
        stream.getTracks().forEach((track) => {
          // track.kind가 'audio'인 트랙만 추가하는 것이 안전합니다.
          if (track.kind === "audio") {
            try {
              pc.addTrack(track, stream);
            } catch (err) {
              console.error("Failed to add track:", err);
              setError("오디오 트랙 추가 실패. 연결을 확인해주세요.");
              stream.getTracks().forEach((t) => t.stop());
              return;
            }
          }
        });
      } else {
        // PeerConnection이 없거나 닫힌 경우 경고 또는 오류 처리
        console.error("PeerConnection is closed or not initialized. Cannot add track.");
        setError("연결 상태가 아닙니다. 게임 연결 후 다시 시도해주세요.");
        // 💡 닫힌 경우 스트림 자원 해제
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      setIsVoiceEnabled(true);
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
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      localStreamRef.current = null;
    }
    setIsVoiceEnabled(false);
    setIsMuted(false);
    console.log("Voice chat stopped");
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
    const pc = peerConnection; // state로 전달되므로 .current 불필요
    if (!pc || connectionState !== "connected") return;

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
      stopVoice();
    };
  }, [peerConnection, connectionState]);

  // 연결 상태 확인 (peerConnection과 connectionState 모두 확인)
  const pc = peerConnection; // state로 전달되므로 .current 불필요
  // connectionState가 "connected"이고 peerConnection이 존재하며 닫히지 않았으면 활성화
  const isConnected = connectionState === "connected" && pc && pc.signalingState !== "closed" && pc.connectionState !== "closed";
  
  // 디버깅용
  useEffect(() => {
    console.log("VoiceControl - connectionState:", connectionState, "peerConnection:", pc, "signalingState:", pc?.signalingState, "connectionState:", pc?.connectionState, "isConnected:", isConnected);
  }, [connectionState, pc, isConnected]);

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

      {/* 에러 메시지 */}
      {error && <span className="text-red-400 text-sm">{error}</span>}
    </div>
  );
};

export default VoiceControl;
