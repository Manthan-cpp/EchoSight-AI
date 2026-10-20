import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Upload,
  CheckCircle2,
  RefreshCw,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  MessageSquare,
  AlertCircle,
  FileImage,
  Video as VideoIcon,
  Camera,
} from 'lucide-react';
import { callTool, type ToolResult } from '../services/mcpClient';
import {
  speakText,
  stopSpeaking,
  startListening,
  stopListening,
  isSpeechRecognitionSupported,
  onSpeechStateChange,
  isEchoSightSpeaking,
  markCommandHandled,
} from '../services/speechService';

type DetectedMediaType = 'image' | 'video';

interface FollowupItem {
  id: string;
  question: string;
  answer: string;
  timestamp: string;
}

interface VisualAnalysisProps {
  isVoiceActive?: boolean;
  setIsVoiceActive?: (active: boolean) => void;
  onNavigateTab?: (tab: 'surroundings' | 'analysis') => void;
}

export function VisualAnalysis({
  isVoiceActive: isVoiceProp,
  setIsVoiceActive: setIsVoiceProp,
  onNavigateTab,
}: VisualAnalysisProps = {}) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedType, setDetectedType] = useState<DetectedMediaType>('image');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [toolResult, setToolResult] = useState<ToolResult | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [localVoiceActive, setLocalVoiceActive] = useState<boolean>(isVoiceProp ?? true);
  const isVoiceListening = isVoiceProp !== undefined ? isVoiceProp : localVoiceActive;
  const updateVoiceActive = (active: boolean) => {
    setLocalVoiceActive(active);
    setIsVoiceProp?.(active);
  };
  const [interimSpeech, setInterimSpeech] = useState<string>('');
  const [followupText, setFollowupText] = useState<string>('');
  const [isAnsweringFollowup, setIsAnsweringFollowup] = useState<boolean>(false);
  const [followups, setFollowups] = useState<FollowupItem[]>([]);
  const [contextHistory, setContextHistory] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interruptionNotice, setInterruptionNotice] = useState<string | null>(null);
  const [isAwaitingFileTap, setIsAwaitingFileTap] = useState<boolean>(false);

  // Synchronization and concurrency locks to guarantee user questions take priority
  const queryTokenRef = useRef<number>(0);
  const narrationSupersededRef = useRef<boolean>(false);
  const selectedFileRef = useRef<File | null>(null);
  const detectedTypeRef = useRef<DetectedMediaType>('image');
  const fileBase64Ref = useRef<string | null>(null);
  const contextHistoryRef = useRef<string>('');
  const isAnalyzingRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCapturingPhotoRef = useRef<boolean>(false);

  // Keep state refs synchronized to eliminate stale closures in speech callbacks
  useEffect(() => {
    selectedFileRef.current = selectedFile;
    detectedTypeRef.current = detectedType;
    fileBase64Ref.current = fileBase64;
    contextHistoryRef.current = contextHistory;
    isAnalyzingRef.current = isAnalyzing;
  }, [selectedFile, detectedType, fileBase64, contextHistory, isAnalyzing]);

  // Synchronize continuous voice listening enabled by default
  useEffect(() => {
    if (isVoiceListening && isSpeechRecognitionSupported()) {
      startListening(
        (transcript) => handleVoiceCommand(transcript),
        undefined,
        (err) => setErrorMessage(err),
        (interim) => handleInterimSpeech(interim)
      );
    } else {
      stopListening();
      setInterimSpeech('');
    }
  }, [isVoiceListening]);

  // Synchronize speech state directly from speech service (including instant barge-in interruptions)
  useEffect(() => {
    return onSpeechStateChange((speaking) => {
      setIsSpeaking(speaking);
    });
  }, []);

  // User activation bridge: when file picker is requested by voice, any screen tap or Space/Enter triggers native file dialog
  useEffect(() => {
    if (!isAwaitingFileTap) return;

    const handleUserGesture = (e: Event) => {
      if (e.target === fileInputRef.current) return;
      try {
        fileInputRef.current?.click();
      } catch (err) {
        console.warn('[VisualAnalysis] Gesture file click failed:', err);
      }
      setIsAwaitingFileTap(false);
    };

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        fileInputRef.current?.click();
        setIsAwaitingFileTap(false);
      }
    };

    window.addEventListener('click', handleUserGesture, { once: true });
    window.addEventListener('touchstart', handleUserGesture, { once: true });
    window.addEventListener('keydown', handleKey, { once: true });

    const timeout = setTimeout(() => {
      setIsAwaitingFileTap(false);
    }, 20000);

    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('touchstart', handleUserGesture);
      window.removeEventListener('keydown', handleKey);
      clearTimeout(timeout);
    };
  }, [isAwaitingFileTap]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      narrationSupersededRef.current = true;
      stopSpeaking();
      stopListening();
    };
  }, []);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
      const mediaType: DetectedMediaType = isVideo ? 'video' : 'image';

      setIsAwaitingFileTap(false);
      setSelectedFile(file);
      setDetectedType(mediaType);
      detectedTypeRef.current = mediaType;
      setPreviewUrl(URL.createObjectURL(file));
      setToolResult(null);
      setFollowups([]);
      setContextHistory('');
      setErrorMessage(null);
      setInterruptionNotice(null);
      narrationSupersededRef.current = true;
      stopSpeaking();
      setIsSpeaking(false);

      // Read file as base64
      try {
        const base64 = await readFileAsBase64(file);
        fileBase64Ref.current = base64;
        setFileBase64(base64);
        speakText(`${file.name} selected. Say "analyze this" to begin.`);
      } catch (err: any) {
        setErrorMessage('Failed to read file: ' + err.message);
      }
    }
    // Reset file input value so selecting the same file again triggers change
    if (e.target) {
      e.target.value = '';
    }
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const triggerFilePicker = () => {
    setInterimSpeech('');
    stopSpeaking();

    // If already waiting for file tap/enter, do not re-announce or duplicate
    if (isAwaitingFileTap) {
      try {
        fileInputRef.current?.click();
      } catch (e) {
        console.warn('[VisualAnalysis] Direct input click blocked by browser:', e);
      }
      return;
    }

    setIsAwaitingFileTap(true);

    try {
      fileInputRef.current?.click();
    } catch (e) {
      console.warn('[VisualAnalysis] Direct input click blocked by browser:', e);
    }

    speakText('Opening file picker. Tap anywhere on screen or press Enter to choose your file.');
  };

  const handleCapturePhotoFromCamera = async (autoAnalyze: boolean = false) => {
    if (isCapturingPhotoRef.current) return;
    isCapturingPhotoRef.current = true;

    stopSpeaking();
    speakText(autoAnalyze ? 'Accessing camera to take photo and analyze...' : 'Accessing camera. Please hold your document or object steady...');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      // Wait a brief moment for camera exposure adjustment
      await new Promise((r) => setTimeout(r, 450));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      }

      stream.getTracks().forEach((track) => track.stop());

      canvas.toBlob(async (blob) => {
        try {
          if (!blob) return;
          const file = new File([blob], `camera-photo-${Date.now()}.jpg`, { type: 'image/jpeg' });
          selectedFileRef.current = file;
          setSelectedFile(file);
          detectedTypeRef.current = 'image';
          setDetectedType('image');
          setPreviewUrl(URL.createObjectURL(file));
          setToolResult(null);
          setFollowups([]);
          setContextHistory('');
          setErrorMessage(null);
          setInterruptionNotice(null);
          setIsAwaitingFileTap(false);

          const base64 = await readFileAsBase64(file);
          fileBase64Ref.current = base64;
          setFileBase64(base64);

          if (autoAnalyze) {
            handleRunAnalysis();
          } else {
            speakText('Photo captured from camera. Say "analyze it" or "analyze this" to begin exhaustive analysis.');
          }
        } finally {
          isCapturingPhotoRef.current = false;
        }
      }, 'image/jpeg', 0.85);
    } catch (err: any) {
      isCapturingPhotoRef.current = false;
      console.warn('[VisualAnalysis] Camera capture failed:', err);
      speakText('Could not access camera. Please choose a file instead.');
    }
  };

  const handleReset = () => {
    narrationSupersededRef.current = true;
    stopSpeaking();
    setIsSpeaking(false);
    setSelectedFile(null);
    setDetectedType('image');
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileBase64(null);
    setToolResult(null);
    setFollowups([]);
    setContextHistory('');
    setErrorMessage(null);
    setInterruptionNotice(null);
    setInterimSpeech('');
    setFollowupText('');
  };

  /**
   * Run automated analysis based on detected media type (video vs image/scorecard).
   */
  const handleRunAnalysis = async () => {
    if (!fileBase64Ref.current || !selectedFileRef.current) return;

    const token = ++queryTokenRef.current;
    narrationSupersededRef.current = false;
    setIsAnalyzing(true);
    setErrorMessage(null);
    setInterruptionNotice(null);
    stopSpeaking();
    setIsSpeaking(false);
    speakText('Analyzing your media in exhaustive detail...');

    try {
      let result: ToolResult;
      const file = selectedFileRef.current;
      const mediaType = detectedTypeRef.current;
      const mimeType = file.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg');

      if (mediaType === 'video') {
        // Automatically route video input to analyze_video
        result = await callTool('analyze_video', {
          video_base64: fileBase64Ref.current,
          mime_type: mimeType,
        });
      } else if (/scorecard|cricket|match/i.test(file.name)) {
        // Automatically route scorecard/sports images to analyze_scorecard
        result = await callTool('analyze_scorecard', {
          image_base64: fileBase64Ref.current,
          mime_type: mimeType,
        });
      } else {
        // Route general still images, charts, graphs, and diagrams to analyze_visual
        result = await callTool('analyze_visual', {
          image_base64: fileBase64Ref.current,
          mime_type: mimeType,
        });
      }

      // Always populate the visual output cards
      setToolResult(result);
      const initialContext = `Input: ${file.name} (${mediaType})\nDescription: ${result.detailedText}`;
      setContextHistory(initialContext);

      // BARGE-IN CHECK: If the user asked a question while analysis was running,
      // DO NOT play the background analysis narration over the user's question!
      if (narrationSupersededRef.current || token !== queryTokenRef.current) {
        console.log('[VisualAnalysis] Initial narration superseded by user question.');
        return;
      }

      // Play spoken text automatically if not interrupted
      if (result.spokenText) {
        speakText(result.spokenText);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Analysis failed. Please check connection and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  /**
   * Toggle manual speech narration.
   */
  const handleToggleSpeech = () => {
    if (isSpeaking || isEchoSightSpeaking) {
      narrationSupersededRef.current = true;
      stopSpeaking();
      setIsSpeaking(false);
      setInterruptionNotice('Narration paused.');
    } else if (toolResult?.spokenText) {
      narrationSupersededRef.current = false;
      setInterruptionNotice(null);
      speakText(toolResult.spokenText);
    }
  };

  /**
   * Answer user follow-up questions with instant interruption of ongoing narration.
   */
  const handleAskFollowup = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    // 1. INSTANT INTERRUPTION: Silence narration immediately on question submission!
    narrationSupersededRef.current = true;
    stopSpeaking();
    setIsSpeaking(false);

    const token = ++queryTokenRef.current;
    setIsAnsweringFollowup(true);
    setErrorMessage(null);
    setInterruptionNotice(`Interrupted narration to answer: "${trimmed}"`);
    setFollowupText('');
    setInterimSpeech('');

    try {
      const currentFile = selectedFileRef.current;
      const currentBase64 = fileBase64Ref.current;
      const currentContext = contextHistoryRef.current;
      const mimeType = currentFile?.type || 'image/jpeg';

      const result = await callTool('ask_followup', {
        question: trimmed,
        prior_context: currentContext,
        image_base64: currentBase64 || undefined,
        mime_type: mimeType,
      });

      // If superseded by an even newer question, discard this response
      if (token !== queryTokenRef.current) {
        console.log('[VisualAnalysis] Followup response superseded by newer user question.');
        return;
      }

      const answerText = result.spokenText || result.detailedText;
      const newFollowup: FollowupItem = {
        id: Date.now().toString(),
        question: trimmed,
        answer: answerText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setFollowups((prev) => [...prev, newFollowup]);
      setContextHistory((prev) => `${prev}\nUser: ${trimmed}\nEchoSight: ${result.detailedText}`);

      // Answer user question first and immediately speak it aloud!
      if (result.spokenText) {
        speakText(result.spokenText);
      }
    } catch (err: any) {
      if (token === queryTokenRef.current) {
        setErrorMessage(`Follow-up error: ${err.message}`);
      }
    } finally {
      if (token === queryTokenRef.current) {
        setIsAnsweringFollowup(false);
      }
    }
  };

  const handleFollowupSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleAskFollowup(followupText);
  };

  const isNavigateToSurroundingsCommand = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    return (
      // "move to / go to / switch to / open / back to ... surroundings / camera"
      /\b(move|go|switch|open|navigate|back|return|take me)\b.*\b(surroundings?|camera)\b/i.test(lower) ||
      // "surroundings mode" / "surrounding mode" / "surroundings tab"
      /\b(surroundings?)\s*(mode|tab)?\b/i.test(lower) ||
      // "start surroundings" / "describe surroundings" / "live camera"
      /\b(start|describe|begin)\b.*\b(surroundings?|camera)\b/i.test(lower) ||
      /\b(camera mode|live camera|live mode)\b/i.test(lower)
    );
  };

  const isCameraCaptureCommand = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    return (
      /\b(take|snap|capture|use)\b.*\b(photo|picture|camera|image|snap)\b/i.test(lower) ||
      /^(take a photo|snap photo|use camera|capture photo|take photo|take snap|capture snap|snap|capture)$/i.test(lower)
    );
  };

  const isAnalyzeCommand = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    return (
      // "analyze", "analyze it", "analyze this", "analyze photo", "analyze image", "analyze snap", "analyze video"
      /\banaly[zs]e\b/i.test(lower) ||
      // "explain this", "explain it", "explain image", "explain photo", "explain"
      /\b(explain|describe|read|deconstruct|inspect|examine)\s*(this|it|image|photo|video|picture|snap|file|scorecard|chart|match)?\b/i.test(lower) ||
      // "start analysis", "run analysis", "begin analysis"
      /\b(start|run|begin|do)\s*(analysis|reasoning|walkthrough)\b/i.test(lower) ||
      // "what's in this", "what is this", "what is in this photo"
      /\bwhat('s| is)\s*(in this|this|it|in the image|in the photo|here)\b/i.test(lower) ||
      // "tell me about this", "tell me what you see"
      /\btell me (about this|what('s| is) (in this|here)|what you see)\b/i.test(lower) ||
      // Exact single words
      /^(analyze|analyse|explain|describe|read)$/i.test(lower)
    );
  };

  const isFileUploadCommand = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    // Do not trigger file upload if media is already loaded and user is requesting analysis
    if (fileBase64Ref.current && isAnalyzeCommand(lower)) {
      return false;
    }
    return (
      // "open file picker", "open the file picker", "open picker", "file picker"
      /\b(open|show|launch|start|display)\b.*\b(file\s*picker|picker|chooser|dialog|files?)\b/i.test(lower) ||
      /\bfile\s*picker\b/i.test(lower) ||
      // "upload / choose / select / pick / browse ... file / image / video / photo / chart"
      /\b(upload|choose|select|pick|browse|load)\b.*\b(file|image|video|photo|picture|media|chart|scorecard|graphic)\b/i.test(lower) ||
      // "I want to upload / I want to choose"
      /\bwant to\b.*\b(upload|choose|select|pick)\b/i.test(lower) ||
      // Short phrases
      /^(upload|choose file|select file|pick file|browse|open picker|file picker)$/i.test(lower)
    );
  };

  /**
   * Voice Command Processor with Instant Barge-In Interruption.
   */
  const handleVoiceCommand = (command: string) => {
    const lower = command.toLowerCase().trim();
    setInterimSpeech('');

    // Safety: ignore empty or residual entrance tokens
    if (!lower || lower === 'enter' || lower === 'inter') return;

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
      markCommandHandled(command);
      updateVoiceActive(false);
      stopListening();
      setInterimSpeech('');
      speakText('Voice control disabled. You can re-enable using the button.');
      setInterruptionNotice('Voice control disabled by user voice command.');
      return;
    }

    // 1. Camera snap command by voice (live capture without file picker dialog)
    if (isCameraCaptureCommand(lower)) {
      markCommandHandled(command);
      const shouldAutoAnalyze =
        lower.includes('analyze') ||
        lower.includes('analyse') ||
        lower.includes('explain') ||
        lower.includes('describe');
      handleCapturePhotoFromCamera(shouldAutoAnalyze);
      return;
    }

    // 2. Trigger initial exhaustive analysis by voice when media is loaded
    if (fileBase64Ref.current && isAnalyzeCommand(lower)) {
      markCommandHandled(command);
      handleRunAnalysis();
      return;
    }

    // 2b. If no media is loaded and user asks to analyze, prompt with guidance
    if (!fileBase64Ref.current && isAnalyzeCommand(lower)) {
      markCommandHandled(command);
      speakText('No media loaded yet. Say "take a photo" or "open file picker" to select media.');
      return;
    }

    // 3. File selection by voice ("I want to choose a file", "open file picker", "upload file")
    if (isFileUploadCommand(lower)) {
      markCommandHandled(command);
      triggerFilePicker();
      return;
    }

    // 4. Navigation triggers (Surroundings Mode Tab)
    if (isNavigateToSurroundingsCommand(lower)) {
      markCommandHandled(command);
      narrationSupersededRef.current = true;
      stopSpeaking();
      setIsSpeaking(false);
      speakText('Switching to Surroundings Mode. Say "start surroundings" to begin.');
      onNavigateTab?.('surroundings');
      return;
    }

    // 5. Stop / Silence audio commands
    if (
      lower.includes('stop') ||
      lower.includes('pause') ||
      lower.includes("that's enough") ||
      lower.includes('quiet') ||
      lower.includes('shut up') ||
      lower.includes('be quiet') ||
      lower.includes('silence')
    ) {
      markCommandHandled(command);
      narrationSupersededRef.current = true;
      stopSpeaking();
      setIsSpeaking(false);
      setInterruptionNotice('Silenced audio on user voice command.');
      return;
    }

    // 6. Any other spoken input is treated as a direct question that interrupts ongoing narration!
    handleAskFollowup(command);
  };

  /**
   * Interim speech callback: handles instant barge-in and fast navigation.
   */
  const handleInterimSpeech = (interim: string) => {
    setInterimSpeech(interim);
    const lower = interim.toLowerCase().trim();

    // Instant barge-in: If user speaks ANY word while EchoSight is narrating, silence system voice immediately
    if (interim.trim() && (window.speechSynthesis?.speaking || isEchoSightSpeaking)) {
      narrationSupersededRef.current = true;
      stopSpeaking();
      setIsSpeaking(false);
      setInterruptionNotice('Interrupted: listening to your question...');
    }

    // Fast-path: Interim navigation to Surroundings Mode
    if (isNavigateToSurroundingsCommand(lower)) {
      console.log('[VisualAnalysis] Fast interim navigation to surroundings:', lower);
      setInterimSpeech('');
      markCommandHandled(lower);
      narrationSupersededRef.current = true;
      stopSpeaking();
      setIsSpeaking(false);
      speakText('Switching to Surroundings Mode. Say "start surroundings" to begin.');
      onNavigateTab?.('surroundings');
      return;
    }
  };

  /**
   * Toggle continuous hands-free voice control.
   */
  const toggleVoiceControl = () => {
    if (isVoiceListening) {
      updateVoiceActive(false);
      stopListening();
      setInterimSpeech('');
      speakText('Voice control paused.');
    } else {
      updateVoiceActive(true);
      speakText('Voice control active. You can speak commands or questions.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Unified Input Card - Clean single interface with auto-detection */}
      <section aria-labelledby="analysis-heading" className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-neutral)] pb-4">
          <div>
            <h2 id="analysis-heading" className="text-xl font-semibold text-[var(--text-primary)]">
              Visual & Video Analysis
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Unified multi-modal reasoning for charts, diagrams, match scorecards, and video clips.
            </p>
          </div>

          {/* Hands-Free Voice Control Toggle in Header */}
          <div className="flex items-center gap-2">
            {isSpeechRecognitionSupported() && (
              <button
                type="button"
                onClick={toggleVoiceControl}
                className={`btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 rounded-[var(--radius-sm)] ${
                  isVoiceListening
                    ? 'border-[var(--status-listening-border)] bg-[var(--status-listening-bg)] text-[var(--status-listening-text)] font-semibold'
                    : ''
                }`}
                aria-pressed={isVoiceListening}
                aria-label={isVoiceListening ? 'Disable hands-free voice control' : 'Enable hands-free voice control'}
              >
                {isVoiceListening ? (
                  <>
                    <Mic className="h-4 w-4" aria-hidden="true" />
                    <span>Voice Control: Active</span>
                  </>
                ) : (
                  <>
                    <MicOff className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
                    <span>Enable Voice Control</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Live Voice Feedback Bar (when listening or narrating) */}
        {(isVoiceListening && interimSpeech) || isSpeaking ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs p-2 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] border border-[var(--border-neutral)]">
            <div className="flex items-center gap-2">
              {isVoiceListening && interimSpeech && (
                <span className="text-[var(--accent-primary)] italic font-medium animate-pulse">
                  Heard: "{interimSpeech}"
                </span>
              )}
            </div>

            {isSpeaking && (
              <div className="flex items-center gap-2">
                <span className="text-[var(--accent-primary)] font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                  Narrating (Speak question or say Stop to interrupt)
                </span>
                <button
                  onClick={handleToggleSpeech}
                  className="btn-secondary text-xs py-0.5 px-2 flex items-center gap-1"
                  aria-label="Silence audio"
                >
                  <VolumeX className="h-3 w-3" aria-hidden="true" />
                  <span>Silence</span>
                </button>
              </div>
            )}
          </div>
        ) : null}

        {/* Accessible hidden file input - callable anytime by voice or click */}
        <input
          id="visual-file-input"
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          onChange={handleFileChange}
          className="sr-only"
        />

        {/* Unified Upload / Drop Area */}
        <div className="space-y-4">
          {/* Active Voice Activation Banner when waiting for user tap/key */}
          {isAwaitingFileTap && (
            <button
              type="button"
              onClick={() => {
                fileInputRef.current?.click();
                setIsAwaitingFileTap(false);
              }}
              className="w-full p-4 rounded-[var(--radius-md)] border-2 border-[var(--accent-primary)] bg-[var(--status-listening-bg)] text-[var(--text-primary)] flex items-center justify-between text-left transition-colors"
              aria-label="Tap to open file chooser dialog"
            >
              <div className="flex items-center gap-3">
                <Upload className="h-6 w-6 text-[var(--accent-primary)] shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-sm text-[var(--text-primary)]">Tap here or press Enter to open File Picker</p>
                  <p className="text-xs text-[var(--text-secondary)]">Voice command detected. Tap anywhere on screen or press Enter to choose your media.</p>
                </div>
              </div>
              <span className="btn-primary text-xs py-1.5 px-3 shrink-0">Open Picker</span>
            </button>
          )}

          {!selectedFile ? (
            <div className="space-y-3">
              <label
                htmlFor="visual-file-input"
                className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--border-neutral)] rounded-[var(--radius-md)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] cursor-pointer transition-colors text-center"
              >
                <Upload className="h-10 w-10 text-[var(--text-secondary)] mb-2" aria-hidden="true" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  Select or Drop Any Media (Image, Chart, Scorecard, or Video Clip)
                </span>
                <span className="text-xs text-[var(--text-secondary)] mt-1">
                  Voice-Ready: Say "choose file" or "analyze image" • Images (JPEG, PNG, WebP up to 10MB) • Videos (MP4, WebM up to 20MB)
                </span>
              </label>

              <div className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => handleCapturePhotoFromCamera()}
                  className="btn-secondary text-xs flex items-center gap-2 py-2 px-4 rounded-[var(--radius-sm)]"
                  aria-label="Take photo with camera to analyze"
                >
                  <Camera className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                  <span>Take Photo with Camera (or say "take a photo")</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="border border-[var(--border-neutral)] rounded-[var(--radius-md)] p-4 bg-[var(--bg-surface)] space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-neutral)] pb-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <CheckCircle2 className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">{selectedFile.name}</span>
                  <span className="text-xs px-2 py-0.5 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] border border-[var(--border-neutral)] text-[var(--text-secondary)] font-medium flex items-center gap-1">
                    {detectedType === 'video' ? (
                      <>
                        <VideoIcon className="h-3 w-3" aria-hidden="true" />
                        <span>Video Clip</span>
                      </>
                    ) : (
                      <>
                        <FileImage className="h-3 w-3" aria-hidden="true" />
                        <span>Image / Visual</span>
                      </>
                    )}
                  </span>
                  <span className="text-xs text-[var(--text-secondary)]">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleCapturePhotoFromCamera()}
                    className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1"
                    title="Take photo with camera"
                  >
                    <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Snap Photo</span>
                  </button>
                  <button
                    onClick={handleReset}
                    className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  >
                    Change File
                  </button>
                </div>
              </div>

              {/* Preview */}
              <div className="max-h-60 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-subtle)] flex items-center justify-center">
                {detectedType === 'video' ? (
                  <video src={previewUrl || undefined} controls className="max-h-60 w-full object-contain" />
                ) : (
                  <img src={previewUrl || undefined} alt="Uploaded preview" className="max-h-60 object-contain" />
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleRunAnalysis}
                  disabled={isAnalyzing}
                  className="btn-primary flex-1"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Analyzing {detectedType === 'video' ? 'Video' : 'Visual Stream'} via MCP...</span>
                    </>
                  ) : (
                    <span>Explain in Exhaustive Detail</span>
                  )}
                </button>
                <button
                  onClick={handleReset}
                  disabled={isAnalyzing}
                  className="btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Interruption Notification Banner (Aria-live for accessibility) */}
      {interruptionNotice && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 rounded-[var(--radius-sm)] border border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)] flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[var(--accent-primary)] shrink-0" aria-hidden="true" />
            <span>{interruptionNotice}</span>
          </div>
          <button
            onClick={() => setInterruptionNotice(null)}
            className="font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Error Notice */}
      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-3 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-between text-xs"
        >
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Structured Output Walkthrough Area */}
      <section aria-labelledby="analysis-output-heading" className="card space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-neutral)] pb-3">
          <h3 id="analysis-output-heading" className="text-base font-semibold text-[var(--text-primary)]">
            Exhaustive Spoken Analysis
          </h3>
          {toolResult && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleSpeech}
                className="btn-secondary text-xs flex items-center gap-1.5 py-1 px-2.5"
                aria-label={isSpeaking ? 'Silence spoken readout' : 'Read spoken analysis aloud'}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Silence Audio</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Read Aloud</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Real Empty State */}
        {!toolResult && !isAnalyzing && (
          <div className="py-10 text-center space-y-2 border border-dashed border-[var(--border-neutral)] rounded-[var(--radius-md)] p-4">
            <Upload className="mx-auto h-8 w-8 text-[var(--text-secondary)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              No media analyzed yet
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
              Drop any image, chart, scorecard, or video clip above. EchoSight will auto-detect the media and break it down in structured, patient detail designed for listening.
            </p>
          </div>
        )}

        {/* Active Analysis State */}
        {isAnalyzing && (
          <div className="p-4 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--status-thinking-bg)] text-[var(--status-thinking-text)] space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-[2px] bg-[var(--status-thinking-text)] animate-pulse" aria-hidden="true" />
              <p className="text-xs font-bold uppercase tracking-wider">
                Analyzing {detectedType === 'video' ? 'Video Frames' : 'Visual Stream'}
              </p>
            </div>
            <p className="text-xs">
              Deconstructing layout, data points, trends, motion, and contextual meaning via Google Gemini pipeline...
            </p>
          </div>
        )}

        {/* Result Breakdown */}
        {toolResult && (
          <div className="space-y-4">
            {/* Proactive Insight Highlight (if returned) */}
            {toolResult.proactiveInsight && (
              <div className="p-3 rounded-[var(--radius-sm)] border-l-4 border-l-[var(--accent-primary)] bg-[var(--bg-subtle)] space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Proactive Takeaway
                </span>
                <p className="text-sm text-[var(--text-primary)]">
                  {toolResult.proactiveInsight}
                </p>
              </div>
            )}

            {/* Spoken Summary */}
            <div className="p-4 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] space-y-2">
              <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <span className="font-semibold uppercase tracking-wider">Spoken Narrative</span>
                {isSpeaking && (
                  <span className="text-[var(--accent-primary)] font-semibold flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-[2px] bg-[var(--accent-primary)] animate-pulse" />
                    Speaking Now
                  </span>
                )}
              </div>
              <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                {toolResult.spokenText}
              </p>
            </div>

            {/* Exhaustive Breakdown */}
            <div className="p-4 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] space-y-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Comprehensive Written Breakdown
              </span>
              <div className="text-sm text-[var(--text-primary)] leading-relaxed whitespace-pre-wrap font-sans">
                {toolResult.detailedText}
              </div>
            </div>
          </div>
        )}

        {/* Conversational Follow-Up Chain (Visible once file is loaded or analyzed) */}
        {(toolResult || selectedFile) && (
          <div className="space-y-4 pt-2 border-t border-[var(--border-neutral)]">
            {followups.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Follow-Up Answers
                </h4>
                {followups.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-subtle)] space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">Q: {item.question}</span>
                      <span>{item.timestamp}</span>
                    </div>
                    <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                      {item.answer}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Follow-up question input - ALWAYS available to interrupt immediately */}
            <form onSubmit={handleFollowupSubmit} className="pt-2 flex gap-2">
              <label htmlFor="analysis-followup-input" className="sr-only">
                Ask a question or interrupt ongoing narration
              </label>
              <input
                id="analysis-followup-input"
                type="text"
                value={followupText}
                onChange={(e) => setFollowupText(e.target.value)}
                placeholder={
                  isSpeaking
                    ? "Type question to interrupt narration (or speak aloud)..."
                    : "Ask a question (e.g. 'What is the highest value?', 'Who won?')"
                }
                disabled={isAnsweringFollowup}
                className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
              {isSpeechRecognitionSupported() && (
                <button
                  type="button"
                  onClick={toggleVoiceControl}
                  disabled={isAnsweringFollowup}
                  className={`btn-secondary text-xs px-3 flex items-center gap-1 ${
                    isVoiceListening ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]' : ''
                  }`}
                  aria-label={isVoiceListening ? 'Stop voice recognition' : 'Ask question with voice'}
                >
                  {isVoiceListening ? (
                    <MicOff className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Mic className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              )}
              <button
                type="submit"
                disabled={!followupText.trim() || isAnsweringFollowup}
                className="btn-secondary whitespace-nowrap text-xs font-semibold"
              >
                {isAnsweringFollowup ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <span className="flex items-center gap-1">
                    <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{isSpeaking ? 'Interrupt & Ask' : 'Ask'}</span>
                  </span>
                )}
              </button>
            </form>
          </div>
        )}
      </section>
    </div>
  );
}