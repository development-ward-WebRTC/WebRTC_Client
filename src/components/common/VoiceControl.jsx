const VoiceControl = ({peerConection}) => {
    const [isMicOn, setIsMicOn] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [error, setError] = useState('');
    const localStreamRef = useRef(null);
    const remoteAudioRef = useRef(null);

    useEffect(() => {
        if (!peerConection) return;

        // 원격 오디오 스트림 처리
        peerConection.ontrack = (event) => {
            console.log('Received remote audio track');
            if (remoteAudioRef.current && event.streams[0]) {
                remoteAudioRef.current.srcObject = event.streams[0]
            }
        }
    })
}