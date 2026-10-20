import { Eye, Sun, Moon, Volume2, Radio } from 'lucide-react';
import type { WorkspaceMode } from './UnifiedCoPilot';

interface NavbarProps {
  activeMode?: WorkspaceMode;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  onSpeakGreeting: () => void;
}

export function Navbar({
  activeMode = 'standby',
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

        {/* Unified Mode HUD Status Badge */}
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1 text-xs font-semibold rounded-[var(--radius-sm)] border flex items-center gap-2 transition-colors ${
              activeMode === 'radar'
                ? 'bg-[var(--status-listening-bg)] text-[var(--status-listening-text)] border-[var(--status-listening-border)]'
                : activeMode === 'inspection'
                ? 'bg-[var(--bg-subtle)] text-[var(--accent-primary)] border-[var(--accent-primary)]'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-neutral)]'
            }`}
            role="status"
          >
            <Radio
              className={`h-3.5 w-3.5 ${
                activeMode === 'radar' ? 'animate-pulse text-emerald-500' : ''
              }`}
            />
            <span>
              {activeMode === 'radar'
                ? 'Walking Radar'
                : activeMode === 'inspection'
                ? 'Snapshot Inspection'
                : 'Unified Workspace'}
            </span>
          </div>
        </div>

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
}
