import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { SurroundingsMode } from './components/SurroundingsMode';
import { VisualAnalysis } from './components/VisualAnalysis';

export function App() {
  const [currentTab, setCurrentTab] = useState<'surroundings' | 'analysis'>('surroundings');
  const [isDark, setIsDark] = useState<boolean>(false);
  const [spokenAlert, setSpokenAlert] = useState<string>('');

  // Synchronize data-theme on document root
  useEffect(() => {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }, [isDark]);

  // Voice greeting function per ACCESSIBILITY.md Section 2
  const speakGreeting = () => {
    const greeting = 'Welcome to EchoSight. Tap anywhere or just start talking.';
    setSpokenAlert(greeting);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(greeting);
      utterance.rate = 0.95; // Steady, calm pace
      window.speechSynthesis.speak(utterance);
    }
  };

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
        onSpeakGreeting={speakGreeting}
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
