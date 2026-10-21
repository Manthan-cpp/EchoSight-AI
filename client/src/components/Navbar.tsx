import { Sun, Moon } from 'lucide-react';
import type { WorkspaceMode } from './UnifiedCoPilot';

interface NavbarProps {
  activeMode?: WorkspaceMode;
  isDark: boolean;
  setIsDark: (dark: boolean) => void;
  onSpeakGreeting?: () => void;
}

export function Navbar({
  isDark,
  setIsDark,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-40 px-5 py-3.5">
      {/* Background with subtle top shading fading seamlessly at bottom */}
      <div
        className="absolute inset-x-0 top-0 -bottom-4 pointer-events-none -z-10"
        style={{
          background:
            'linear-gradient(to bottom, rgba(0, 0, 0, 0.6) 0%, rgba(0, 0, 0, 0.25) 60%, rgba(0, 0, 0, 0) 100%)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          maskImage:
            'linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.75) 60%, rgba(0, 0, 0, 0) 100%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, rgba(0, 0, 0, 1) 0%, rgba(0, 0, 0, 0.75) 60%, rgba(0, 0, 0, 0) 100%)',
        }}
      />
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        {/* Brand with Official Logo */}
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="EchoSight Logo"
            className="h-8 sm:h-9 w-auto object-contain drop-shadow-md"
          />
          <div className="hidden sm:block pl-2">
            <p className="text-xs text-white/85 font-medium tracking-wide">
              Voice-First Spatial & Visual Co-Pilot
            </p>
          </div>
        </div>

        {/* Utility Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsDark(!isDark)}
            className="glass-pill flex h-10 w-10 items-center justify-center text-white cursor-pointer"
            aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? (
              <Sun className="h-4 w-4 text-white" aria-hidden="true" />
            ) : (
              <Moon className="h-4 w-4 text-white" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
