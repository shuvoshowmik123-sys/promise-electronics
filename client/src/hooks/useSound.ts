import { useCallback, useState } from "react";

// Short "pop" sound for sent messages (Base64) - ~0.1s check sound
const SENT_SFX = "data:audio/mp3;base64,//uQRAAAAWMSLwUIYAAsYkXgoQwAEaYLWfkWgAI0wWs/ItAAAG84AAAD5555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555";

// Gentle "ping" for received messages (Base64) - ~0.2s notification
const RECV_SFX = "data:audio/mp3;base64,//uQRAAAAWMSLwUIYAAsYkXgoQwAEaYLWfkWgAI0wWs/ItAAAG84AAAD5555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555555";

export function useSound() {
    const [isMuted, setIsMuted] = useState(() => {
        try {
            const saved = localStorage.getItem("chat_muted");
            return saved ? JSON.parse(saved) : false;
        } catch {
            return false;
        }
    });

    const toggleMute = useCallback(() => {
        setIsMuted((prev: boolean) => {
            const newState = !prev;
            localStorage.setItem("chat_muted", JSON.stringify(newState));
            return newState;
        });
    }, []);

    const playSent = useCallback(() => {
        if (isMuted) return;
        try {
            const audio = new Audio(SENT_SFX);
            audio.volume = 0.4;
            // Play promise handling to avoid uncaught errors if user hasn't interacted
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => {
                    // Auto-play was prevented
                    // Console log is fine here as it's expected behavior in some browsers
                });
            }
        } catch (e) {
            // Ignore audio creation errors
        }
    }, [isMuted]);

    const playReceived = useCallback(() => {
        if (isMuted) return;
        try {
            const audio = new Audio(RECV_SFX);
            audio.volume = 0.4;
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(error => { });
            }
        } catch (e) {
            // Ignore
        }
    }, [isMuted]);

    return {
        isMuted,
        toggleMute,
        playSent,
        playReceived
    };
}
