import { useState, useEffect, useRef } from 'react';
import { Eye } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { UnifiedCoPilot, type WorkspaceMode } from './components/UnifiedCoPilot';
import {
  speakText,
  stopSpeaking,
  startListening,
  isSpeechRecognitionSupported,
  markCommandHandled,
} from './services/speechService';

export function App() {
  const [hasEntered, setHasEntered] = useState<boolean>(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState<boolean>(true);
  const [isListeningForEnter, setIsListeningForEnter] = useState<boolean>(false);
  const [activeMode, setActiveMode] = useState<WorkspaceMode>('standby');
  const [isDark, setIsDark] = useState<boolean>(false);
  const [spokenAlert, setSpokenAlert] = useState<string>('');
  const hasSpokenGreetingRef = useRef<boolean>(false);

  // Synchronize data-theme on document root
  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [isDark]);

  const handleEnter = () => {
    if (hasEntered) return;
    setHasEntered(true);
    stopSpeaking();
    markCommandHandled('enter');
    const msg = "Welcome to EchoSight. Say 'start surroundings' for walking guidance, 'take a photo', or 'pick a file'.";
    setSpokenAlert(msg);
    speakText(msg);
  };

  // Welcome screen: greet user and listen for voice command "enter"
  useEffect(() => {
    if (!hasEntered) {
      const greeting = 'Welcome to EchoSight. Say Enter or tap anywhere to begin.';
      setSpokenAlert(greeting);

      if (!hasSpokenGreetingRef.current) {
        hasSpokenGreetingRef.current = true;
        speakText(greeting);
      }

      if (isSpeechRecognitionSupported()) {
        const isEnterWord = (text: string) =>
          /\b(enter|inter|start|begin|go|open|continue|yes|okay|surrounding|surroundings)\b/i.test(text);

        const started = startListening(
          (transcript) => {
            if (isEnterWord(transcript)) {
              handleEnter();
            }
          },
          (listening) => setIsListeningForEnter(listening),
          (err) => console.log('[Welcome] Voice recognition notice:', err),
          (interim) => {
            if (isEnterWord(interim)) {
              handleEnter();
            }
          }
        );
        if (started) {
          setIsListeningForEnter(true);
        }
      }
    }
  }, [hasEntered]);

  // Keyboard accessibility for landing gate (Enter or Space key)
  useEffect(() => {
    if (hasEntered) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleEnter();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasEntered]);

  // Spoken intro trigger for Navbar
  const speakIntro = () => {
    const intro = "EchoSight. Voice-First Spatial & Visual Co-Pilot. Say 'start surroundings' for walking guidance, 'take a photo', or 'pick a file'.";
    setSpokenAlert(intro);
    speakText(intro);
  };

  // 1. Initial Blank Landing Screen: Greet user and wait for "enter"
  if (!hasEntered) {
    return (
      <div
        onClick={handleEnter}
        className="min-h-screen bg-[var(--bg-primary)] flex flex-col items-center justify-center p-6 text-center cursor-pointer select-none"
        role="button"
        tabIndex={0}
        aria-label="Tap or press Enter to launch EchoSight Voice Assistant"
      >
        <div className="max-w-md w-full space-y-8 animate-fade-in">
          {/* Big High-Contrast Central Icon */}
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-[var(--bg-subtle)] border-2 border-[var(--border-neutral)] shadow-lg">
            <Eye className="h-12 w-12 text-[var(--accent-primary)]" aria-hidden="true" />
          </div>

          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              EchoSight
            </h1>
            <p className="text-sm font-medium text-[var(--text-secondary)]">
              Voice-First Spatial & Visual Co-Pilot
            </p>
          </div>

          {/* Action Callout Box */}
          <div className="p-5 rounded-[var(--radius-md)] border-2 border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)] shadow-sm space-y-2">
            <p className="text-base font-semibold">
              Say &quot;Enter&quot; or tap anywhere to begin
            </p>
            <p className="text-xs text-[var(--text-secondary)]">
              Press Enter or Space on keyboard • Fully voice-operated
            </p>
          </div>

          {/* Hands-Free Voice Status */}
          <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                isListeningForEnter ? 'bg-[var(--accent-primary)] animate-pulse' : 'bg-slate-400'
              }`}
            />
            <span>
              {isListeningForEnter
                ? 'Microphone listening for "Enter"'
                : 'Microphone initializing...'}
            </span>
          </div>

          {/* Accessibility Note */}
          <div className="pt-4 border-t border-[var(--border-neutral)]">
            <p className="text-xs text-[var(--text-secondary)]">
              Designed for blind & low-vision navigation • Fully voice-operated
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Main Application Page (Unified Voice Co-Pilot Workspace)
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col">
      {/* Screen reader live notification channel */}
      <div className="sr-only" role="status" aria-live="polite">
        {spokenAlert}
      </div>

      {/* Top Accessible Navbar */}
      <Navbar
        activeMode={activeMode}
        isDark={isDark}
        setIsDark={setIsDark}
        onSpeakGreeting={speakIntro}
      />

      {/* Main Content Surface (Unified Workspace) */}
      <main className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
        <UnifiedCoPilot
          isVoiceActive={isVoiceEnabled}
          setIsVoiceActive={setIsVoiceEnabled}
          onModeChange={setActiveMode}
        />
      </main>

      {/* Calm, Accessible Footer */}
      <footer className="border-t border-[var(--border-neutral)] bg-[var(--bg-surface)] px-4 py-4 mt-8">
        <div className="mx-auto max-w-4xl flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)]">
          <p>
            <strong>EchoSight</strong> — Open Source Accessibility Tool for Alexa+ Track.
          </p>
          <p>
            Free-Tier Powered • Zero Persistent Frame Retention • WCAG-AA Compliant
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
