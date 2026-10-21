// EchoSight - Web Speech API Service (STT & TTS with Barge-In Interruption)

let recognitionInstance: any = null;
let isListeningState = false;
let currentOnCommand: ((transcript: string) => void) | null = null;
let currentOnInterim: ((interim: string) => void) | null = null;
let currentOnError: ((err: string) => void) | null = null;
let currentOnStatusChange: ((isListening: boolean) => void) | null = null;
let lastProcessedCommand = '';
let lastProcessedTime = 0;

let currentSpeakingText = '';
let lastSpokenText = '';
let lastSpokenTime = 0;

export let isEchoSightSpeaking = false;

type SpeechStateListener = (speaking: boolean, text?: string) => void;
const speechListeners = new Set<SpeechStateListener>();

export function onSpeechStateChange(listener: SpeechStateListener): () => void {
  speechListeners.add(listener);
  listener(isEchoSightSpeaking, currentSpeakingText);
  return () => {
    speechListeners.delete(listener);
  };
}

function updateSpeakingState(speaking: boolean, text: string = ''): void {
  isEchoSightSpeaking = speaking;
  speechListeners.forEach((fn) => {
    try {
      fn(speaking, text);
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

  const now = Date.now();
  // Prevent repeating identical sentence if requested within 1.5 seconds
  if (
    cleanText.toLowerCase() === lastSpokenText.toLowerCase() &&
    (isEchoSightSpeaking || now - lastSpokenTime < 1500)
  ) {
    console.log('[Speech] Suppressed rapid duplicate speakText:', cleanText);
    return;
  }

  lastSpokenText = cleanText;
  lastSpokenTime = now;
  currentSpeakingText = cleanText;
  updateSpeakingState(true, cleanText);

  let hasEnded = false;
  const safeOnEnd = () => {
    if (!hasEnded) {
      hasEnded = true;
      currentSpeakingText = '';
      updateSpeakingState(false, '');
      onEnd?.();
    }
  };

  const doSpeak = () => {
    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      const voice = getVoice();
      if (voice) {
        utterance.voice = voice;
      }

      utterance.onstart = () => {
        updateSpeakingState(true, cleanText);
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

  // If already speaking, cancel first and wait a brief tick
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
    currentSpeakingText = '';
    updateSpeakingState(false, '');
    window.speechSynthesis.cancel();
  }
}

/**
 * Mark a command as already handled to prevent residual duplicate triggers.
 */
export function markCommandHandled(command: string): void {
  lastProcessedCommand = command.trim();
  lastProcessedTime = Date.now();
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

let accumulatedUtterance = '';
let silenceDebounceTimer: any = null;

function isImmediateCommand(text: string): boolean {
  const clean = text.toLowerCase().trim();
  return (
    /^(stop|silence|pause|quiet|hush|shut\s*up|halt)$/i.test(clean) ||
    /^(stop|turn\s*off|shut\s*down|close|disable|kill)\s*(the\s*)?(camera|radar|scanning|video|stream)$/i.test(clean) ||
    /^(enter|inter|into|center|start|begin|go|open|launch)$/i.test(clean) ||
    /^(clear|clear\s*image|clear\s*photo|clear\s*snapshot|delete\s*photo|delete\s*image|remove\s*image|remove\s*photo|reset)$/i.test(clean) ||
    /^(can\s*i\s*(walk|move|step|go|move\s*forward|go\s*forward)|is\s*it\s*clear|is\s*the\s*path\s*clear|safe\s*to\s*walk|can\s*i\s*take\s*a\s*step|where\s*(should|can|do)\s*i\s*(move|go|walk)(\s*now)?)$/i.test(clean)
  );
}

function flushAccumulatedCommand(): void {
  if (silenceDebounceTimer) {
    clearTimeout(silenceDebounceTimer);
    silenceDebounceTimer = null;
  }
  const text = accumulatedUtterance.trim();
  accumulatedUtterance = '';
  if (!text) return;

  const now = Date.now();
  if (
    text.toLowerCase() === lastProcessedCommand.toLowerCase() &&
    now - lastProcessedTime < 800
  ) {
    console.log('[Speech] Ignored duplicate rapid command:', text);
    return;
  }

  lastProcessedCommand = text;
  lastProcessedTime = now;
  console.log('[Speech] Full completed voice command:', text);
  currentOnCommand?.(text);
}

function initRecognition(): any {
  if (typeof window === 'undefined') return null;
  const SpeechRecognition =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return null;

  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;

  const userLang =
    typeof navigator !== 'undefined' && navigator.language
      ? navigator.language
      : 'en-US';
  recognition.lang = userLang;

  recognition.onresult = (event: any) => {
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
    const activeText = trimmedFinal || trimmedInterim;

    // --- INSTANT BARGE-IN INTERRUPTION ---
    // If user begins speaking, immediately halt AI speech output unless it's just mic echo
    if (activeText && (window.speechSynthesis?.speaking || isEchoSightSpeaking)) {
      const isEcho =
        currentSpeakingText &&
        currentSpeakingText.toLowerCase().includes(activeText.toLowerCase());
      if (!isEcho) {
        console.log('[Speech] User speech detected — immediately interrupting system speech!');
        stopSpeaking();
      }
    }

    // Accumulate final chunk into the current pending utterance
    if (trimmedFinal) {
      accumulatedUtterance = (accumulatedUtterance + ' ' + trimmedFinal).trim();
    }

    // Live interim display combining what is already locked in with incoming syllables
    const liveInterim = (accumulatedUtterance + ' ' + trimmedInterim).trim();
    if (liveInterim && currentOnInterim) {
      currentOnInterim(liveInterim);
    }

    // Check for immediate single-word commands that shouldn't wait for silence debounce
    if (isImmediateCommand(accumulatedUtterance) || isImmediateCommand(trimmedFinal)) {
      flushAccumulatedCommand();
      return;
    }

    // When the user speaks, reset silence debounce timer (650ms pause signifies end of thought)
    if (silenceDebounceTimer) {
      clearTimeout(silenceDebounceTimer);
      silenceDebounceTimer = null;
    }

    if (accumulatedUtterance) {
      silenceDebounceTimer = setTimeout(() => {
        flushAccumulatedCommand();
      }, 650);
    }
  };

  recognition.onerror = (event: any) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      console.warn('[Speech] Recognition error:', event.error);
      if (event.error === 'not-allowed') {
        currentOnError?.('Microphone permission needed. Please allow microphone in your browser.');
      } else {
        currentOnError?.(`Voice recognition: ${event.error}`);
      }
    }
  };

  recognition.onend = () => {
    // If an utterance was accumulated before recognition stopped, flush it
    if (accumulatedUtterance.trim()) {
      flushAccumulatedCommand();
    }

    if (isListeningState) {
      setTimeout(() => {
        if (isListeningState) {
          try {
            if (recognitionInstance) {
              try {
                recognitionInstance.onend = null;
                recognitionInstance.onerror = null;
                recognitionInstance.onresult = null;
                recognitionInstance.abort();
              } catch {}
              recognitionInstance = null;
            }
            recognitionInstance = initRecognition();
            recognitionInstance?.start();
          } catch (err) {
            console.warn('[Speech] Could not restart recognition:', err);
          }
        }
      }, 100);
    } else {
      currentOnStatusChange?.(false);
    }
  };

  return recognition;
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
    onError?.('Speech recognition is not supported in this browser.');
    return false;
  }

  currentOnCommand = onCommand;
  currentOnInterim = onInterim || null;
  currentOnError = onError || null;
  currentOnStatusChange = onStatusChange || null;
  isListeningState = true;
  accumulatedUtterance = '';
  if (silenceDebounceTimer) {
    clearTimeout(silenceDebounceTimer);
    silenceDebounceTimer = null;
  }

  // Always abort old instance to ensure fresh state
  if (recognitionInstance) {
    try {
      recognitionInstance.onend = null;
      recognitionInstance.onerror = null;
      recognitionInstance.onresult = null;
      recognitionInstance.abort();
    } catch {}
    recognitionInstance = null;
  }

  try {
    recognitionInstance = initRecognition();
    recognitionInstance?.start();
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
  if (silenceDebounceTimer) {
    clearTimeout(silenceDebounceTimer);
    silenceDebounceTimer = null;
  }
  accumulatedUtterance = '';
  currentOnCommand = null;
  currentOnInterim = null;
  if (recognitionInstance) {
    try {
      recognitionInstance.onend = null;
      recognitionInstance.onerror = null;
      recognitionInstance.onresult = null;
      recognitionInstance.stop();
    } catch {
      // Ignore
    }
    recognitionInstance = null;
  }
  onStatusChange?.(false);
}
