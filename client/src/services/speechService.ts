// EchoSight - Web Speech API Service (STT & TTS with Barge-In Interruption)

let recognitionInstance: any = null;
let isListeningState = false;
let currentOnCommand: ((transcript: string) => void) | null = null;
let currentOnInterim: ((interim: string) => void) | null = null;
let lastProcessedCommand = '';
let lastProcessedTime = 0;

export let isEchoSightSpeaking = false;

type SpeechStateListener = (speaking: boolean) => void;
const speechListeners = new Set<SpeechStateListener>();

export function onSpeechStateChange(listener: SpeechStateListener): () => void {
  speechListeners.add(listener);
  listener(isEchoSightSpeaking);
  return () => {
    speechListeners.delete(listener);
  };
}

function updateSpeakingState(speaking: boolean): void {
  isEchoSightSpeaking = speaking;
  speechListeners.forEach((fn) => {
    try {
      fn(speaking);
    } catch (err) {
      console.warn('[Speech] Error in speech state listener:', err);
    }
  });
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window;
}

// Cached voices list
let cachedVoices: SpeechSynthesisVoice[] = [];
function getVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !isSpeechSynthesisSupported()) return null;
  if (cachedVoices.length === 0) {
    cachedVoices = window.speechSynthesis.getVoices();
  }
  return (
    cachedVoices.find((v) => v.lang === 'en-US' && !v.name.includes('Google')) ||
    cachedVoices.find((v) => v.lang.startsWith('en')) ||
    null
  );
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedVoices = window.speechSynthesis.getVoices();
  };
}

/**
 * Speak text out loud using native Web Speech Synthesis.
 */
export function speakText(text: string, onEnd?: () => void): void {
  if (!isSpeechSynthesisSupported()) {
    console.warn('[Speech] Speech synthesis not supported in this browser.');
    onEnd?.();
    return;
  }

  // Strip markdown formatting symbols for natural spoken flow
  const cleanText = text
    .replace(/[#*_`~]/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  if (!cleanText) {
    onEnd?.();
    return;
  }

  let hasEnded = false;
  const safeOnEnd = () => {
    if (!hasEnded) {
      hasEnded = true;
      updateSpeakingState(false);
      onEnd?.();
    }
  };

  const doSpeak = () => {
    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0; // Steady walking pace
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      const voice = getVoice();
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => {
        updateSpeakingState(true);
      };

      utterance.onend = () => {
        safeOnEnd();
      };

      utterance.onerror = (e) => {
        console.warn('[Speech] Synthesis error:', e);
        safeOnEnd();
      };

      // Safety timeout: Chrome occasionally drops onend for long utterances
      const maxSpeechMs = Math.max(4000, cleanText.split(' ').length * 600 + 2000);
      setTimeout(() => {
        if (!hasEnded && isEchoSightSpeaking) {
          safeOnEnd();
        }
      }, maxSpeechMs);

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[Speech] speakText failed:', err);
      safeOnEnd();
    }
  };

  // If already speaking, cancel first and wait a brief tick to avoid Chrome's cancel-speak collision bug
  if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
    window.speechSynthesis.cancel();
    setTimeout(doSpeak, 40);
  } else {
    doSpeak();
  }
}

/**
 * Stop any ongoing speech immediately.
 */
export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
    updateSpeakingState(false);
    window.speechSynthesis.cancel();
  }
}

/**
 * Update the active listening handlers without resetting speech recognition.
 */
export function updateListeningHandlers(
  onCommand: (transcript: string) => void,
  onInterim?: (interim: string) => void
): void {
  currentOnCommand = onCommand;
  currentOnInterim = onInterim || null;
}

/**
 * Start listening for continuous voice input with barge-in interruption.
 */
export function startListening(
  onCommand: (transcript: string) => void,
  onStatusChange?: (isListening: boolean) => void,
  onError?: (err: string) => void,
  onInterim?: (interim: string) => void
): boolean {
  if (!isSpeechRecognitionSupported()) {
    onError?.('Speech recognition is not supported in this browser. Please use keyboard or a supported browser.');
    return false;
  }

  // Always update active handlers to prevent stale React closures
  currentOnCommand = onCommand;
  currentOnInterim = onInterim || null;

  try {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!recognitionInstance) {
      recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true; // Crucial for instant barge-in and real-time recognition

      // Auto-detect browser/user locale for natural recognition across accents
      const userLang =
        typeof navigator !== 'undefined' && navigator.language
          ? navigator.language
          : 'en-US';
      recognitionInstance.lang = userLang;
      console.log('[Speech] Recognition configured for language:', userLang);

      recognitionInstance.onresult = (event: any) => {
        let finalChunk = '';
        let interimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const item = event.results[i];
          const text = item[0]?.transcript || '';
          if (item.isFinal) {
            finalChunk += text + ' ';
          } else {
            interimChunk += text + ' ';
          }
        }

        const trimmedFinal = finalChunk.trim();
        const trimmedInterim = interimChunk.trim();

        // --- BARGE-IN INTERRUPTION ---
        // If the user speaks ANY word while EchoSight is talking, immediately silence the system!
        if (trimmedFinal || trimmedInterim) {
          if (
            typeof window !== 'undefined' &&
            (window.speechSynthesis.speaking || isEchoSightSpeaking)
          ) {
            console.log('[Speech] User speech detected — immediately interrupting system voice!');
            stopSpeaking();
          }
        }

        if (trimmedInterim && currentOnInterim) {
          currentOnInterim(trimmedInterim);
        }

        if (trimmedFinal) {
          const now = Date.now();

          // Reject duplicate commands fired within 1.5 seconds
          if (
            trimmedFinal.toLowerCase() === lastProcessedCommand.toLowerCase() &&
            now - lastProcessedTime < 1500
          ) {
            console.log('[Speech] Ignored duplicate rapid command:', trimmedFinal);
            return;
          }

          lastProcessedCommand = trimmedFinal;
          lastProcessedTime = now;

          console.log('[Speech] Final recognized voice command:', trimmedFinal);
          currentOnCommand?.(trimmedFinal);
        }
      };

      recognitionInstance.onerror = (event: any) => {
        // 'no-speech' is a normal timeout between sentences in continuous mode
        if (event.error !== 'no-speech') {
          console.warn('[Speech] Recognition error:', event.error);
          onError?.(`Voice recognition notice: ${event.error}`);
        }
      };

      recognitionInstance.onend = () => {
        // Auto-restart if intended to remain active
        if (isListeningState) {
          setTimeout(() => {
            if (isListeningState && recognitionInstance) {
              try {
                recognitionInstance.start();
              } catch {
                // Ignore if already started
              }
            }
          }, 150);
        } else {
          onStatusChange?.(false);
        }
      };
    }

    isListeningState = true;
    try {
      recognitionInstance.start();
    } catch {
      // Already running
    }
    onStatusChange?.(true);
    return true;
  } catch (err: any) {
    console.warn('[Speech] Could not start speech recognition:', err);
    isListeningState = false;
    onStatusChange?.(false);
    onError?.(err.message || 'Could not start microphone');
    return false;
  }
}

/**
 * Stop listening.
 */
export function stopListening(onStatusChange?: (isListening: boolean) => void): void {
  isListeningState = false;
  currentOnCommand = null;
  currentOnInterim = null;
  if (recognitionInstance) {
    try {
      recognitionInstance.stop();
    } catch {
      // Ignore
    }
  }
  onStatusChange?.(false);
}
