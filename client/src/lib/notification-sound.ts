let audioContext: AudioContext | null = null;

export type NotificationTone = 'default' | 'chime' | 'alert' | 'retro';

export const NOTIFICATION_TONES: { label: string; value: NotificationTone }[] = [
  { label: 'Default (Ascending)', value: 'default' },
  { label: 'Chime (Soft)', value: 'chime' },
  { label: 'Alert (Urgent)', value: 'alert' },
  { label: 'Retro (8-bit)', value: 'retro' },
];

export function playNotificationSound(tone: NotificationTone = 'default') {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const now = audioContext.currentTime;

    switch (tone) {
      case 'chime':
        // Soft major third
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, now); // C5
        oscillator.frequency.setValueAtTime(659.25, now + 0.1); // E5

        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

        oscillator.start(now);
        oscillator.stop(now + 0.6);
        break;

      case 'alert':
        // Urgent double beep
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(880, now);

        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.setValueAtTime(0, now + 0.1);
        gainNode.gain.setValueAtTime(0.2, now + 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        oscillator.start(now);
        oscillator.stop(now + 0.4);
        break;

      case 'retro':
        // 8-bit jump sound
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(220, now);
        oscillator.frequency.linearRampToValueAtTime(880, now + 0.2);

        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.2);

        oscillator.start(now);
        oscillator.stop(now + 0.2);
        break;

      case 'default':
      default:
        // Original ascending sequence
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.setValueAtTime(988, now + 0.1);
        oscillator.frequency.setValueAtTime(1047, now + 0.2);

        gainNode.gain.setValueAtTime(0.3, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        oscillator.start(now);
        oscillator.stop(now + 0.4);
        break;
    }
  } catch (e) {
    console.warn('Could not play notification sound:', e);
  }
}
