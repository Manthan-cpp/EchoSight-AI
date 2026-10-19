import { useState } from 'react';
import { Eye, Mic, RefreshCw, AlertCircle, Inbox } from 'lucide-react';

type StateCategory = 'watching' | 'listening' | 'thinking' | 'error' | 'empty';

export function StatesPreview() {
  const [activeState, setActiveState] = useState<StateCategory>('watching');

  return (
    <div className="space-y-6">
      <section aria-labelledby="states-preview-heading" className="card space-y-4">
        <div className="border-b border-[var(--border-neutral)] pb-4">
          <h2 id="states-preview-heading" className="text-xl font-semibold text-[var(--text-primary)]">
            UI Interaction States Gallery
          </h2>
          <p className="text-sm text-[var(--text-secondary)]">
            Every core interface state designed strictly to the constraints of DESIGN.md: calm, restrained, high-contrast, zero AI clichés.
          </p>
        </div>

        {/* State Selection Bar - Strictly rectangular */}
        <div role="tablist" aria-label="UI States" className="flex flex-wrap gap-2">
          {(
            [
              { id: 'watching', label: '1. Watching State' },
              { id: 'listening', label: '2. Listening State' },
              { id: 'thinking', label: '3. Thinking State' },
              { id: 'error', label: '4. Error State' },
              { id: 'empty', label: '5. Empty State' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={activeState === item.id}
              onClick={() => setActiveState(item.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-sm)] border transition-colors ${
                activeState === item.id
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] border-[var(--accent-primary)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-neutral)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Interactive State Demonstration Surface */}
        <div className="p-6 border border-[var(--border-neutral)] rounded-[var(--radius-md)] bg-[var(--bg-subtle)] min-h-[300px] flex items-center justify-center">
          {/* 1. Watching State */}
          {activeState === 'watching' && (
            <div className="w-full max-w-md space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] border border-[var(--status-watching-border)] bg-[var(--status-watching-bg)] text-[var(--status-watching-text)]">
                <Eye className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--status-watching-border)] bg-[var(--status-watching-bg)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--status-watching-text)]">
                  <span className="h-2 w-2 rounded-[2px] bg-[var(--status-watching-text)]" />
                  <span>Watching</span>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Continuous Spatial Monitoring Active
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Inspecting environment at a steady 5-second cadence (~12 requests/min). Solid indicators only—no pulsing waveforms, neon outlines, or dramatic scanning lasers.
                </p>
              </div>
            </div>
          )}

          {/* 2. Listening State */}
          {activeState === 'listening' && (
            <div className="w-full max-w-md space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] border border-[var(--status-listening-border)] bg-[var(--status-listening-bg)] text-[var(--status-listening-text)]">
                <Mic className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--status-listening-border)] bg-[var(--status-listening-bg)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--status-listening-text)]">
                  <span className="h-2 w-2 rounded-[2px] bg-[var(--status-listening-text)]" />
                  <span>Listening</span>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Waiting for Spoken User Query
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Calm, steady visual. No flashy audio spectrum analyzers competing for cognitive attention. The user can speak naturally or ask follow-ups.
                </p>
              </div>
            </div>
          )}

          {/* 3. Thinking / Analyzing State */}
          {activeState === 'thinking' && (
            <div className="w-full max-w-md space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] border border-[var(--status-thinking-border)] bg-[var(--status-thinking-bg)] text-[var(--status-thinking-text)]">
                <RefreshCw className="h-7 w-7 animate-spin" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--status-thinking-border)] bg-[var(--status-thinking-bg)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--status-thinking-text)]">
                  <span>Analyzing</span>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Reasoning Over Multimodal Input
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Honest, straightforward status label. No cartoon animations or spinning stars pretending to be magic.
                </p>
              </div>
            </div>
          )}

          {/* 4. Error State */}
          {activeState === 'error' && (
            <div className="w-full max-w-md space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] text-[var(--status-error-text)]">
                <AlertCircle className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--status-error-border)] bg-[var(--status-error-bg)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--status-error-text)]">
                  <span>Input Guidance</span>
                </div>
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  Photo Too Blurry for High Confidence
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Plain-language guidance explaining exactly what happened and what to do next. Styled calmly, not alarm-red and aggressive.
                </p>
              </div>
              <button
                className="btn-secondary text-xs"
                onClick={() => alert('Retake camera frame requested')}
              >
                Retake Photo with Better Lighting
              </button>
            </div>
          )}

          {/* 5. Empty State */}
          {activeState === 'empty' && (
            <div className="w-full max-w-md space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                <Inbox className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">
                  No Active Session
                </h3>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  Welcome to EchoSight. Tap anywhere on the screen or just speak: &quot;Start Surroundings Mode&quot; or &quot;Describe what I am holding&quot;.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Banned vs Allowed Rules Reference */}
        <div className="p-4 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] text-xs text-[var(--text-secondary)] space-y-2">
          <p className="font-semibold text-[var(--text-primary)] uppercase tracking-wider">
            Verification Against DESIGN.md Section 2 (Strictly Banned Patterns):
          </p>
          <div className="grid sm:grid-cols-2 gap-2">
            <div>
              <p className="font-medium text-[var(--status-error-text)]">❌ Prohibited:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                <li>Zero pill shapes (buttons, tags, badges)</li>
                <li>Zero neon or glowing borders</li>
                <li>Zero gradient-filled headline text</li>
                <li>Zero decorative emojis</li>
                <li>Zero glowing orb avatars or pulsing waveforms</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-[var(--status-listening-text)]">✓ Implemented:</p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                <li>Strict 4–8px rectangular borders</li>
                <li>Solid 2px high-contrast focus rings</li>
                <li>1 neutral scale + 1 calm accent color</li>
                <li>WCAG-AA verified contrast (all &gt; 4.5:1)</li>
                <li>Generous whitespace and legible typography</li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
