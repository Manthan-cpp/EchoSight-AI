import { useState, useEffect, useRef } from 'react';
import { Eye } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { SurroundingsMode } from './components/SurroundingsMode';
import { VisualAnalysis } from './components/VisualAnalysis';
import {
  speakText,
  stopSpeaking,
  startListening,
  stopListening,
  isSpeechRecognitionSupported,
} from './services/speechService';

export function App() {
  const [hasEntered, setHasEntered] = useState<boolean>(false);
  const [isListeningForEnter, setIsListeningForEnter] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<'surroundings' | 'analysis'>('surroundings');
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
    setHasEntered(true);
    stopSpeaking();
    stopListening();
    setCurrentTab('surroundings');
    const msg = 'Entering Surroundings Mode.';
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
        const started = startListening(
          (transcript) => {
            const lower = transcript.toLowerCase().trim();
            if (
              lower.includes('enter') ||
              lower.includes('start') ||
              lower.includes('open') ||
              lower.includes('go') ||
              lower.includes('continue')
            ) {
              handleEnter();
            }
          },
          (listening) => setIsListeningForEnter(listening),
          (err) => console.log('[Welcome] Voice recognition notice:', err),
          (interim) => {
            const lower = interim.toLowerCase().trim();
            if (lower.includes('enter')) {
              handleEnter();
            }
          }
        );
        if (started) {
          setIsListeningForEnter(true);
        }
      }
    }

    return () => {
      stopListening();
    };
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
    const intro = 'EchoSight. Voice-First Spatial and Visual Co-Pilot. You are in Surroundings Mode. Say Start Surroundings to begin.';
    setSpokenAlert(intro);
    speakText(intro);
  };

  // 1. Initial Blank Landing Screen: Greet user and wait for "enter"
  if (!hasEntered) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleEnter}
        aria-label="Welcome screen. Say Enter or tap anywhere to begin."
        className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col items-center justify-center p-8 cursor-pointer select-none text-center outline-none focus:ring-4 focus:ring-[var(--focus-ring)] transition-colors"
      >
        {/* Screen reader live notification channel */}
        <div className="sr-only" role="status" aria-live="polite">
          {spokenAlert}
        </div>

        <div className="max-w-md space-y-6">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] text-[var(--text-primary)]">
            <Eye className="h-8 w-8" aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              EchoSight
            </h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Voice-First Spatial & Visual Co-Pilot
            </p>
          </div>

          <div className="pt-4 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] shadow-sm">
              {isListeningForEnter ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                  <span>Listening... Say <strong>"Enter"</strong> or tap anywhere</span>
                </>
              ) : (
                <span>Tap anywhere or press Enter to begin</span>
              )}
            </div>

            <p className="text-xs text-[var(--text-secondary)]">
              Designed for blind & low-vision navigation • Fully voice-operated
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Main Application Page (Surroundings Mode & Visual Analysis)
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] flex flex-col">
      {/* Screen reader live notification channel */}
      <div className="sr-only" role="status" aria-live="polite">
        {spokenAlert}
      </div>

      {/* Top Accessible Navbar */}
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        isDark={isDark}
        setIsDark={setIsDark}
        onSpeakGreeting={speakIntro}
      />

      {/* Main Content Surface */}
      <main className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
        {currentTab === 'surroundings' && <SurroundingsMode />}
        {currentTab === 'analysis' && <VisualAnalysis />}
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
