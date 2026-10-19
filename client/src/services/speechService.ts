// EchoSight - Web Speech API Service (STT & TTS)

let recognitionInstance: any = null;
let isListeningState = false;

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
}

export function isSpeechSynthesisSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'speechSynthesis' in window;
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

  // Cancel any ongoing speech to avoid queue overlap
  window.speechSynthesis.cancel();

  // Strip markdown formatting symbols for natural spoken flow
  const cleanText = text
    .replace(/[#*_`~]/g, '')
    .replace(/\n+/g, ' ')
    .trim();

  if (!cleanText) {
    onEnd?.();
    return;
  }

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 0.95; // Calm, steady pace suitable for accessibility
  utterance.pitch = 1.0;

  utterance.onend = () => {
    onEnd?.();
  };

  utterance.onerror = (e) => {
    console.warn('[Speech] Synthesis error:', e);
    onEnd?.();
  };

  window.speechSynthesis.speak(utterance);
}

/**
 * Stop any ongoing speech immediately.
 */
export function stopSpeaking(): void {
  if (isSpeechSynthesisSupported()) {
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

  try {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!recognitionInstance) {
      recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'en-US';

      recognitionInstance.onresult = (event: any) => {
        const lastResult = event.results[event.results.length - 1];
        if (lastResult.isFinal) {
          const transcript = lastResult[0].transcript.trim();
          console.log('[Speech] Recognized voice command:', transcript);
          onCommand(transcript);
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
    recognitionInstance.start();
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
  if (recognitionInstance) {
    try {
      recognitionInstance.stop();
    } catch {
      // Ignore
    }
  }
  onStatusChange?.(false);
}
