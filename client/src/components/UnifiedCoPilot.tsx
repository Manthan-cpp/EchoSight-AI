import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Camera,
  Play,
  StopCircle,
  Upload,
  Sparkles,
  RefreshCw,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  AlertCircle,
  CheckCircle2,
  Send,
  Eye,
} from 'lucide-react';
import { callTool, type ToolResult } from '../services/mcpClient';
import {
  speakText,
  stopSpeaking,
  startListening,
  stopListening,
  isSpeechRecognitionSupported,
  markCommandHandled,
  onSpeechStateChange,
  isEchoSightSpeaking,
} from '../services/speechService';

export type WorkspaceMode = 'standby' | 'radar' | 'inspection';

interface FeedItem {
  id: string;
  timestamp: string;
  type: 'radar' | 'analysis' | 'followup' | 'system';
  title?: string;
  content: string;
  proactiveInsight?: string;
  detailedText?: string;
}

interface UnifiedCoPilotProps {
  isVoiceActive?: boolean;
  setIsVoiceActive?: (active: boolean) => void;
  onModeChange?: (mode: WorkspaceMode) => void;
}

export function UnifiedCoPilot({
  isVoiceActive: isVoiceProp,
  setIsVoiceActive: setIsVoiceProp,
  onModeChange,
}: UnifiedCoPilotProps = {}) {
  // --- Workspace Mode State ---
  const [mode, setMode] = useState<WorkspaceMode>('standby');
  const [localVoiceActive, setLocalVoiceActive] = useState<boolean>(isVoiceProp ?? true);
  const isVoiceActive = isVoiceProp !== undefined ? isVoiceProp : localVoiceActive;
  const updateVoiceActive = (active: boolean) => {
    setLocalVoiceActive(active);
    setIsVoiceProp?.(active);
  };

  // --- Live Radar State ---
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isRadarScanning, setIsRadarScanning] = useState<boolean>(false);
  const [isAnalyzingFrame, setIsAnalyzingFrame] = useState<boolean>(false);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);
  const cadenceSeconds = 5;
  const MAX_SESSION_SECONDS = 300; // 5 min safety cap

  // --- Snapshot & Loaded Media State ---
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [detectedType, setDetectedType] = useState<'image' | 'video'>('image');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [isAwaitingFileTap, setIsAwaitingFileTap] = useState<boolean>(false);

  // --- Deep Analysis & Feed State ---
  const [isAnalyzingMedia, setIsAnalyzingMedia] = useState<boolean>(false);
  const [activeAnalysisResult, setActiveAnalysisResult] = useState<ToolResult | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [followupText, setFollowupText] = useState<string>('');
  const [isAnsweringFollowup, setIsAnsweringFollowup] = useState<boolean>(false);

  // --- Speech & Auditory State ---
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [interimSpeech, setInterimSpeech] = useState<string>('');
  const [interruptionNotice, setInterruptionNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Synchronized Refs (Avoid stale closures in speech & timer callbacks) ---
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const feedContainerRef = useRef<HTMLDivElement | null>(null);

  const modeRef = useRef<WorkspaceMode>('standby');
  const isRadarScanningRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const sessionIdRef = useRef<number>(0);
  const cadenceTimerRef = useRef<any>(null);
  const sessionTimerRef = useRef<any>(null);
  const priorContextRef = useRef<string>('');
  const prevFrameRef = useRef<string | null>(null);

  const selectedFileRef = useRef<File | null>(null);
  const fileBase64Ref = useRef<string | null>(null);
  const detectedTypeRef = useRef<'image' | 'video'>('image');
  const isCapturingPhotoRef = useRef<boolean>(false);
  const queryTokenRef = useRef<number>(0);

  // Synchronize state to refs
  useEffect(() => {
    modeRef.current = mode;
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  useEffect(() => {
    isRadarScanningRef.current = isRadarScanning;
  }, [isRadarScanning]);

  useEffect(() => {
    selectedFileRef.current = selectedFile;
    fileBase64Ref.current = fileBase64;
    detectedTypeRef.current = detectedType;
  }, [selectedFile, fileBase64, detectedType]);

  // Isolated scroll container: scroll to bottom whenever feed updates
  useEffect(() => {
    if (feedContainerRef.current) {
      feedContainerRef.current.scrollTop = feedContainerRef.current.scrollHeight;
    }
  }, [feedItems]);

  // Synchronize speech synthesis state
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
        console.warn('[UnifiedCoPilot] Gesture file click failed:', err);
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
    window.addEventListener('keydown', handleKey, { once: true });

    return () => {
      window.removeEventListener('click', handleUserGesture);
      window.removeEventListener('keydown', handleKey);
    };
  }, [isAwaitingFileTap]);

  // Continuous speech recognition
  useEffect(() => {
    if (isVoiceActive && isSpeechRecognitionSupported()) {
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
  }, [isVoiceActive]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      stopRadarInternal();
      stopListening();
      stopSpeaking();
    };
  }, []);

  // Add item to unified feed
  const addFeedItem = (item: Omit<FeedItem, 'id' | 'timestamp'>) => {
    const newItem: FeedItem = {
      ...item,
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    setFeedItems((prev) => [...prev, newItem]);
  };

  // =========================================================================
  // CAMERA STREAM & REAL-TIME RADAR ENGINE
  // =========================================================================

  const startCamera = async (): Promise<boolean> => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        setIsCameraActive(true);
        return true;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        return true;
      }
      return false;
    } catch (err: any) {
      console.warn('[UnifiedCoPilot] Camera access failed:', err);
      const msg = 'Unable to access camera. Please check browser permissions.';
      addFeedItem({ type: 'system', content: msg });
      speakText(msg);
      return false;
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const captureFrameBase64 = (): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return null;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    return dataUrl.split(',')[1] || null;
  };

  const startRadar = async () => {
    if (isRadarScanningRef.current) return;

    // Reset inspection media if transitioning to live radar
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileBase64(null);
    setActiveAnalysisResult(null);

    const cameraStarted = await startCamera();
    if (!cameraStarted) return;

    setMode('radar');
    setIsRadarScanning(true);
    isRadarScanningRef.current = true;
    setSessionSeconds(0);
    sessionIdRef.current += 1;
    const currentSessionId = sessionIdRef.current;

    stopSpeaking();
    const startMsg = 'Live Surroundings Radar started. Scanning walking path every five seconds.';
    addFeedItem({ type: 'system', content: startMsg });
    speakText(startMsg, () => {
      // Begin first radar frame analysis
      if (isRadarScanningRef.current && sessionIdRef.current === currentSessionId) {
        processCadenceCycle(currentSessionId);
      }
    });

    // Session timer for safety cap
    if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    sessionTimerRef.current = setInterval(() => {
      setSessionSeconds((prev) => {
        if (prev >= MAX_SESSION_SECONDS) {
          stopRadar('Session limit reached (5 minutes). Radar paused.');
          return prev;
        }
        return prev + 1;
      });
    }, 1000);
  };

  const stopRadarInternal = () => {
    isRadarScanningRef.current = false;
    setIsRadarScanning(false);
    sessionIdRef.current += 1;

    if (cadenceTimerRef.current) {
      clearTimeout(cadenceTimerRef.current);
      cadenceTimerRef.current = null;
    }
    if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
      sessionTimerRef.current = null;
    }
    stopCamera();
  };

  const stopRadar = (reason?: string) => {
    stopRadarInternal();
    setMode('standby');
    stopSpeaking();
    const notice = reason || 'Surroundings Radar paused.';
    addFeedItem({ type: 'system', content: notice });
    speakText(notice);
  };

  const processCadenceCycle = async (sessionId: number) => {
    if (!isRadarScanningRef.current || sessionId !== sessionIdRef.current) return;
    if (isProcessingRef.current || isEchoSightSpeaking) {
      cadenceTimerRef.current = setTimeout(() => processCadenceCycle(sessionId), 1000);
      return;
    }

    try {
      isProcessingRef.current = true;
      setIsAnalyzingFrame(true);

      const frameBase64 = captureFrameBase64();
      if (!frameBase64) {
        isProcessingRef.current = false;
        setIsAnalyzingFrame(false);
        if (isRadarScanningRef.current) {
          cadenceTimerRef.current = setTimeout(() => processCadenceCycle(sessionId), 2000);
        }
        return;
      }

      const result = await callTool('describe_surroundings', {
        image_base64: frameBase64,
        mime_type: 'image/jpeg',
        previous_frame_base64: prevFrameRef.current || undefined,
        prior_context: priorContextRef.current || undefined,
      });

      if (!isRadarScanningRef.current || sessionId !== sessionIdRef.current) return;

      prevFrameRef.current = frameBase64;
      priorContextRef.current = result.spokenText;

      if (!result.isUnchanged) {
        addFeedItem({
          type: 'radar',
          title: 'Sensory Observation',
          content: result.spokenText,
          proactiveInsight: result.proactiveInsight,
        });

        speakText(result.spokenText, () => {
          if (isRadarScanningRef.current && sessionId === sessionIdRef.current) {
            cadenceTimerRef.current = setTimeout(
              () => processCadenceCycle(sessionId),
              cadenceSeconds * 1000
            );
          }
        });
      } else {
        cadenceTimerRef.current = setTimeout(
          () => processCadenceCycle(sessionId),
          cadenceSeconds * 1000
        );
      }
    } catch (err: any) {
      console.warn('[UnifiedCoPilot] Radar cadence error:', err);
    } finally {
      isProcessingRef.current = false;
      setIsAnalyzingFrame(false);
    }
  };

  // =========================================================================
  // SNAPSHOT FREEZE-FRAME & FILE PICKER ENGINE
  // =========================================================================

  const handleCaptureSnapshot = async (autoAnalyze: boolean = false) => {
    if (isCapturingPhotoRef.current) return;
    isCapturingPhotoRef.current = true;

    stopSpeaking();
    speakText(autoAnalyze ? 'Capturing snapshot and analyzing...' : 'Accessing camera. Please hold steady...');

    try {
      // If camera is already active in radar mode, capture immediately from live stream
      let frameDataUrl: string | null = null;

      if (isCameraActive && videoRef.current) {
        const base64 = captureFrameBase64();
        if (base64) {
          frameDataUrl = `data:image/jpeg;base64,${base64}`;
        }
      }

      // If camera is not running, spin up temporary stream
      if (!frameDataUrl) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();
        await new Promise((r) => setTimeout(r, 450));

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        stream.getTracks().forEach((track) => track.stop());

        frameDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      }

      // If radar was active, pause it cleanly while examining snapshot
      if (isRadarScanningRef.current) {
        stopRadarInternal();
      }

      // Convert dataUrl to File & Base64
      const res = await fetch(frameDataUrl);
      const blob = await res.blob();
      const file = new File([blob], `camera-snapshot-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const base64 = frameDataUrl.split(',')[1];

      setMode('inspection');
      setSelectedFile(file);
      setDetectedType('image');
      setPreviewUrl(frameDataUrl);
      setFileBase64(base64);
      setActiveAnalysisResult(null);
      setIsAwaitingFileTap(false);

      addFeedItem({
        type: 'system',
        content: `Captured camera snapshot: ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
      });

      if (autoAnalyze) {
        runExhaustiveAnalysis(file, base64, 'image');
      } else {
        speakText('Snapshot captured. Say "analyze it" to begin exhaustive breakdown, or ask a question.');
      }
    } catch (err: any) {
      console.warn('[UnifiedCoPilot] Camera snapshot failed:', err);
      speakText('Could not capture camera snapshot. Please select a file instead.');
    } finally {
      isCapturingPhotoRef.current = false;
    }
  };

  const triggerFilePicker = () => {
    setInterimSpeech('');
    stopSpeaking();

    // If radar was active, pause it
    if (isRadarScanningRef.current) {
      stopRadarInternal();
    }

    setIsAwaitingFileTap(true);
    try {
      fileInputRef.current?.click();
    } catch (e) {
      console.warn('[UnifiedCoPilot] File picker click blocked by browser:', e);
    }
    speakText('Opening file picker. Tap anywhere on screen or press Enter to choose your media.');
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
    const mediaType: 'image' | 'video' = isVideo ? 'video' : 'image';

    setMode('inspection');
    setIsAwaitingFileTap(false);
    setSelectedFile(file);
    setDetectedType(mediaType);
    setPreviewUrl(URL.createObjectURL(file));
    setActiveAnalysisResult(null);

    try {
      const base64 = await readFileAsBase64(file);
      setFileBase64(base64);
      addFeedItem({
        type: 'system',
        content: `Loaded ${file.name} (${(file.size / 1024).toFixed(0)} KB)`,
      });
      speakText(`${file.name} loaded. Say "analyze it" to begin exhaustive breakdown.`);
    } catch (err: any) {
      setErrorMessage('Failed to read file: ' + err.message);
    }

    if (e.target) e.target.value = '';
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // =========================================================================
  // DEEP EXHAUSTIVE MULTIMODAL ANALYSIS
  // =========================================================================

  const runExhaustiveAnalysis = async (
    fileToAnalyze = selectedFileRef.current,
    base64ToAnalyze = fileBase64Ref.current,
    typeToAnalyze = detectedTypeRef.current
  ) => {
    if (!fileToAnalyze || !base64ToAnalyze) {
      speakText('No media loaded. Say "take a photo" or "pick a file" first.');
      return;
    }

    const token = ++queryTokenRef.current;
    setIsAnalyzingMedia(true);
    setErrorMessage(null);
    setInterruptionNotice(null);
    stopSpeaking();
    speakText('Analyzing your media in exhaustive detail...');

    try {
      let result: ToolResult;
      const mimeType = fileToAnalyze.type || (typeToAnalyze === 'video' ? 'video/mp4' : 'image/jpeg');

      if (typeToAnalyze === 'video') {
        result = await callTool('analyze_video', {
          video_base64: base64ToAnalyze,
          mime_type: mimeType,
        });
      } else if (/scorecard|cricket|match/i.test(fileToAnalyze.name)) {
        result = await callTool('analyze_scorecard', {
          image_base64: base64ToAnalyze,
          mime_type: mimeType,
        });
      } else {
        result = await callTool('analyze_visual', {
          image_base64: base64ToAnalyze,
          mime_type: mimeType,
        });
      }

      if (token !== queryTokenRef.current) return;

      setActiveAnalysisResult(result);
      priorContextRef.current = result.detailedText;

      addFeedItem({
        type: 'analysis',
        title: 'Exhaustive Visual Breakdown',
        content: result.spokenText,
        proactiveInsight: result.proactiveInsight,
        detailedText: result.detailedText,
      });

      if (result.spokenText) {
        speakText(result.spokenText);
      }
    } catch (err: any) {
      if (token === queryTokenRef.current) {
        setErrorMessage(err.message || 'Analysis failed. Please check connection and try again.');
        speakText('Sorry, I had trouble analyzing that media.');
      }
    } finally {
      if (token === queryTokenRef.current) {
        setIsAnalyzingMedia(false);
      }
    }
  };

  // =========================================================================
  // UNIVERSAL CONVERSATIONAL Q&A (CONTINUOUS BARGE-IN)
  // =========================================================================

  const executeFollowupQuery = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) return;

    // Instant interruption of any ongoing speech
    stopSpeaking();
    setIsSpeaking(false);
    setInterruptionNotice(`Answering: "${trimmed}"`);

    const token = ++queryTokenRef.current;
    setIsAnsweringFollowup(true);
    setErrorMessage(null);
    setFollowupText('');
    setInterimSpeech('');

    try {
      // Determine image to accompany query
      let imageBase64: string | undefined = undefined;
      let mimeType: string | undefined = undefined;

      if (modeRef.current === 'radar' && isCameraActive) {
        const liveFrame = captureFrameBase64();
        if (liveFrame) {
          imageBase64 = liveFrame;
          mimeType = 'image/jpeg';
        }
      } else if (modeRef.current === 'inspection' && fileBase64Ref.current) {
        imageBase64 = fileBase64Ref.current;
        mimeType = selectedFileRef.current?.type || 'image/jpeg';
      }

      const result = await callTool('ask_followup', {
        question: trimmed,
        prior_context: priorContextRef.current || 'User is interacting with EchoSight.',
        image_base64: imageBase64,
        mime_type: mimeType,
      });

      if (token !== queryTokenRef.current) return;

      const answer = result.spokenText || result.detailedText;
      addFeedItem({
        type: 'followup',
        title: `Q: ${trimmed}`,
        content: answer,
      });

      if (result.spokenText) {
        speakText(result.spokenText);
      }
    } catch (err: any) {
      if (token === queryTokenRef.current) {
        setErrorMessage(`Follow-up error: ${err.message}`);
        speakText('Sorry, I could not answer that.');
      }
    } finally {
      if (token === queryTokenRef.current) {
        setIsAnsweringFollowup(false);
      }
    }
  };

  const handleFollowupSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (followupText.trim()) {
      executeFollowupQuery(followupText.trim());
    }
  };

  // =========================================================================
  // VOICE COMMAND PARSER (UNIFIED ACROSS RADAR & INSPECTION)
  // =========================================================================

  const isStartRadarCommand = (text: string): boolean => {
    return (
      /\b(start|begin|resume|run|launch)\b.*\b(camera|surroundings|radar|walking|guide|sight)\b/i.test(text) ||
      /^(start camera|start surroundings|start radar|start walking|describe surroundings|start)$/i.test(text)
    );
  };

  const isCameraCaptureCommand = (text: string): boolean => {
    return (
      /\b(take|snap|capture|freeze|grab)\b.*\b(photo|picture|camera|image|snap|snapshot|frame)\b/i.test(text) ||
      /^(take a photo|snap photo|capture snapshot|take snapshot|capture snap|snap|freeze frame)$/i.test(text)
    );
  };

  const isAnalyzeCommand = (text: string): boolean => {
    return (
      /\banaly[zs]e\b/i.test(text) ||
      /\b(explain|describe|read|deconstruct|inspect|examine)\s*(this|it|image|photo|video|picture|snap|file|scorecard|chart|match)?\b/i.test(text) ||
      /\b(start|run|begin|do)\s*(analysis|reasoning|walkthrough)\b/i.test(text) ||
      /\bwhat('s| is)\s*(in this|this|it|in the image|in the photo|here)\b/i.test(text) ||
      /\btell me (about this|what('s| is) (in this|here)|what you see)\b/i.test(text) ||
      /^(analyze|analyse|explain|describe|read)$/i.test(text)
    );
  };

  const isFilePickerCommand = (text: string): boolean => {
    // If media is already loaded and user says "analyze", prioritize analysis
    if (fileBase64Ref.current && isAnalyzeCommand(text)) {
      return false;
    }
    return (
      /\b(open|show|launch|start|display)\b.*\b(file\s*picker|picker|chooser|dialog|files?)\b/i.test(text) ||
      /\bfile\s*picker\b/i.test(text) ||
      /\b(upload|choose|select|pick|browse|load)\b.*\b(file|image|video|photo|picture|media|chart|scorecard|graphic)\b/i.test(text) ||
      /^(upload|choose file|select file|pick file|browse|open picker|file picker)$/i.test(text)
    );
  };

  const isStopCommand = (text: string): boolean => {
    return (
      text.includes('stop') ||
      text.includes('pause') ||
      text.includes("that's enough") ||
      text.includes('quiet') ||
      text.includes('shut up') ||
      text.includes('be quiet') ||
      text.includes('silence')
    );
  };

  const handleVoiceCommand = (command: string) => {
    const lower = command.toLowerCase().trim();
    setInterimSpeech('');

    if (!lower || lower === 'enter' || lower === 'inter') return;

    // 0. Disable voice control triggers
    if (
      lower.includes('disable voice') ||
      lower.includes('turn off voice') ||
      lower.includes('stop voice control') ||
      lower.includes('stop listening') ||
      lower.includes('mute mic')
    ) {
      markCommandHandled(command);
      updateVoiceActive(false);
      stopListening();
      speakText('Voice control paused. Tap the microphone button to re-enable.');
      return;
    }

    // 1. Snapshot / Photo capture command
    if (isCameraCaptureCommand(lower)) {
      markCommandHandled(command);
      const autoAnalyze =
        lower.includes('analyze') ||
        lower.includes('analyse') ||
        lower.includes('explain') ||
        lower.includes('describe');
      handleCaptureSnapshot(autoAnalyze);
      return;
    }

    // 2. Start Radar / Camera command
    if (isStartRadarCommand(lower)) {
      markCommandHandled(command);
      startRadar();
      return;
    }

    // 3. Stop Radar / Audio silence command
    if (isStopCommand(lower)) {
      markCommandHandled(command);
      if (isRadarScanningRef.current) {
        stopRadar();
      } else {
        stopSpeaking();
        setIsSpeaking(false);
      }
      return;
    }

    // 4. Trigger exhaustive analysis on loaded media
    if (fileBase64Ref.current && isAnalyzeCommand(lower)) {
      markCommandHandled(command);
      runExhaustiveAnalysis();
      return;
    }

    // 5. Open file picker
    if (isFilePickerCommand(lower)) {
      markCommandHandled(command);
      triggerFilePicker();
      return;
    }

    // 6. If no media is loaded and user says "analyze", guide them
    if (!fileBase64Ref.current && !isRadarScanningRef.current && isAnalyzeCommand(lower)) {
      markCommandHandled(command);
      speakText('No media loaded yet. Say "start surroundings" for live walking radar, or "take a photo" to analyze.');
      return;
    }

    // 7. General follow-up question (answers using active camera or snapshot context)
    executeFollowupQuery(command);
  };

  const handleInterimSpeech = (interim: string) => {
    setInterimSpeech(interim);
    const lower = interim.toLowerCase().trim();

    // Instant barge-in: Silence AI speech immediately when user begins speaking
    if (interim.trim() && (window.speechSynthesis?.speaking || isEchoSightSpeaking)) {
      stopSpeaking();
      setIsSpeaking(false);
      setInterruptionNotice('Interrupted: listening to you...');
    }

    // Fast-path: immediate stop on interim trigger
    if (isStopCommand(lower) && isRadarScanningRef.current) {
      markCommandHandled(lower);
      stopRadar();
    }
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // =========================================================================
  // RENDER UNIFIED COCKPIT
  // =========================================================================

  return (
    <div className="space-y-6">
      {/* Hidden DOM elements for camera capture and file choosing */}
      <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
        onChange={handleFileChange}
        className="sr-only"
        aria-hidden="true"
      />

      {/* Unified Media Viewport & Command Stage */}
      <section aria-labelledby="stage-heading" className="card space-y-4">
        {/* Header with Mode Status & Voice Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-neutral)] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 id="stage-heading" className="text-xl font-semibold text-[var(--text-primary)]">
                Voice Co-Pilot
              </h2>
              {/* Dynamic Status Pill */}
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border flex items-center gap-1.5 ${
                  mode === 'radar'
                    ? 'bg-[var(--status-listening-bg)] text-[var(--status-listening-text)] border-[var(--status-listening-border)]'
                    : mode === 'inspection'
                    ? 'bg-[var(--bg-subtle)] text-[var(--accent-primary)] border-[var(--accent-primary)]'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-neutral)]'
                }`}
                role="status"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    mode === 'radar'
                      ? 'bg-[var(--status-listening-text)] animate-ping'
                      : mode === 'inspection'
                      ? 'bg-[var(--accent-primary)]'
                      : 'bg-[var(--text-secondary)]'
                  }`}
                />
                <span>
                  {mode === 'radar'
                    ? isAnalyzingFrame
                      ? 'Radar (Reasoning)'
                      : 'Radar (Scanning ~5s)'
                    : mode === 'inspection'
                    ? isAnalyzingMedia
                      ? 'Analyzing Media'
                      : 'Inspection Stage'
                    : 'Standby'}
                </span>
              </span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              Hands-free visual co-pilot. Say &quot;start surroundings&quot;, &quot;take a photo&quot;, or &quot;pick a file&quot;.
            </p>
          </div>

          {/* Voice Control Toggle */}
          <div className="flex items-center gap-2">
            {isSpeechRecognitionSupported() && (
              <button
                type="button"
                onClick={toggleVoiceControl}
                className={`btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 rounded-[var(--radius-sm)] ${
                  isVoiceActive
                    ? 'border-[var(--status-listening-border)] bg-[var(--status-listening-bg)] text-[var(--status-listening-text)] font-semibold'
                    : ''
                }`}
                aria-pressed={isVoiceActive}
                aria-label={isVoiceActive ? 'Disable voice control' : 'Enable voice control'}
              >
                {isVoiceActive ? (
                  <>
                    <Mic className="h-4 w-4" aria-hidden="true" />
                    <span>Voice: Active</span>
                  </>
                ) : (
                  <>
                    <MicOff className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
                    <span>Enable Voice</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Live Speech Feedback Bar */}
        {((isVoiceActive && interimSpeech) || isSpeaking) && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs p-2.5 rounded-[var(--radius-sm)] bg-[var(--bg-subtle)] border border-[var(--border-neutral)]">
            <div className="flex items-center gap-2">
              {isVoiceActive && interimSpeech && (
                <span className="text-[var(--accent-primary)] italic font-medium animate-pulse">
                  Heard: &quot;{interimSpeech}&quot;
                </span>
              )}
            </div>

            {isSpeaking && (
              <div className="flex items-center gap-2">
                <span className="text-[var(--accent-primary)] font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                  EchoSight Speaking (say Stop or ask a question to interrupt)
                </span>
                <button
                  onClick={() => {
                    stopSpeaking();
                    setIsSpeaking(false);
                  }}
                  className="btn-secondary text-xs py-0.5 px-2 flex items-center gap-1"
                  aria-label="Silence audio"
                >
                  <VolumeX className="h-3 w-3" aria-hidden="true" />
                  <span>Silence</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Active Voice Activation Banner when waiting for user tap/key */}
        {isAwaitingFileTap && (
          <button
            type="button"
            onClick={() => {
              fileInputRef.current?.click();
              setIsAwaitingFileTap(false);
            }}
            className="w-full p-3.5 rounded-[var(--radius-md)] border-2 border-[var(--accent-primary)] bg-[var(--status-listening-bg)] text-[var(--text-primary)] flex items-center justify-between text-left transition-colors"
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

        {/* Dynamic Media Viewport (Camera Stream OR Snapshot/Uploaded Media) */}
        <div className="relative aspect-video max-h-72 w-full overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-neutral)] bg-black flex items-center justify-center">
          {/* 1. Live Video Viewfinder */}
          <video
            ref={videoRef}
            playsInline
            muted
            className={`h-full w-full object-cover ${
              mode === 'radar' && isCameraActive ? 'block' : 'hidden'
            }`}
            aria-label="Live camera viewfinder"
          />

          {/* 2. Inspection Media Preview (Captured snapshot or uploaded file) */}
          {mode === 'inspection' && previewUrl && (
            <div className="h-full w-full flex items-center justify-center bg-black">
              {detectedType === 'video' ? (
                <video src={previewUrl} controls className="h-full w-full object-contain" />
              ) : (
                <img src={previewUrl} alt="Captured preview" className="h-full w-full object-contain" />
              )}
            </div>
          )}

          {/* 3. Standby Placeholder */}
          {mode === 'standby' && (
            <div className="text-center p-6 space-y-2 text-white">
              <Eye className="mx-auto h-12 w-12 text-[var(--accent-primary)] opacity-80" aria-hidden="true" />
              <p className="text-base font-semibold">Workspace Ready</p>
              <p className="text-xs text-slate-300 max-w-sm mx-auto">
                Say &quot;start surroundings&quot; for real-time walking guidance, &quot;take a photo&quot; to inspect an object, or &quot;pick a file&quot;.
              </p>
            </div>
          )}

          {/* In-Viewport Radar HUD Banner */}
          {mode === 'radar' && isRadarScanning && (
            <div className="absolute bottom-3 left-3 right-3 rounded-[var(--radius-sm)] bg-black/75 backdrop-blur-md px-3 py-1.5 text-xs text-white border border-white/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                <span className="font-semibold">Walking Radar Active</span>
              </div>
              <span className="font-mono text-slate-300">
                {formatTime(sessionSeconds)} / {formatTime(MAX_SESSION_SECONDS)}
              </span>
            </div>
          )}

          {/* In-Viewport Inspection Banner */}
          {mode === 'inspection' && selectedFile && (
            <div className="absolute top-3 left-3 rounded-[var(--radius-sm)] bg-black/75 backdrop-blur-md px-2.5 py-1 text-xs text-white border border-white/20 flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              <span className="truncate max-w-[200px]">{selectedFile.name}</span>
            </div>
          )}
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Radar Start/Stop Button */}
          {mode === 'radar' ? (
            <button
              type="button"
              onClick={() => stopRadar()}
              className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white"
              aria-label="Stop live walking radar"
            >
              <StopCircle className="h-4 w-4" />
              <span>Stop Radar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startRadar()}
              className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-2"
              aria-label="Start live walking radar"
            >
              <Play className="h-4 w-4" />
              <span>Start Radar</span>
            </button>
          )}

          {/* Snap Photo Button */}
          <button
            type="button"
            onClick={() => handleCaptureSnapshot(false)}
            disabled={isCapturingPhotoRef.current}
            className="btn-secondary py-2 px-3 text-xs font-semibold flex items-center gap-1.5"
            aria-label="Capture camera snapshot"
          >
            <Camera className="h-4 w-4 text-[var(--accent-primary)]" />
            <span>Snap Photo</span>
          </button>

          {/* Choose File Button */}
          <button
            type="button"
            onClick={triggerFilePicker}
            className="btn-secondary py-2 px-3 text-xs font-semibold flex items-center gap-1.5"
            aria-label="Open file picker to upload media"
          >
            <Upload className="h-4 w-4 text-[var(--text-secondary)]" />
            <span>Upload File</span>
          </button>

          {/* Deep Analyze Button (Enabled when media/snapshot is ready) */}
          {mode === 'inspection' && selectedFile && (
            <button
              type="button"
              onClick={() => runExhaustiveAnalysis()}
              disabled={isAnalyzingMedia}
              className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5 ml-auto"
            >
              {isAnalyzingMedia ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span>Analyzing in Detail...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  <span>Explain in Exhaustive Detail</span>
                </>
              )}
            </button>
          )}

          {/* Reset / Return to Radar button */}
          {mode === 'inspection' && (
            <button
              type="button"
              onClick={() => {
                setSelectedFile(null);
                setPreviewUrl(null);
                setFileBase64(null);
                setActiveAnalysisResult(null);
                setMode('standby');
                speakText('Returned to standby. Say "start surroundings" to resume walking radar.');
              }}
              className="btn-secondary py-2 px-3 text-xs font-semibold ml-auto"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Notices & Alerts */}
      {interruptionNotice && (
        <div
          role="status"
          aria-live="polite"
          className="p-3 rounded-[var(--radius-sm)] border border-[var(--accent-primary)] bg-[var(--bg-subtle)] text-[var(--text-primary)] flex items-center justify-between text-xs"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
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

      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-3 rounded-[var(--radius-sm)] border border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 flex items-center justify-between text-xs"
        >
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="font-semibold ml-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Unified Sensory, Analysis & Conversational Feed */}
      <section aria-labelledby="feed-heading" className="card space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border-neutral)] pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--accent-primary)]" />
            <h3 id="feed-heading" className="text-base font-semibold text-[var(--text-primary)]">
              Sensory Intelligence Feed
            </h3>
          </div>

          {activeAnalysisResult && (
            <button
              type="button"
              onClick={() => {
                if (isSpeaking) {
                  stopSpeaking();
                  setIsSpeaking(false);
                } else if (activeAnalysisResult.spokenText) {
                  speakText(activeAnalysisResult.spokenText);
                }
              }}
              className="btn-secondary text-xs flex items-center gap-1.5 py-1 px-2.5"
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="h-3.5 w-3.5" />
                  <span>Silence</span>
                </>
              ) : (
                <>
                  <Volume2 className="h-3.5 w-3.5" />
                  <span>Read Aloud</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Empty State */}
        {feedItems.length === 0 && (
          <div className="py-8 text-center space-y-2 border border-dashed border-[var(--border-neutral)] rounded-[var(--radius-md)] p-4">
            <Eye className="mx-auto h-8 w-8 text-[var(--text-secondary)] opacity-60" />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              No sensory events yet
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
              Start the walking radar to detect obstacles, capture a snapshot to examine an object, or ask any question.
            </p>
          </div>
        )}

        {/* Isolated Scrollable Container */}
        {feedItems.length > 0 && (
          <div
            ref={feedContainerRef}
            className="max-h-96 overflow-y-auto space-y-3 pr-1"
            role="log"
            aria-live="polite"
          >
            {feedItems.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-[var(--radius-sm)] border space-y-1.5 transition-colors ${
                  item.type === 'radar'
                    ? 'border-emerald-500/40 bg-emerald-50/40 dark:bg-emerald-950/20'
                    : item.type === 'analysis'
                    ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)]'
                    : item.type === 'followup'
                    ? 'border-[var(--border-neutral)] bg-[var(--bg-surface)]'
                    : 'border-[var(--border-neutral)] bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <span className="font-semibold uppercase tracking-wider text-[var(--text-primary)]">
                    {item.title || (item.type === 'radar' ? 'Radar Event' : item.type === 'analysis' ? 'Analysis' : 'System')}
                  </span>
                  <span className="font-mono text-[11px]">{item.timestamp}</span>
                </div>

                {/* Proactive Takeaway highlight if present */}
                {item.proactiveInsight && (
                  <div className="p-2 rounded bg-[var(--bg-surface)] border-l-2 border-l-[var(--accent-primary)] text-xs font-semibold text-[var(--text-primary)]">
                    Takeaway: {item.proactiveInsight}
                  </div>
                )}

                {/* Content */}
                <p className="text-sm text-[var(--text-primary)] leading-relaxed">
                  {item.content}
                </p>

                {/* Exhaustive Detailed Breakdown if present */}
                {item.detailedText && (
                  <details className="pt-2 text-xs text-[var(--text-secondary)]">
                    <summary className="cursor-pointer font-semibold hover:text-[var(--text-primary)]">
                      View Comprehensive Written Architecture
                    </summary>
                    <div className="mt-2 p-2.5 rounded bg-[var(--bg-surface)] border border-[var(--border-neutral)] whitespace-pre-wrap font-sans text-xs text-[var(--text-primary)] leading-relaxed">
                      {item.detailedText}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Conversational Follow-Up Input (Available anytime to interrupt and ask questions) */}
        <form onSubmit={handleFollowupSubmit} className="pt-3 border-t border-[var(--border-neutral)] flex gap-2">
          <label htmlFor="copilot-followup-input" className="sr-only">
            Ask a question or speak an inquiry
          </label>
          <input
            id="copilot-followup-input"
            type="text"
            value={followupText}
            onChange={(e) => setFollowupText(e.target.value)}
            placeholder={
              isSpeaking
                ? "Type question to interrupt narration (or speak aloud)..."
                : "Ask about your surroundings or media (e.g. 'Is the door open?', 'What's the score?')"
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
                isVoiceActive ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]' : ''
              }`}
              aria-label={isVoiceActive ? 'Mute voice' : 'Ask question with voice'}
            >
              {isVoiceActive ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </button>
          )}
          <button
            type="submit"
            disabled={!followupText.trim() || isAnsweringFollowup}
            className="btn-secondary whitespace-nowrap text-xs font-semibold px-4"
          >
            {isAnsweringFollowup ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" />
                <span>Ask</span>
              </span>
            )}
          </button>
        </form>
      </section>
    </div>
  );
}
