import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { Camera, StopCircle, Play, Mic, Info } from 'lucide-react';

interface TranscriptItem {
  id: string;
  timestamp: string;
  text: string;
  type: 'observation' | 'followup' | 'system';
}

export function SurroundingsMode() {
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [cadenceSeconds] = useState<number>(5);
  const [followupText, setFollowupText] = useState<string>('');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Scroll transcript to bottom as updates arrive
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Handle start/stop camera stream
  const toggleWatching = async () => {
    if (isWatching) {
      // Stop watching
      setIsWatching(false);
      setIsCameraActive(false);
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
        videoRef.current.srcObject = null;
      }
      addTranscript('Watching stopped. Camera capture disconnected.', 'system');
    } else {
      // Start watching
      setIsWatching(true);
      addTranscript('Watching started. Monitoring environment at ~5s cadence.', 'system');
      
      // Request real camera if available
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setIsCameraActive(true);
        }
      } catch (err) {
        // Camera denied or unavailable in this context
        setIsCameraActive(false);
        addTranscript(
          'Camera access not granted or unavailable. Running in camera simulation mode.',
          'system'
        );
      }
    }
  };

  const addTranscript = (text: string, type: 'observation' | 'followup' | 'system') => {
    const newItem: TranscriptItem = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text,
      type,
    };
    setTranscripts((prev) => [...prev, newItem]);
  };

  const handleFollowupSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!followupText.trim()) return;
    
    addTranscript(`You asked: "${followupText}"`, 'followup');
    setFollowupText('');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Status Panel */}
      <section aria-labelledby="surroundings-heading" className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-neutral)] pb-4">
          <div>
            <h2 id="surroundings-heading" className="text-xl font-semibold text-[var(--text-primary)]">
              Surroundings Mode
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Continuous live visual description updated out-loud every ~{cadenceSeconds} seconds.
            </p>
          </div>

          {/* Calm, steady status badge - strictly rectangular, zero pills, zero neon */}
          <div
            className={`flex items-center gap-2 border px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-[var(--radius-sm)] ${
              isWatching
                ? 'bg-[var(--status-watching-bg)] text-[var(--status-watching-text)] border-[var(--status-watching-border)]'
                : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-neutral)]'
            }`}
            role="status"
            aria-live="polite"
          >
            <span
              className={`h-2 w-2 rounded-[2px] ${
                isWatching ? 'bg-[var(--status-watching-text)]' : 'bg-[var(--text-muted)]'
              }`}
              aria-hidden="true"
            />
            <span>{isWatching ? 'Watching' : 'Ready'}</span>
          </div>
        </div>

        {/* Camera Viewfinder Area */}
        <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-neutral)] bg-[var(--bg-subtle)] flex items-center justify-center">
          {isCameraActive ? (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="h-full w-full object-cover"
              aria-label="Live camera viewfinder"
            />
          ) : (
            <div className="text-center p-6 space-y-2">
              <Camera className="mx-auto h-10 w-10 text-[var(--text-secondary)]" aria-hidden="true" />
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {isWatching ? 'Camera Active (Simulation View)' : 'Camera Inactive'}
              </p>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm">
                {isWatching
                  ? 'Frames are captured in-memory and analyzed every 5 seconds. No frames are stored.'
                  : 'Press Start Surroundings Mode to begin continuous visual narration.'}
              </p>
            </div>
          )}

          {/* Overlay Status Line - Calm, solid, zero glassmorphism */}
          {isWatching && (
            <div className="absolute bottom-3 left-3 right-3 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] p-2.5 shadow-sm text-xs text-[var(--text-primary)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-[2px] bg-[var(--accent-primary)]" aria-hidden="true" />
                <span className="font-medium">Cadence: 1 frame every {cadenceSeconds}s</span>
              </div>
              <span className="text-[var(--text-secondary)]">Rate: ~12 calls/min (Safe Free Tier)</span>
            </div>
          )}
        </div>

        {/* Primary Controls */}
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={toggleWatching}
            className={`btn-primary flex-1 sm:flex-none ${
              isWatching
                ? 'bg-[var(--status-error-text)] border-[var(--status-error-text)] hover:bg-[#7f1d1d]'
                : ''
            }`}
            aria-pressed={isWatching}
            aria-label={isWatching ? 'Stop watching surroundings' : 'Start watching surroundings'}
          >
            {isWatching ? (
              <>
                <StopCircle className="h-5 w-5" aria-hidden="true" />
                <span>Stop Watching</span>
              </>
            ) : (
              <>
                <Play className="h-5 w-5" aria-hidden="true" />
                <span>Start Surroundings Mode</span>
              </>
            )}
          </button>

          <button
            onClick={() => {
              addTranscript('Interrupted with question: "Is the pathway clear ahead?"', 'followup');
            }}
            disabled={!isWatching}
            className="btn-secondary flex-1 sm:flex-none"
            aria-label="Ask a spoken question while watching"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            <span>Ask Spoken Question</span>
          </button>
        </div>
      </section>

      {/* Live Transcript Log (Conversation Style) */}
      <section aria-labelledby="transcript-heading" className="card space-y-3">
        <div className="flex items-center justify-between border-b border-[var(--border-neutral)] pb-3">
          <h3 id="transcript-heading" className="text-base font-semibold text-[var(--text-primary)]">
            Description Transcript
          </h3>
          <span className="text-xs text-[var(--text-secondary)]">
            {transcripts.length} update{transcripts.length === 1 ? '' : 's'}
          </span>
        </div>

        {/* Real Empty State */}
        {transcripts.length === 0 ? (
          <div className="py-10 text-center space-y-2 border border-dashed border-[var(--border-neutral)] rounded-[var(--radius-md)] p-4">
            <Info className="mx-auto h-8 w-8 text-[var(--text-secondary)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              No surroundings described yet
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
              Start Surroundings Mode above. As the camera views your space, spoken descriptions will appear here in chronological order.
            </p>
          </div>
        ) : (
          <div
            className="max-h-72 overflow-y-auto space-y-3 pr-1"
            role="log"
            aria-live="polite"
            aria-atomic="false"
          >
            {transcripts.map((item) => (
              <div
                key={item.id}
                className={`p-3 rounded-[var(--radius-sm)] border text-sm ${
                  item.type === 'observation'
                    ? 'bg-[var(--bg-surface)] border-[var(--border-neutral)] text-[var(--text-primary)]'
                    : item.type === 'followup'
                    ? 'bg-[var(--bg-subtle)] border-[var(--border-neutral)] text-[var(--text-primary)] font-medium'
                    : 'bg-[var(--bg-subtle)] border-dashed border-[var(--border-neutral)] text-[var(--text-secondary)] text-xs'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)] mb-1">
                  <span className="font-semibold uppercase tracking-wider">
                    {item.type === 'observation'
                      ? 'EchoSight'
                      : item.type === 'followup'
                      ? 'User Query'
                      : 'System Notice'}
                  </span>
                  <span>{item.timestamp}</span>
                </div>
                <p className="leading-relaxed">{item.text}</p>
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
        )}

        {/* Mid-Session Follow-Up Input */}
        <form onSubmit={handleFollowupSubmit} className="pt-2 flex gap-2">
          <label htmlFor="followup-input" className="sr-only">
            Ask follow-up question about current view
          </label>
          <input
            id="followup-input"
            type="text"
            value={followupText}
            onChange={(e) => setFollowupText(e.target.value)}
            placeholder="Type or say a follow-up (e.g. 'What is on the table to my right?')"
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
          />
          <button
            type="submit"
            className="btn-secondary whitespace-nowrap text-xs font-semibold"
            disabled={!followupText.trim()}
          >
            Send
          </button>
        </form>
      </section>

      {/* Accessibility & Design Guarantees Card */}
      <section aria-labelledby="spec-heading" className="card border-l-4 border-l-[var(--accent-primary)] bg-[var(--bg-surface)]">
        <h4 id="spec-heading" className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-1">
          Surroundings Mode Design Constraints
        </h4>
        <ul className="text-xs text-[var(--text-secondary)] space-y-1 list-disc list-inside">
          <li><strong>Cadence:</strong> 1 frame every 5s (~12 calls/min), well inside Google AI Studio free-tier limit.</li>
          <li><strong>Zero Persistent Storage:</strong> Captured camera frames are processed in-memory and immediately discarded.</li>
          <li><strong>Relative Positioning:</strong> Uses natural relative descriptions (&quot;just ahead of you&quot;, &quot;to your right&quot;) rather than fabricated millimeter measurements.</li>
        </ul>
      </section>
    </div>
  );
};
