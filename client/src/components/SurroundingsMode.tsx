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

interface SurroundingsModeProps {
  isVoiceActive?: boolean;
  setIsVoiceActive?: (active: boolean) => void;
  onNavigateTab?: (tab: 'surroundings' | 'analysis') => void;
}

export function SurroundingsMode({
  isVoiceActive: isVoiceProp,
  setIsVoiceActive: setIsVoiceProp,
  onNavigateTab,
}: SurroundingsModeProps = {}) {
  const [isWatching, setIsWatching] = useState<boolean>(false);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [localVoiceActive, setLocalVoiceActive] = useState<boolean>(isVoiceProp ?? true);
  const isVoiceActive = isVoiceProp !== undefined ? isVoiceProp : localVoiceActive;
  const updateVoiceActive = (active: boolean) => {
    setLocalVoiceActive(active);
    setIsVoiceProp?.(active);
  };
  const [isAnalyzingFrame, setIsAnalyzingFrame] = useState<boolean>(false);
  const [cadenceSeconds] = useState<number>(5);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);
  const [followupText, setFollowupText] = useState<string>('');
  const [interimSpeech, setInterimSpeech] = useState<string>('');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);

  const MAX_SESSION_SECONDS = 300; // 5-minute maximum continuous session safety bound
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  // Synchronization and concurrency locks
  const isWatchingRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const sessionIdRef = useRef<number>(0);
  const cadenceTimerRef = useRef<any>(null);
  const sessionTimerRef = useRef<any>(null);
  const prevFrameRef = useRef<string | null>(null);
  const priorContextRef = useRef<string>('');

  // Keep ref in sync for callbacks
  useEffect(() => {
    isWatchingRef.current = isWatching;
  }, [isWatching]);

  // Synchronize continuous voice listening enabled by default
  useEffect(() => {
    if (isVoiceActive && isSpeechRecognitionSupported()) {
      startListening(
        (transcript) => handleVoiceCommand(transcript),
        undefined,
        (err) => addTranscript(err, 'system'),
        (interim) => setInterimSpeech(interim)
      );
    } else {
      stopListening();
      setInterimSpeech('');
    }
  }, [isVoiceActive]);

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
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
   * Wait for video stream to actually render non-zero pixels.
   */
  const waitForCameraReady = (maxWaitMs = 3000): Promise<boolean> => {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = () => {
        if (!isWatchingRef.current) {
          resolve(false);
          return;
        }
        if (videoRef.current && videoRef.current.videoWidth > 0 && videoRef.current.videoHeight > 0) {
          resolve(true);
        } else if (Date.now() - startTime > maxWaitMs) {
          resolve(false);
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  };

  /**
   * The sequential cadence loop: guarantees zero concurrent calls to Gemini.
   * Only schedules the next call 5 seconds AFTER the current call completely finishes.
   */
  const processCadenceCycle = async (currentSessionId: number) => {
    // Session validation guards
    if (!isWatchingRef.current || currentSessionId !== sessionIdRef.current) {
      return;
    }

    // Concurrency lock: If a follow-up or another cycle is active, recheck in 1s
    if (isProcessingRef.current) {
      cadenceTimerRef.current = setTimeout(() => processCadenceCycle(currentSessionId), 1000);
      return;
    }

    const currentFrameBase64 = captureFrameBase64();
    if (!currentFrameBase64) {
      console.log('[Surroundings] Video frame not ready yet, retrying in 400ms.');
      cadenceTimerRef.current = setTimeout(() => processCadenceCycle(currentSessionId), 400);
      return;
    }

    try {
      isProcessingRef.current = true;
      setIsAnalyzingFrame(true);

      const result = await callTool('describe_surroundings', {
        image_base64: currentFrameBase64,
        mime_type: 'image/jpeg',
        prior_context: priorContextRef.current,
        prev_frame_base64: prevFrameRef.current,
      });

      // Post-await session validity check: discard if user stopped while request was in-flight
      if (!isWatchingRef.current || currentSessionId !== sessionIdRef.current) {
        console.log('[Surroundings] Session ended while request was in flight. Discarding stale response.');
        return;
      }

      const scheduleNext = () => {
        if (isWatchingRef.current && currentSessionId === sessionIdRef.current) {
          if (cadenceTimerRef.current) clearTimeout(cadenceTimerRef.current);
          cadenceTimerRef.current = setTimeout(
            () => processCadenceCycle(currentSessionId),
            cadenceSeconds * 1000
          );
        }
      };

      if (result.isUnchanged) {
        console.log('[Surroundings] Scene is static; frame difference below threshold.');
        // Do not speak repetitive chatter when view is static; quietly wait for next cadence
        scheduleNext();
      } else {
        priorContextRef.current = result.spokenText;
        addTranscript(result.spokenText, 'observation');
        // Speak aloud, and ONLY schedule the next cycle AFTER speech has finished!
        speakText(result.spokenText, () => {
          scheduleNext();
        });
      }

      prevFrameRef.current = currentFrameBase64;
    } catch (err: any) {
      console.warn('[Surroundings] Cycle processing error:', err.message);
      // On error, schedule next retry after cadence
      if (isWatchingRef.current && currentSessionId === sessionIdRef.current) {
        cadenceTimerRef.current = setTimeout(
          () => processCadenceCycle(currentSessionId),
          cadenceSeconds * 1000
        );
      }
    } finally {
      isProcessingRef.current = false;
      setIsAnalyzingFrame(false);
    }
  };

  const formatTime = (totalSeconds: number): string => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const stopWatchingTimeout = () => {
    stopWatchingInternal();
    addTranscript(
      'Surroundings session reached 5-minute safety limit. Paused to preserve quota and battery. Press start to resume anytime.',
      'system'
    );
    speakText('Surroundings session paused after five minutes to preserve quota. Press start to resume.');
  };

  /**
   * Start Surroundings Mode.
   */
  const startWatching = async () => {
    // If already watching or cleaning up, stop first
    stopWatchingInternal();

    const currentSessionId = ++sessionIdRef.current;
    setIsWatching(true);
    isWatchingRef.current = true;

    addTranscript('Starting Surroundings Mode. Initializing camera...', 'system');
    speakText('Starting Surroundings Mode. Point your camera forward.');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      // Check if session was cancelled while awaiting getUserMedia
      if (!isWatchingRef.current || currentSessionId !== sessionIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
      }

      // Initialize session timer
      setSessionSeconds(0);
      sessionTimerRef.current = setInterval(() => {
        setSessionSeconds((prev) => {
          if (prev + 1 >= MAX_SESSION_SECONDS) {
            stopWatchingTimeout();
            return MAX_SESSION_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);

      // Wait for camera video dimensions to be ready (takes ~200-400ms)
      const isReady = await waitForCameraReady(3000);
      if (!isReady || currentSessionId !== sessionIdRef.current) {
        console.warn('[Surroundings] Video frame timed out or cancelled during startup.');
      } else {
        addTranscript('Camera active. Analyzing surroundings every 5 seconds.', 'system');
      }

      // Fire initial analysis immediately as soon as camera is ready!
      processCadenceCycle(currentSessionId);
    } catch (err: any) {
      console.warn('[Surroundings] Camera error:', err);
      setIsCameraActive(false);
      addTranscript(
        'Camera permission was not granted or camera is busy. Please allow camera access in your browser.',
        'system'
      );
      speakText('Camera permission not granted. Please allow camera access.');
      stopWatchingInternal();
    }
  };

  /**
   * Stop Surroundings Mode cleanly.
   */
  const stopWatchingInternal = () => {
    sessionIdRef.current++; // Invalidates all pending asynchronous tool responses
    setIsWatching(false);
    isWatchingRef.current = false;
    setIsCameraActive(false);
    setIsAnalyzingFrame(false);
    isProcessingRef.current = false;

    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }

    if (cadenceTimerRef.current) {
      clearTimeout(cadenceTimerRef.current);
      cadenceTimerRef.current = null;
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
    if (isWatchingRef.current) {
      stopWatching();
    } else {
      startWatching();
    }
  };

  /**
   * Execute follow-up query while pausing background cadence loop.
   */
  const executeFollowupQuery = async (question: string) => {
    // 1. Temporarily pause any scheduled cadence cycle
    if (cadenceTimerRef.current) {
      clearTimeout(cadenceTimerRef.current);
      cadenceTimerRef.current = null;
    }

    stopSpeaking();
    addTranscript(`Asking: "${question}"...`, 'system');

    try {
      isProcessingRef.current = true;
      setIsAnalyzingFrame(true);

      const currentFrame = captureFrameBase64();
      const result = await callTool('ask_followup', {
        question,
        prior_context: priorContextRef.current,
        image_base64: currentFrame || undefined,
        mime_type: currentFrame ? 'image/jpeg' : undefined,
      });

      addTranscript(result.spokenText, 'observation');
      speakText(result.spokenText, () => {
        // Resume regular cadence 5 seconds AFTER answer speech completes
        if (isWatchingRef.current) {
          if (cadenceTimerRef.current) clearTimeout(cadenceTimerRef.current);
          cadenceTimerRef.current = setTimeout(
            () => processCadenceCycle(sessionIdRef.current),
            cadenceSeconds * 1000
          );
        }
      });
    } catch (err: any) {
      addTranscript(`Could not resolve question: ${err.message}`, 'system');
      speakText('Sorry, I had trouble answering that.', () => {
        if (isWatchingRef.current) {
          if (cadenceTimerRef.current) clearTimeout(cadenceTimerRef.current);
          cadenceTimerRef.current = setTimeout(
            () => processCadenceCycle(sessionIdRef.current),
            cadenceSeconds * 1000
          );
        }
      });
    } finally {
      isProcessingRef.current = false;
      setIsAnalyzingFrame(false);
    }
  };

  /**
   * Handle Voice Recognition Commands.
   */
  const handleVoiceCommand = async (command: string) => {
    const lower = command.toLowerCase().trim();
    setInterimSpeech('');
    addTranscript(`Heard: "${command}"`, 'followup');

    // 0. Disable voice control triggers
    if (
      lower.includes('disable voice') ||
      lower.includes('turn off voice') ||
      lower.includes('stop voice control') ||
      lower.includes('disable voice control') ||
      lower.includes('stop listening') ||
      lower.includes('deactivate voice') ||
      lower.includes('pause voice')
    ) {
      updateVoiceActive(false);
      stopListening();
      setInterimSpeech('');
      speakText('Voice control disabled. Tap the button to re-enable anytime.');
      addTranscript('Voice control disabled by voice command.', 'system');
      return;
    }

    // 1. Navigation triggers
    if (
      lower.includes('switch to visual analysis') ||
      lower.includes('open visual analysis') ||
      lower.includes('go to visual analysis') ||
      lower.includes('visual analysis')
    ) {
      speakText('Switching to Visual Analysis.');
      onNavigateTab?.('analysis');
      return;
    }

    // 2. Stop camera watching triggers
    if (
      lower.includes('stop') ||
      lower.includes('pause') ||
      lower.includes("that's enough") ||
      lower.includes('quiet') ||
      lower.includes('shut up') ||
      lower.includes('be quiet') ||
      lower.includes('silence')
    ) {
      stopWatching();
      return;
    }

    // 3. Start control triggers (use ref to avoid stale closure)
    if (
      lower.includes('start surroundings') ||
      lower.includes('describe surroundings') ||
      lower.includes('start watching') ||
      lower === 'start' ||
      lower.includes('resume') ||
      lower.includes('continue')
    ) {
      if (!isWatchingRef.current) {
        startWatching();
      }
      return;
    }

    // 4. Exhaustive detail drill-down on request
    if (
      lower.includes('tell me everything') ||
      lower.includes('more detail') ||
      lower.includes('all details') ||
      lower.includes('exhaustive') ||
      lower.includes('describe in detail')
    ) {
      await executeFollowupQuery(
        'Please describe everything in the current view in exhaustive, patient, line-by-line detail, including spatial positioning, textures, objects, and any navigation obstacles.'
      );
      return;
    }

    // 5. Any other speech is treated as a direct question
    await executeFollowupQuery(command);
  };

  const toggleVoiceControl = () => {
    if (isVoiceActive) {
      updateVoiceActive(false);
      stopListening();
      setInterimSpeech('');
      speakText('Voice control paused.');
    } else {
      updateVoiceActive(true);
      speakText('Voice control active. You can speak commands or questions.');
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

    await executeFollowupQuery(question);
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
                <span className="text-[var(--text-secondary)]">
                  • Session: {formatTime(sessionSeconds)} / {formatTime(MAX_SESSION_SECONDS)}
                </span>
              </div>
              <span className="text-[var(--text-secondary)] font-medium">
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

        {/* Real-time Voice Detection Banner */}
        {interimSpeech && (
          <div className="p-2.5 rounded-[var(--radius-sm)] border border-[var(--status-listening-border)] bg-[var(--status-listening-bg)] text-[var(--status-listening-text)] text-xs flex items-center gap-2">
            <Mic className="h-3.5 w-3.5 animate-pulse" aria-hidden="true" />
            <span className="font-semibold uppercase tracking-wider">Hearing:</span>
            <span className="italic">&quot;{interimSpeech}...&quot;</span>
          </div>
        )}

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
    </div>
  );
}
