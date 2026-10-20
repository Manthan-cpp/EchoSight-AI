// EchoSight - Web Speech API Service (STT & TTS)

let recognitionInstance: any = null;
let isListeningState = false;
let currentOnCommand: ((transcript: string) => void) | null = null;
let lastProcessedCommand = '';
let lastProcessedTime = 0;

export let isEchoSightSpeaking = false;

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

  const doSpeak = () => {
    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 0.95; // Calm, steady pace suitable for accessibility
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      const voice = getVoice();
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => {
        isEchoSightSpeaking = true;
      };

      utterance.onend = () => {
        isEchoSightSpeaking = false;
        onEnd?.();
      };

      utterance.onerror = (e) => {
        console.warn('[Speech] Synthesis error:', e);
        isEchoSightSpeaking = false;
        onEnd?.();
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('[Speech] speakText failed:', err);
      isEchoSightSpeaking = false;
      onEnd?.();
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
    isEchoSightSpeaking = false;
    window.speechSynthesis.cancel();
  }
}

/**
 * Start listening for continuous voice input.
 */
export function startListening(
  onCommand: (transcript: string) => void,
  onStatusChange?: (isListening: boolean) => void,
  onError?: (err: string) => void
): boolean {
  if (!isSpeechRecognitionSupported()) {
    onError?.('Speech recognition is not supported in this browser. Please use keyboard or a supported browser.');
    return false;
  }

  // Always update the active command handler to prevent stale closures
  currentOnCommand = onCommand;

  try {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!recognitionInstance) {
      recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'en-US';

      recognitionInstance.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0].transcript.trim();
            if (!transcript) continue;

            const now = Date.now();

            // Ignore audio input when EchoSight itself is speaking (echo cancellation guard)
            if (isEchoSightSpeaking) {
              console.log('[Speech] Ignored mic input while EchoSight is speaking:', transcript);
              continue;
            }

            // Debounce rapid duplicate commands within 2.5 seconds
            if (
              transcript.toLowerCase() === lastProcessedCommand.toLowerCase() &&
              now - lastProcessedTime < 2500
            ) {
              console.log('[Speech] Ignored duplicate rapid command:', transcript);
              continue;
            }

            lastProcessedCommand = transcript;
            lastProcessedTime = now;

            console.log('[Speech] Recognized voice command:', transcript);
            currentOnCommand?.(transcript);
          }
        }
      };

      recognitionInstance.onerror = (event: any) => {
        console.warn('[Speech] Recognition error:', event.error);
        if (event.error !== 'no-speech') {
          onError?.(`Voice recognition error: ${event.error}`);
        }
      };

      recognitionInstance.onend = () => {
        // Auto-restart if still intended to be listening
        if (isListeningState) {
          try {
            recognitionInstance.start();
          } catch {
            // Ignore if already started
          }
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
  if (recognitionInstance) {
    try {
      recognitionInstance.stop();
    } catch {
      // Ignore
    }
  }
  onStatusChange?.(false);
}
