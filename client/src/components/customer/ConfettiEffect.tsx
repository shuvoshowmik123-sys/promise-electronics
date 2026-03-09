import { useEffect, useState } from "react";

/**
 * Lightweight confetti burst effect using pure CSS @keyframes.
 * No external library needed.
 *
 * Usage:
 *   <ConfettiEffect show={orderSuccess} />
 *
 * Props:
 *   show — triggers a new burst when set to true
 *   duration — how long the confetti lasts (default: 2500ms)
 *   particleCount — number of confetti pieces (default: 30)
 */
interface ConfettiEffectProps {
    show: boolean;
    duration?: number;
    particleCount?: number;
}

const COLORS = [
    "#0ea5e9", // brand blue
    "#14b8a6", // teal
    "#f59e0b", // amber
    "#ef4444", // red
    "#8b5cf6", // violet
    "#22c55e", // green
    "#f97316", // orange
    "#ec4899", // pink
];

export function ConfettiEffect({ show, duration = 2500, particleCount = 30 }: ConfettiEffectProps) {
    const [particles, setParticles] = useState<Array<{
        id: number;
        x: number;
        y: number;
        color: string;
        size: number;
        rotation: number;
        delay: number;
    }>>([]);

    useEffect(() => {
        if (!show) {
            setParticles([]);
            return;
        }

        const newParticles = Array.from({ length: particleCount }, (_, i) => ({
            id: i,
            x: Math.random() * 100 - 50,  // spread -50 to 50 vw
            y: -(Math.random() * 60 + 40), // fly upward -40 to -100
            color: COLORS[Math.floor(Math.random() * COLORS.length)],
            size: Math.random() * 6 + 4,   // 4-10px
            rotation: Math.random() * 360,
            delay: Math.random() * 300,     // stagger 0-300ms
        }));

        setParticles(newParticles);

        const timer = setTimeout(() => setParticles([]), duration);
        return () => clearTimeout(timer);
    }, [show, duration, particleCount]);

    if (particles.length === 0) return null;

    return (
        <div
            className="fixed inset-0 pointer-events-none z-[200] overflow-hidden"
            aria-hidden="true"
        >
            {particles.map((p) => (
                <span
                    key={p.id}
                    style={{
                        position: "absolute",
                        left: "50%",
                        top: "50%",
                        width: p.size,
                        height: p.size,
                        backgroundColor: p.color,
                        borderRadius: p.size > 7 ? "50%" : "2px",
                        transform: `rotate(${p.rotation}deg)`,
                        animation: `confetti-burst ${duration}ms cubic-bezier(0.25, 0.46, 0.45, 0.94) ${p.delay}ms forwards`,
                        ["--confetti-x" as string]: `${p.x}vw`,
                        ["--confetti-y" as string]: `${p.y}vh`,
                    }}
                />
            ))}

            <style>{`
        @keyframes confetti-burst {
          0% {
            transform: translate(0, 0) rotate(0deg) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(var(--confetti-x), var(--confetti-y)) rotate(720deg) scale(0);
            opacity: 0;
          }
        }
      `}</style>
        </div>
    );
}
