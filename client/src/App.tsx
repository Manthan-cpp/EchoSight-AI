import { useState, useEffect, useRef } from 'react';
import { Volume2 } from 'lucide-react';
import { Navbar } from './components/Navbar';
import { UnifiedCoPilot, type WorkspaceMode } from './components/UnifiedCoPilot';
import {
  speakText,
  stopSpeaking,
  startListening,
  stopListening,
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
  const bgVideoRef = useRef<HTMLVideoElement>(null);

  // Ensure muted looping playback for background video across all screens
  useEffect(() => {
    if (bgVideoRef.current) {
      bgVideoRef.current.defaultMuted = true;
      bgVideoRef.current.muted = true;
      bgVideoRef.current.play().catch(() => {});
    }
  }, []);

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
        const isEnterWord = (text: string) => {
          const clean = text.toLowerCase().trim();
          return (
            /\b(enter|inter|into|intro|center|winter|entire|inner|in|start|begin|go|open|launch|hello|hi|hey|echo|echosight|yes|yeah|yep|sure|okay|ok|continue|ready|come in|surroundings?)\b/i.test(clean) ||
            clean.length >= 2
          );
        };

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
        return () => {
          stopListening();
        };
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

  return (
    <div className="relative min-h-screen bg-black text-white flex flex-col overflow-x-clip isolate">
      {/* Fullscreen Looping Landscape Background Video - Pupil Dead-Centered & Flush Edge-to-Edge */}
      <video
        ref={bgVideoRef}
        autoPlay
        loop
        muted
        playsInline
        poster="/intro-bg-poster.jpg"
        className="fixed inset-0 w-full h-full object-cover object-center pointer-events-none select-none z-0"
        src="/intro-bg.mp4"
      >
        <source src="/intro-bg.mp4" type="video/mp4" />
      </video>

      {/* Ambient Dark Scrim Overlay */}
      <div
        className="fixed inset-0 bg-black/20 z-[1] pointer-events-none"
        aria-hidden="true"
      />

      {/* Screen reader live notification channel */}
      <div className="sr-only" role="status" aria-live="polite">
        {spokenAlert}
      </div>

      {!hasEntered ? (
        /* 1. Initial Blank Landing Screen: Greet user and wait for "enter" */
        <div
          onClick={handleEnter}
          className="relative z-10 min-h-screen flex flex-col items-center justify-center p-6 text-center cursor-pointer select-none"
          role="button"
          tabIndex={0}
          aria-label="Tap or press Enter to launch EchoSight Voice Assistant"
        >
          {/* Top-Left EchoSight Logo (No Background) */}
          <div className="absolute top-6 left-6 z-20 flex items-center">
            <img
              src="/logo.png"
              alt="EchoSight Logo"
              className="h-8 md:h-10 w-auto object-contain drop-shadow-md"
            />
          </div>

          {/* Central Glassmorphic Frosted Glass Panel (No Inner Borders, Normal Monochrome) */}
          <div
            className="card relative z-10 max-w-lg w-full p-8 md:p-12 rounded-[36px] animate-fade-in flex flex-col items-center text-center space-y-8 transition-all"
            style={{
              background:
                'linear-gradient(135deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.02) 100%)',
              backdropFilter: 'blur(8px) saturate(120%)',
              WebkitBackdropFilter: 'blur(8px) saturate(120%)',
              border: '0.5px solid rgba(255, 255, 255, 0.14)',
              boxShadow: '0 16px 36px rgba(0, 0, 0, 0.25)',
            }}
          >
            {/* Top Tagline Pill */}
            <div className="glass-pill inline-flex items-center px-4 py-1.5 text-xs text-white/90 tracking-widest uppercase">
              Voice-First Spatial & Visual Co-Pilot
            </div>

            {/* Action Callout Section */}
            <div className="space-y-2.5">
              <h1 className="text-2xl md:text-3xl font-light tracking-tight text-white drop-shadow-sm">
                Say <span className="font-extrabold text-white">&quot;Enter&quot;</span> or tap anywhere to begin
              </h1>
              <p className="text-xs md:text-sm text-white/80 font-normal">
                Press Enter or Space on keyboard • Fully voice-operated
              </p>
            </div>

            {/* Spoken Introduction Button */}
            <div className="flex items-center justify-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  speakIntro();
                }}
                className="btn-secondary px-6 py-2.5 text-xs md:text-sm font-medium text-white flex items-center gap-2.5 cursor-pointer"
                title="Play spoken introduction"
                aria-label="Play spoken introduction aloud"
              >
                <Volume2 className="h-4 w-4 text-white" aria-hidden="true" />
                <span>Spoken Intro</span>
              </button>
            </div>

            {/* Status / Accessibility Info (Zero Inner Border Lines) */}
            <div className="w-full pt-4 flex flex-col items-center space-y-3">
              {/* Hands-Free Voice Status */}
              <div className="inline-flex items-center justify-center gap-2.5 text-xs text-white/90">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isListeningForEnter
                      ? 'bg-white animate-pulse shadow-[0_0_8px_rgba(255,255,255,0.7)]'
                      : 'bg-white/40'
                  }`}
                />
                <span>
                  {isListeningForEnter
                    ? 'Microphone listening for "Enter"'
                    : 'Microphone initializing...'}
                </span>
              </div>

              {/* Accessibility Note */}
              <p className="text-xs text-white/70 font-normal">
                Designed for blind & low-vision navigation • Fully voice-operated
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* 2. Main Application Page (Unified Voice Co-Pilot Workspace) */
        <div className="relative z-10 flex-1 flex flex-col min-h-screen">
          {/* Top Accessible Navbar */}
          <Navbar
            activeMode={activeMode}
            isDark={isDark}
            setIsDark={setIsDark}
            onSpeakGreeting={speakIntro}
          />

          {/* Main Content Surface (Unified Workspace) */}
          <main className="flex-1 px-4 py-8 max-w-4xl mx-auto w-full">
            <UnifiedCoPilot
              isVoiceActive={isVoiceEnabled}
              setIsVoiceActive={setIsVoiceEnabled}
              onModeChange={setActiveMode}
            />
          </main>

          {/* Calm, Accessible Glass Footer */}
          <footer className="border-t border-white/10 bg-white/[0.02] backdrop-blur-[8px] px-4 py-4 mt-8">
            <div className="mx-auto max-w-4xl flex flex-wrap items-center justify-between gap-3 text-xs text-white/75">
              <p>
                <strong>EchoSight</strong> — Open Source Accessibility Tool for Alexa+ Track.
              </p>
              <p>
                Free-Tier Powered • Zero Persistent Frame Retention • WCAG-AA Compliant
              </p>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
}

export default App;
