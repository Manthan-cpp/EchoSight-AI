import { Eye, Sun, Moon, Volume2 } from 'lucide-react';

interface NavbarProps {
  currentTab: 'surroundings' | 'analysis' | 'states' | 'contrast';
  setCurrentTab: (tab: 'surroundings' | 'analysis' | 'states' | 'contrast') => void;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  onSpeakGreeting: () => void;
}

export function Navbar({
  currentTab,
  setCurrentTab,
  isDark,
  setIsDark,
  onSpeakGreeting,
}: NavbarProps) {
  return (
    <header className="border-b border-[var(--border-neutral)] bg-[var(--bg-surface)] px-4 py-3">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-neutral)] bg-[var(--bg-subtle)] text-[var(--text-primary)]">
            <Eye className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              EchoSight
            </h1>
            <p className="text-xs text-[var(--text-secondary)]">
              Voice-First Spatial & Visual Co-Pilot
            </p>
          </div>
        </div>

        {/* Navigation Tabs - Strict rectangular buttons, zero pills */}
        <nav aria-label="Main Navigation" className="flex items-center gap-1.5">
          <button
            onClick={() => setCurrentTab('surroundings')}
            className={`px-3 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] border transition-colors ${
              currentTab === 'surroundings'
                ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] border-[var(--accent-primary)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-neutral)] hover:bg-[var(--bg-subtle)]'
            }`}
            aria-current={currentTab === 'surroundings' ? 'page' : undefined}
          >
            Surroundings Mode
          </button>
          <button
            onClick={() => setCurrentTab('analysis')}
            className={`px-3 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] border transition-colors ${
              currentTab === 'analysis'
                ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] border-[var(--accent-primary)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-neutral)] hover:bg-[var(--bg-subtle)]'
            }`}
            aria-current={currentTab === 'analysis' ? 'page' : undefined}
          >
            Visual Analysis
          </button>
          <button
            onClick={() => setCurrentTab('states')}
            className={`px-3 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] border transition-colors ${
              currentTab === 'states'
                ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] border-[var(--accent-primary)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-neutral)] hover:bg-[var(--bg-subtle)]'
            }`}
            aria-current={currentTab === 'states' ? 'page' : undefined}
          >
            UI States
          </button>
          <button
            onClick={() => setCurrentTab('contrast')}
            className={`px-3 py-1.5 text-sm font-medium rounded-[var(--radius-sm)] border transition-colors ${
              currentTab === 'contrast'
                ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] border-[var(--accent-primary)]'
                : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-neutral)] hover:bg-[var(--bg-subtle)]'
            }`}
            aria-current={currentTab === 'contrast' ? 'page' : undefined}
          >
            WCAG Audit
          </button>
        </nav>

        {/* Utility Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={onSpeakGreeting}
            className="flex h-10 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            title="Play opening spoken greeting"
            aria-label="Speak welcome greeting aloud"
          >
            <Volume2 className="h-4 w-4" aria-hidden="true" />
            <span>Spoken Intro</span>
          </button>
          <button
            onClick={() => setIsDark(!isDark)}
            className="flex h-10 w-10 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
