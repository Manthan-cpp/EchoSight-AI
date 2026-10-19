import { useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { Camera, StopCircle, Play, Mic, MicOff, Info } from 'lucide-react';
import { callTool } from '../services/mcpClient';
import { speakText, stopSpeaking, startListening, stopListening, isSpeechRecognitionSupported } from '../services/speechService';

interface TranscriptItem {
  id: string;
  timestamp: string;
  text: string;
  type: 'observation' | 'followup' | 'system';
}

export function SurroundingsMode() {
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [isAnalyzingFrame, setIsAnalyzingFrame] = useState<boolean>(false);
  const [cadenceSeconds] = useState<number>(5);
  const [followupText, setFollowupText] = useState<string>('');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const intervalRef = useRef<any>(null);
  const prevFrameRef = useRef<string | null>(null);
  const priorContextRef = useRef<string>('');
  const isWatchingRef = useRef<boolean>(false);

  // Keep ref in sync for interval callbacks
  useEffect(() => {
    isWatchingRef.current = isWatching;
  }, [isWatching]);

  // Scroll transcript to bottom as updates arrive
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopWatchingInternal();
      stopListening();
      stopSpeaking();
    };
  }, []);

  const addTranscript = (text: string, type: 'observation' | 'followup' | 'system') => {
    const newItem: TranscriptItem = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text,
      type,
    };
    setTranscripts((prev) => [...prev, newItem]);
  };

  /**
   * Capture a single frame from the live video feed as base64 JPEG.
   */
  const captureFrameBase64 = (): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) return null;

    canvas.width = Math.min(640, video.videoWidth);
    canvas.height = Math.min(480, video.videoHeight);

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    return dataUrl.split(',')[1] || null;
  };

  /**
   * The 5-second cadence cycle: captures frame and calls describe_surroundings MCP tool.
   */
  const processCadenceCycle = async () => {
    if (!isWatchingRef.current) return;

    const currentFrameBase64 = captureFrameBase64();
    if (!currentFrameBase64) {
      console.log('[Surroundings] Video frame not ready yet, skipping cycle.');
      return;
    }

    try {
      setIsAnalyzingFrame(true);
      const result = await callTool('describe_surroundings', {
        image_base64: currentFrameBase64,
        mime_type: 'image/jpeg',
        prior_context: priorContextRef.current,
        prev_frame_base64: prevFrameRef.current,
      });

      if (result.isUnchanged) {
        console.log('[Surroundings] Scene is static; frame difference below threshold.');
      } else {
        priorContextRef.current = result.spokenText;
        addTranscript(result.spokenText, 'observation');
        // Speak aloud per voice-first accessibility mandate
        speakText(result.spokenText);
      }

      prevFrameRef.current = currentFrameBase64;
    } catch (err: any) {
      console.warn('[Surroundings] Cycle processing error:', err.message);
    } finally {
      setIsAnalyzingFrame(false);
    }
  };

  /**
   * Start Surroundings Mode.
   */
  const startWatching = async () => {
    setIsWatching(true);
    addTranscript('Starting Surroundings Mode. Initializing camera and voice stream...', 'system');
    speakText('Starting Surroundings Mode. Point your camera forward.');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
      }

      addTranscript('Camera active. Analyzing surroundings every 5 seconds.', 'system');

      // Run initial check after 1.5 seconds, then every 5 seconds
      setTimeout(processCadenceCycle, 1500);
      intervalRef.current = setInterval(processCadenceCycle, cadenceSeconds * 1000);
    } catch (err: any) {
      console.warn('[Surroundings] Camera error:', err);
      setIsCameraActive(false);
      addTranscript(
        'Camera permission was not granted or camera is busy. Please allow camera access in your browser.',
        'system'
      );
      speakText('Camera permission not granted. Please allow camera access.');
      setIsWatching(false);
    }
  };

  /**
   * Stop Surroundings Mode cleanly.
   */
  const stopWatchingInternal = () => {
    setIsWatching(false);
    setIsCameraActive(false);
    setIsAnalyzingFrame(false);

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }

    prevFrameRef.current = null;
    stopSpeaking();
  };

  const stopWatching = () => {
    stopWatchingInternal();
    addTranscript('Surroundings Mode stopped. Camera disconnected.', 'system');
    speakText('Watching stopped.');
  };

  const toggleWatching = () => {
    if (isWatching) {
      stopWatching();
    } else {
      startWatching();
    }
  };

  /**
   * Handle Voice Recognition Commands.
   */
  const handleVoiceCommand = async (command: string) => {
    const lower = command.toLowerCase();
    addTranscript(`Heard voice command: "${command}"`, 'followup');

    // Check for control triggers
    if (lower.includes('stop') || lower.includes("that's enough") || lower.includes('pause')) {
      stopWatching();
      return;
    }

    if (lower.includes('start surroundings') || lower.includes('describe surroundings') || lower.includes('start watching')) {
      if (!isWatching) {
        startWatching();
      }
      return;
    }

    // Otherwise, treat as an interrupting follow-up question
    stopSpeaking();
    addTranscript(`Asking: "${command}"...`, 'system');

    try {
      const currentFrame = captureFrameBase64();
      const result = await callTool('ask_followup', {
        question: command,
        prior_context: priorContextRef.current,
        image_base64: currentFrame || undefined,
        mime_type: currentFrame ? 'image/jpeg' : undefined,
      });

      addTranscript(result.spokenText, 'observation');
      speakText(result.spokenText);
    } catch (err: any) {
      addTranscript(`Could not resolve question: ${err.message}`, 'system');
      speakText('Sorry, I had trouble answering that.');
    }
  };

  const toggleVoiceControl = () => {
    if (isVoiceActive) {
      stopListening(setIsVoiceActive);
      speakText('Voice control paused.');
    } else {
      const started = startListening(
        (transcript) => handleVoiceCommand(transcript),
        setIsVoiceActive,
        (err) => addTranscript(err, 'system')
      );
      if (started) {
        speakText('Voice control active. You can speak commands or questions.');
      }
    }
  };

  /**
   * Handle text follow-up submit.
   */
  const handleFollowupSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!followupText.trim()) return;

    const question = followupText.trim();
    setFollowupText('');
    addTranscript(`You asked: "${question}"`, 'followup');
    stopSpeaking();

    try {
      const currentFrame = captureFrameBase64();
      const result = await callTool('ask_followup', {
        question,
        prior_context: priorContextRef.current,
        image_base64: currentFrame || undefined,
        mime_type: currentFrame ? 'image/jpeg' : undefined,
      });

      addTranscript(result.spokenText, 'observation');
      speakText(result.spokenText);
    } catch (err: any) {
      addTranscript(`Could not resolve question: ${err.message}`, 'system');
      speakText('Sorry, I had trouble answering that.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden Canvas for Frame Capture */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />

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

          {/* Status Badge - Rectangular, calm, zero neon */}
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
            <span>{isWatching ? (isAnalyzingFrame ? 'Analyzing' : 'Watching') : 'Ready'}</span>
          </div>
        </div>

        {/* Camera Viewfinder Area */}
        <div className="relative aspect-video w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-neutral)] bg-[var(--bg-subtle)] flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`h-full w-full object-cover ${isCameraActive ? 'block' : 'hidden'}`}
            aria-label="Live camera viewfinder"
          />

          {!isCameraActive && (
            <div className="text-center p-6 space-y-2">
              <Camera className="mx-auto h-10 w-10 text-[var(--text-secondary)]" aria-hidden="true" />
              <p className="text-sm font-medium text-[var(--text-primary)]">
                Camera Inactive
              </p>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm">
                Press Start Surroundings Mode below to initiate real-time camera description.
              </p>
            </div>
          )}

          {/* Overlay Status Line */}
          {isWatching && (
            <div className="absolute bottom-3 left-3 right-3 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] p-2.5 shadow-sm text-xs text-[var(--text-primary)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-[2px] bg-[var(--accent-primary)]" aria-hidden="true" />
                <span className="font-medium">Cadence: ~{cadenceSeconds}s Loop</span>
              </div>
              <span className="text-[var(--text-secondary)]">
                {isAnalyzingFrame ? 'Reasoning...' : 'Connected to MCP Server'}
              </span>
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

          {/* Hands-Free Voice Control Button */}
          {isSpeechRecognitionSupported() && (
            <button
              onClick={toggleVoiceControl}
              className={`btn-secondary flex-1 sm:flex-none ${
                isVoiceActive
                  ? 'border-[var(--status-listening-border)] bg-[var(--status-listening-bg)] text-[var(--status-listening-text)] font-semibold'
                  : ''
              }`}
              aria-pressed={isVoiceActive}
              aria-label={isVoiceActive ? 'Disable hands-free voice control' : 'Enable hands-free voice control'}
            >
              {isVoiceActive ? (
                <>
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  <span>Voice Control: Active</span>
                </>
              ) : (
                <>
                  <MicOff className="h-4 w-4" aria-hidden="true" />
                  <span>Enable Voice Commands</span>
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {/* Live Description Transcript */}
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
              Press Start Surroundings Mode above. As the camera views your space, spoken descriptions will stream here in real-time.
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
                      ? 'EchoSight Spoken'
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

        {/* Follow-up question form */}
        <form onSubmit={handleFollowupSubmit} className="pt-2 flex gap-2">
          <label htmlFor="followup-input" className="sr-only">
            Ask follow-up question about current view
          </label>
          <input
            id="followup-input"
            type="text"
            value={followupText}
            onChange={(e) => setFollowupText(e.target.value)}
            placeholder="Ask a follow-up (e.g. 'What is to my right?', 'Are there any hazards?')"
            className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
          />
          <button
            type="submit"
            className="btn-secondary whitespace-nowrap text-xs font-semibold"
            disabled={!followupText.trim()}
          >
            Ask
          </button>
        </form>
      </section>

      {/* Constraints Notice */}
      <section aria-labelledby="spec-heading" className="card border-l-4 border-l-[var(--accent-primary)] bg-[var(--bg-surface)]">
        <h4 id="spec-heading" className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)] mb-1">
          Alexa+ Voice Client Operational Guarantee
        </h4>
        <p className="text-xs text-[var(--text-secondary)]">
          Runs on a strictly paced 5-second loop (~12 calls/min). In-memory frame change detection prevents redundant calls when the camera is stationary. Frames are never written to disk or stored beyond the active session.
        </p>
      </section>
    </div>
  );
}
