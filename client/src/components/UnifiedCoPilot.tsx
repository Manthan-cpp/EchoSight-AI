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
  MapPin,
  Trash2,
  X,
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

export interface SpatialPin {
  id: string;
  item: string;
  location: string;
  landmark: string;
  timestamp: string;
  createdAt: number;
}

interface FeedItem {
  id: string;
  timestamp: string;
  type: 'radar' | 'analysis' | 'followup' | 'system' | 'spatial';
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
  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const sessionSecondsRef = useRef<number>(0);
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

  // --- Spatial Memory State (Persistent 3D Object Pinning) ---
  const [spatialPins, setSpatialPins] = useState<SpatialPin[]>(() => {
    try {
      const saved = localStorage.getItem('echosight_spatial_pins');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.warn('[UnifiedCoPilot] Failed to load spatial pins from localStorage:', e);
      return [];
    }
  });
  const [isPinningObject, setIsPinningObject] = useState<boolean>(false);
  const [isLocatingObject, setIsLocatingObject] = useState<boolean>(false);

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
  const spatialPinsRef = useRef<SpatialPin[]>(spatialPins);

  // Synchronize spatial pins with localStorage and ref
  useEffect(() => {
    spatialPinsRef.current = spatialPins;
    try {
      localStorage.setItem('echosight_spatial_pins', JSON.stringify(spatialPins));
    } catch (e) {
      console.warn('[UnifiedCoPilot] Failed to save spatial pins:', e);
    }
  }, [spatialPins]);

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

  const startCamera = async (facing: 'environment' | 'user' = cameraFacing): Promise<boolean> => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        setIsCameraActive(true);
        return true;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        // Wait 450ms for camera auto-exposure and white balance calibration
        await new Promise((r) => setTimeout(r, 450));
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

  const handleToggleCamera = async () => {
    const nextFacing = cameraFacing === 'environment' ? 'user' : 'environment';
    setCameraFacing(nextFacing);
    stopCamera();
    prevFrameRef.current = null;
    priorContextRef.current = '';
    const success = await startCamera(nextFacing);
    if (success) {
      const label = nextFacing === 'environment' ? 'rear back camera' : 'front selfie camera';
      speakText(`Switched to ${label}.`);
      addFeedItem({ type: 'system', content: `Camera switched to ${label}.` });
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

    // Constrain resolution to max 640px for instant encoding and sub-second API transport
    const maxDim = 640;
    let width = video.videoWidth || 640;
    let height = video.videoHeight || 480;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round((height * maxDim) / width);
        width = maxDim;
      } else {
        width = Math.round((width * maxDim) / height);
        height = maxDim;
      }
    }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.70);
    return dataUrl.split(',')[1] || null;
  };

  const startRadar = async () => {
    if (isRadarScanningRef.current) return;

    // Reset inspection media if transitioning to live radar
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileBase64(null);
    setActiveAnalysisResult(null);
    prevFrameRef.current = null;
    priorContextRef.current = '';

    const cameraStarted = await startCamera();
    if (!cameraStarted) return;

    setMode('radar');
    setIsRadarScanning(true);
    isRadarScanningRef.current = true;
    sessionSecondsRef.current = 0;
    sessionIdRef.current += 1;
    const currentSessionId = sessionIdRef.current;

    stopSpeaking();
    const startMsg = 'Live Surroundings Radar started. Scanning walking path.';
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
      sessionSecondsRef.current += 1;
      if (sessionSecondsRef.current >= MAX_SESSION_SECONDS) {
        stopRadar('Session limit reached (5 minutes). Radar paused.');
      }
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

      if (result.spokenText) {
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
        if (isRadarScanningRef.current && sessionId === sessionIdRef.current) {
          cadenceTimerRef.current = setTimeout(
            () => processCadenceCycle(sessionId),
            cadenceSeconds * 1000
          );
        }
      }
    } catch (err: any) {
      console.warn('[UnifiedCoPilot] Radar cadence error:', err);
      if (isRadarScanningRef.current && sessionId === sessionIdRef.current) {
        cadenceTimerRef.current = setTimeout(
          () => processCadenceCycle(sessionId),
          2000
        );
      }
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

    // Direct routing: if inquiry is asking where an item is or was kept, query spatial memory
    if (isWhereIsCommand(trimmed)) {
      handleLocateObject(trimmed);
      return;
    }

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
        spatial_pins_json:
          spatialPinsRef.current.length > 0
            ? JSON.stringify(spatialPinsRef.current)
            : undefined,
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
    const query = followupText.trim();
    if (!query) return;

    if (isWhereIsCommand(query)) {
      setFollowupText('');
      handleLocateObject(query);
      return;
    }

    executeFollowupQuery(query);
  };

  // =========================================================================
  // SPATIAL MEMORY & OBJECT PINNING ENGINE
  // =========================================================================

  const handlePinObject = async (itemName?: string) => {
    if (isPinningObject) return;
    setIsPinningObject(true);
    setErrorMessage(null);
    stopSpeaking();

    const targetName = itemName && itemName.trim() ? itemName.trim() : 'object in view';
    speakText(`Pinning ${targetName}. Please hold steady while I locate permanent landmarks...`);

    try {
      let base64: string | null = null;

      // 1. Try currently active camera
      if (isCameraActive && videoRef.current) {
        base64 = captureFrameBase64();
      }

      // 2. If no active camera, check if inspection media is loaded
      if (!base64 && fileBase64Ref.current) {
        base64 = fileBase64Ref.current;
      }

      // 3. Otherwise capture a quick frame from environment camera
      if (!base64) {
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

        base64 = canvas.toDataURL('image/jpeg', 0.82).split(',')[1];
      }

      if (!base64) {
        throw new Error('Unable to capture camera frame for spatial pinning.');
      }

      const result = await callTool('pin_spatial_object', {
        image_base64: base64,
        item_name: targetName,
        mime_type: 'image/jpeg',
      });

      const detectedItem =
        targetName === 'object in view' && result.proactiveInsight
          ? result.proactiveInsight.replace(/^pinned:\s*/i, '')
          : targetName.charAt(0).toUpperCase() + targetName.slice(1);

      const newPin: SpatialPin = {
        id: `pin-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        item: detectedItem,
        location: result.spokenText,
        landmark: result.proactiveInsight || 'Room Landmark',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        createdAt: Date.now(),
      };

      setSpatialPins((prev) => [
        newPin,
        ...prev.filter((p) => p.item.toLowerCase() !== detectedItem.toLowerCase()),
      ]);

      addFeedItem({
        type: 'spatial',
        title: `Pinned Object: ${newPin.item}`,
        content: result.spokenText,
        proactiveInsight: newPin.landmark,
        detailedText: result.detailedText,
      });

      speakText(result.spokenText);
    } catch (err: any) {
      console.warn('[UnifiedCoPilot] Pin spatial object error:', err);
      const msg = err.message || 'Failed to pin object.';
      setErrorMessage(msg);
      speakText('Sorry, I had trouble pinning that object. Please try again.');
    } finally {
      setIsPinningObject(false);
    }
  };

  const handleLocateObject = async (query: string) => {
    if (spatialPinsRef.current.length === 0) {
      const emptyMsg =
        "You don't have any pinned objects yet. Point your camera at an item and say 'remember where my keys are' to save its location.";
      addFeedItem({
        type: 'spatial',
        title: 'Spatial Memory Search',
        content: emptyMsg,
      });
      speakText(emptyMsg);
      return;
    }

    setIsLocatingObject(true);
    setErrorMessage(null);
    stopSpeaking();
    speakText('Checking spatial memory...');

    try {
      let liveFrame: string | undefined = undefined;
      if (isCameraActive && videoRef.current) {
        liveFrame = captureFrameBase64() || undefined;
      }

      const result = await callTool('locate_spatial_object', {
        query: query,
        spatial_pins_json: JSON.stringify(spatialPinsRef.current),
        current_frame_base64: liveFrame,
        mime_type: 'image/jpeg',
      });

      addFeedItem({
        type: 'spatial',
        title: `Spatial Query: ${query}`,
        content: result.spokenText,
        proactiveInsight: result.proactiveInsight,
        detailedText: result.detailedText,
      });

      speakText(result.spokenText);
    } catch (err: any) {
      console.warn('[UnifiedCoPilot] Locate spatial object error:', err);
      const msg = err.message || 'Failed to locate object.';
      setErrorMessage(msg);
      speakText('Sorry, I had trouble searching spatial memory.');
    } finally {
      setIsLocatingObject(false);
    }
  };

  const handleRemovePin = (id: string, itemName: string) => {
    setSpatialPins((prev) => prev.filter((p) => p.id !== id));
    speakText(`Removed ${itemName} from spatial memory.`);
    addFeedItem({
      type: 'system',
      content: `Removed ${itemName} from spatial memory registry.`,
    });
  };

  const handleClearAllPins = () => {
    setSpatialPins([]);
    speakText('Cleared all pinned objects from spatial memory.');
    addFeedItem({
      type: 'system',
      content: 'Cleared all pinned objects from spatial memory registry.',
    });
  };

  const handleListPins = () => {
    if (spatialPinsRef.current.length === 0) {
      const msg = "You haven't pinned any items yet. Say 'remember where my keys are' to track an item.";
      speakText(msg);
      addFeedItem({ type: 'spatial', title: 'Spatial Memory', content: msg });
      return;
    }

    const itemsSummary = spatialPinsRef.current
      .map((p) => `${p.item} (${p.landmark || p.location})`)
      .join(', ');
    const spoken = `You have ${spatialPinsRef.current.length} pinned item${
      spatialPinsRef.current.length > 1 ? 's' : ''
    }: ${itemsSummary}.`;

    speakText(spoken);
    addFeedItem({
      type: 'spatial',
      title: `Spatial Registry (${spatialPinsRef.current.length} items)`,
      content: spoken,
    });
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
      text.includes('silence') ||
      text.includes('halt') ||
      /\b(turn\s*off|close|disable|kill)\s*(the\s*)?(camera|radar|video|stream)\b/i.test(text)
    );
  };

  const extractPinnedItem = (text: string): string => {
    const lower = text.toLowerCase().trim();
    const rememberMatch = lower.match(
      /remember\s+(?:that\s+)?(?:where\s+)?(?:i\s+(?:put|left|placed)\s+)?(?:my\s+|the\s+|a\s+|an\s+)?([a-z0-9\s]+?)(?:\s+(?:is|are|was|were|here|on\s+the|at\s+the|to\s+the)|\.|$)/i
    );
    if (rememberMatch && rememberMatch[1]?.trim()) {
      const candidate = rememberMatch[1].trim();
      if (!['this', 'it', 'object', 'item', 'here', 'location', 'where', 'that'].includes(candidate)) {
        return candidate;
      }
    }
    const pinMatch = lower.match(
      /\b(?:pin|track|save|remember)\s+(?:the\s+location\s+of\s+)?(?:my\s+|the\s+|a\s+|an\s+)?([a-z0-9\s]+?)(?:\s+(?:here|on\s+the|to\s+the|at\s+the|is|are|was)|\.|$)/i
    );
    if (pinMatch && pinMatch[1]?.trim()) {
      const candidate = pinMatch[1].trim();
      if (!['this', 'it', 'object', 'item', 'here', 'location', 'where', 'that', 'location of'].includes(candidate)) {
        return candidate;
      }
    }
    return 'object in view';
  };

  const isPinCommand = (text: string): boolean => {
    const lower = text.toLowerCase().trim();

    // If it is an inquiry asking where an item was kept/left/placed, it is a lookup, NOT a pin!
    if (isWhereIsCommand(lower)) {
      return false;
    }

    return (
      /\b(?:pin|track|save|store|record)\b/i.test(lower) ||
      /\bremember\b/i.test(lower) ||
      /^(pin this|pin object|remember this|pin item|remember location|remember|remember item)$/i.test(lower)
    );
  };

  const isWhereIsCommand = (text: string): boolean => {
    const lower = text.toLowerCase().trim();

    // If it starts with an imperative command to remember / pin / save / record, it is a PIN action, NOT a search!
    if (/^(remember|pin|save|track|record|store)\b/i.test(lower)) {
      return false;
    }

    // 1. Direct retrieval questions (e.g. "Do you remember where I kept my smartphone?", "Now can you tell me where my smartphone is")
    if (
      /\b(?:do\s+you\s+remember|did\s+you\s+remember|can\s+you\s+tell\s+me|tell\s+me|show\s+me|know)\s+where\b/i.test(lower) ||
      /\bwhere\s+(?:did\s+i|have\s+i|can\s+i|was|is|are|'s)\b/i.test(lower) ||
      /\bwhere\s+(?:i\s+)?(?:kept|put|left|placed|set|dropped)\b/i.test(lower) ||
      /\bwhere\s+.*?\b(?:is|are|was|were)\b/i.test(lower) ||
      /\b(?:find|locate|search\s+for|look\s+for)\s+(?:my|the)\b/i.test(lower) ||
      /\b(?:have\s+you\s+seen|did\s+you\s+see)\s+(?:my|the)\b/i.test(lower)
    ) {
      return true;
    }

    // 2. Dynamic check: if user mentions any currently pinned item with an inquiry word
    if (spatialPinsRef.current && spatialPinsRef.current.length > 0) {
      const mentionsPinnedItem = spatialPinsRef.current.some((pin) =>
        lower.includes(pin.item.toLowerCase())
      );
      if (
        mentionsPinnedItem &&
        /\b(where|find|locate|which\s*room|where's|lost)\b/i.test(lower)
      ) {
        return true;
      }
    }

    return false;
  };

  const isListPinsCommand = (text: string): boolean => {
    return (
      /\b(what|which)\s+(items?|objects?|pins?)\s+(did\s+you\s+remember|are\s+pinned|have\s+i\s+pinned|are\s+saved)\b/i.test(text) ||
      /\b(list|show|what\s+are)\s+(my\s+)?(pins|pinned\s+items|memories|saved\s+items)\b/i.test(text) ||
      /^(what did i pin|what have i pinned|list pins|show pins|my pins)$/i.test(text)
    );
  };

  const isClearPinsCommand = (text: string): boolean => {
    return (
      /\b(clear|delete|forget|remove|reset)\s+(all\s+)?(pins|pinned\s+items|spatial\s+memory)\b/i.test(text)
    );
  };

  const isClearMediaCommand = (text: string): boolean => {
    const clean = text.toLowerCase().trim();
    return (
      /\b(clear|delete|remove|close|reset|discard|dismiss|cancel)\s+(the\s+)?(image|photo|picture|snapshot|media|capture|preview|camera|view)\b/i.test(clean) ||
      /\b(clear|delete|remove|close|discard)\s+(this|it)\b/i.test(clean) ||
      /^(clear|clear image|clear photo|clear snapshot|delete photo|delete image|remove image|remove photo|close image|reset image|reset snapshot|reset)$/i.test(clean)
    );
  };

  const handleClearMedia = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setFileBase64(null);
    fileBase64Ref.current = null;
    setActiveAnalysisResult(null);
    setIsAwaitingFileTap(false);
    setMode('standby');
    stopSpeaking();
    const msg = 'Snapshot cleared. Returned to standby. Say "start surroundings" or "take a photo".';
    addFeedItem({ type: 'system', content: 'Snapshot cleared. Returned to standby.' });
    speakText(msg);
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

    // 1. Stop Radar / Audio silence / Stop Camera command
    if (isStopCommand(lower)) {
      markCommandHandled(command);
      stopSpeaking();
      setIsSpeaking(false);
      if (isRadarScanningRef.current || isCameraActive || (videoRef.current && videoRef.current.srcObject)) {
        stopRadar('Camera and radar stopped.');
      }
      return;
    }

    // 2. Spatial Memory: Where is item query? ("Where did I put my water bottle?", "Where are my keys?")
    if (isWhereIsCommand(lower)) {
      markCommandHandled(command);
      handleLocateObject(command);
      return;
    }

    // 3. Spatial Memory: Pin item command ("Remember where my keys are", "Pin my water bottle")
    if (isPinCommand(lower)) {
      markCommandHandled(command);
      const item = extractPinnedItem(lower);
      handlePinObject(item);
      return;
    }

    // 4. Spatial Memory: List pinned items ("What did I pin?", "List pinned items")
    if (isListPinsCommand(lower)) {
      markCommandHandled(command);
      handleListPins();
      return;
    }

    // 5. Spatial Memory: Clear all pins ("Clear all pins")
    if (isClearPinsCommand(lower)) {
      markCommandHandled(command);
      handleClearAllPins();
      return;
    }

    // 5b. Clear snapshot / media command ("Clear image", "Clear photo", "Clear snapshot", "Clear it")
    if (
      isClearMediaCommand(lower) &&
      (fileBase64Ref.current || selectedFile || previewUrl || mode === 'inspection')
    ) {
      markCommandHandled(command);
      handleClearMedia();
      return;
    }

    // 6. Snapshot / Photo capture command
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

    // 7. Start Radar / Camera command
    if (isStartRadarCommand(lower)) {
      markCommandHandled(command);
      startRadar();
      return;
    }

    // 7b. Camera flip / toggle command ("Flip camera", "Switch camera", "Rear camera", "Front camera")
    if (
      /\b(flip|switch|toggle|change|reverse)\s+(the\s+)?camera\b/i.test(lower) ||
      /\b(switch|flip)\s+(to\s+)?(front|back|rear|selfie)\s+camera\b/i.test(lower)
    ) {
      markCommandHandled(command);
      handleToggleCamera();
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
    if (
      isStopCommand(lower) &&
      (isRadarScanningRef.current || isCameraActive || (videoRef.current && videoRef.current.srcObject))
    ) {
      markCommandHandled(lower);
      stopSpeaking();
      setIsSpeaking(false);
      stopRadar('Camera and radar stopped.');
      return;
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
      <section aria-labelledby="stage-heading" className="card space-y-6">
        {/* Header with Mode Status & Voice Toggle (No inner divider border) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 id="stage-heading" className="text-xl font-bold tracking-tight text-white drop-shadow-sm">
                Voice Co-Pilot
              </h2>
              {/* Dynamic Status Pill (Normal Monochrome Glass) */}
              <span
                className="glass-pill text-xs px-3.5 py-1 font-medium flex items-center gap-2 text-white"
                role="status"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isPinningObject || isLocatingObject || mode === 'radar'
                      ? 'bg-white animate-pulse'
                      : 'bg-white/50'
                  }`}
                />
                <span>
                  {isPinningObject
                    ? 'Pinning Object...'
                    : isLocatingObject
                    ? 'Locating in Memory...'
                    : mode === 'radar'
                    ? isAnalyzingFrame
                      ? 'Radar (Reasoning)'
                      : 'Radar (Scanning)'
                    : mode === 'inspection'
                    ? isAnalyzingMedia
                      ? 'Analyzing Media'
                      : 'Inspection Stage'
                    : 'Standby'}
                </span>
              </span>
            </div>
            <p className="text-sm text-white/75 mt-1 font-normal">
              Hands-free visual co-pilot with Spatial Memory. Say &quot;start surroundings&quot;, &quot;remember where my keys are&quot;, or &quot;where did I put my water bottle?&quot;.
            </p>
          </div>

          {/* Voice Control Toggle (Normal Monochrome Glass) */}
          <div className="flex items-center gap-2">
            {isSpeechRecognitionSupported() && (
              <button
                type="button"
                onClick={toggleVoiceControl}
                className={`glass-pill text-xs flex items-center gap-1.5 py-1.5 px-3.5 cursor-pointer text-white ${
                  isVoiceActive ? 'bg-white/[0.14] font-medium' : 'text-white/70'
                }`}
                aria-pressed={isVoiceActive}
                aria-label={isVoiceActive ? 'Disable voice control' : 'Enable voice control'}
              >
                {isVoiceActive ? (
                  <>
                    <Mic className="h-4 w-4 text-white" aria-hidden="true" />
                    <span>Voice: Active</span>
                  </>
                ) : (
                  <>
                    <MicOff className="h-4 w-4 text-white/50" aria-hidden="true" />
                    <span>Enable Voice</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Live Speech Feedback Bar (No Inner Border) */}
        {((isVoiceActive && interimSpeech) || isSpeaking) && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs p-3.5 rounded-[22px] bg-white/[0.04] backdrop-blur-[6px] shadow-sm">
            <div className="flex items-center gap-2">
              {isVoiceActive && interimSpeech && (
                <span className="text-white italic font-medium animate-pulse">
                  Heard: &quot;{interimSpeech}&quot;
                </span>
              )}
            </div>

            {isSpeaking && (
              <div className="flex items-center gap-2">
                <span className="text-white font-medium flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  EchoSight Speaking (say Stop or ask a question to interrupt)
                </span>
                <button
                  onClick={() => {
                    stopSpeaking();
                    setIsSpeaking(false);
                  }}
                  className="glass-pill text-xs py-1 px-3 flex items-center gap-1 cursor-pointer text-white"
                  aria-label="Silence audio"
                >
                  <VolumeX className="h-3 w-3 text-white" aria-hidden="true" />
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
            className="w-full p-4 rounded-[26px] bg-white/[0.08] backdrop-blur-[8px] text-white flex items-center justify-between text-left transition-all hover:bg-white/[0.14] cursor-pointer shadow-lg"
            aria-label="Tap to open file chooser dialog"
          >
            <div className="flex items-center gap-3">
              <Upload className="h-6 w-6 text-white shrink-0" aria-hidden="true" />
              <div>
                <p className="font-semibold text-sm text-white">Tap here or press Enter to open File Picker</p>
                <p className="text-xs text-white/75">Voice command detected. Tap anywhere on screen or press Enter to choose your media.</p>
              </div>
            </div>
            <span className="btn-primary text-xs py-1.5 px-4 shrink-0">Open Picker</span>
          </button>
        )}

        {/* Dynamic Media Viewport (No Inner Border) */}
        <div className="relative aspect-video max-h-76 w-full overflow-hidden rounded-[26px] bg-black/25 backdrop-blur-[6px] flex items-center justify-center shadow-inner">
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
            <div className="h-full w-full flex items-center justify-center bg-black/30">
              {detectedType === 'video' ? (
                <video src={previewUrl} controls className="h-full w-full object-contain" />
              ) : (
                <img src={previewUrl} alt="Captured preview" className="h-full w-full object-contain" />
              )}
            </div>
          )}

          {/* 3. Standby Placeholder (Normal White Eye Icon) */}
          {mode === 'standby' && (
            <div className="text-center p-6 space-y-3 text-white">
              <Eye className="mx-auto h-12 w-12 text-white/80 opacity-90 drop-shadow-md animate-pulse" aria-hidden="true" />
              <p className="text-base font-semibold drop-shadow-sm text-white">Workspace Ready</p>
              <p className="text-xs text-white/75 max-w-sm mx-auto font-normal">
                Say &quot;start surroundings&quot; for real-time walking guidance, &quot;take a photo&quot; to inspect an object, or &quot;pick a file&quot;.
              </p>
            </div>
          )}

          {/* In-Viewport Radar HUD Banner (Normal Monochrome Glass) */}
          {mode === 'radar' && isRadarScanning && (
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              <div className="glass-pill px-3.5 py-1.5 text-xs text-white flex items-center gap-2 shadow-md border-0 bg-black/40 backdrop-blur-md pointer-events-auto">
                <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                <span className="font-medium text-white">Walking Radar Active</span>
                <span className="text-white/60 text-[11px]">
                  ({cameraFacing === 'environment' ? 'Rear' : 'Front'})
                </span>
              </div>
              <button
                type="button"
                onClick={handleToggleCamera}
                className="glass-pill px-3 py-1.5 text-xs text-white/90 hover:text-white flex items-center gap-1.5 cursor-pointer shadow-md border-0 bg-black/40 backdrop-blur-md pointer-events-auto transition-all"
                title="Switch between front and back camera"
                aria-label="Flip camera between front and rear"
              >
                <RefreshCw className="h-3 w-3" />
                <span>Flip Camera</span>
              </button>
            </div>
          )}

          {/* In-Viewport Inspection Banner (Normal Monochrome Glass) */}
          {mode === 'inspection' && selectedFile && (
            <div className="absolute top-3 left-3 glass-pill px-3.5 py-1.5 text-xs text-white flex items-center gap-2 shadow-md border-0 bg-black/40 backdrop-blur-md">
              <CheckCircle2 className="h-3.5 w-3.5 text-white" />
              <span className="truncate max-w-[200px] font-medium">{selectedFile.name}</span>
            </div>
          )}
        </div>

        {/* Spatial Memory Registry Strip (No Inner Border) */}
        <div className="rounded-[24px] bg-white/[0.03] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-white/80 shrink-0" />
              <span className="text-xs font-semibold text-white">
                Spatial Memory Registry ({spatialPins.length})
              </span>
            </div>
            {spatialPins.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllPins}
                className="text-[11px] text-white/60 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                title="Clear all spatial pins"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear All</span>
              </button>
            )}
          </div>

          {spatialPins.length === 0 ? (
            <p className="text-xs text-white/70 font-normal">
              No items pinned yet. Point your camera and say &quot;Remember where my keys are&quot; or click &quot;Pin Object&quot;.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {spatialPins.map((pin) => (
                <div
                  key={pin.id}
                  className="glass-pill flex items-center gap-2 px-3.5 py-1.5 text-xs shadow-sm group"
                >
                  <button
                    type="button"
                    onClick={() => handleLocateObject(`Where is my ${pin.item}?`)}
                    disabled={isLocatingObject}
                    className="flex items-center gap-1.5 text-left text-white cursor-pointer"
                    title={`Click to locate ${pin.item}`}
                  >
                    <MapPin className="h-3 w-3 text-white/70 shrink-0" />
                    <span className="font-semibold text-white">{pin.item}</span>
                    <span className="text-[10px] text-white/50">({pin.timestamp})</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemovePin(pin.id, pin.item);
                    }}
                    className="text-white/50 hover:text-white ml-1 p-0.5 rounded-full cursor-pointer transition-colors"
                    aria-label={`Remove ${pin.item} from spatial memory`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Toolbar (Normal Monochrome Buttons) */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {/* Radar Start/Stop Button */}
          {mode === 'radar' ? (
            <button
              type="button"
              onClick={() => stopRadar()}
              className="btn-secondary py-2.5 px-5 text-xs font-medium flex items-center gap-2 text-white cursor-pointer"
              aria-label="Stop live walking radar"
            >
              <StopCircle className="h-4 w-4 text-white" />
              <span>Stop Radar</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startRadar()}
              className="btn-primary py-2.5 px-5 text-xs font-medium flex items-center gap-2 text-white cursor-pointer"
              aria-label="Start live walking radar"
            >
              <Play className="h-4 w-4 text-white" />
              <span>Start Radar</span>
            </button>
          )}

          {/* Snap Photo Button */}
          <button
            type="button"
            onClick={() => handleCaptureSnapshot(false)}
            disabled={isCapturingPhotoRef.current}
            className="btn-secondary py-2.5 px-4 text-xs font-medium flex items-center gap-1.5 cursor-pointer text-white"
            aria-label="Capture camera snapshot"
          >
            <Camera className="h-4 w-4 text-white" />
            <span>Snap Photo</span>
          </button>

          {/* Pin Object Button (Normal Monochrome Glass) */}
          <button
            type="button"
            onClick={() => handlePinObject()}
            disabled={isPinningObject}
            className="btn-secondary py-2.5 px-4 text-xs font-medium flex items-center gap-1.5 cursor-pointer text-white"
            aria-label="Pin object in view to spatial memory"
          >
            {isPinningObject ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-white" />
                <span>Pinning...</span>
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 text-white" />
                <span>Pin Object</span>
              </>
            )}
          </button>

          {/* Choose File Button */}
          <button
            type="button"
            onClick={triggerFilePicker}
            className="btn-secondary py-2.5 px-4 text-xs font-medium flex items-center gap-1.5 cursor-pointer text-white"
            aria-label="Open file picker to upload media"
          >
            <Upload className="h-4 w-4 text-white" />
            <span>Upload File</span>
          </button>

          {/* Deep Analyze Button */}
          {mode === 'inspection' && selectedFile && (
            <button
              type="button"
              onClick={() => runExhaustiveAnalysis()}
              disabled={isAnalyzingMedia}
              className="btn-primary py-2.5 px-5 text-xs font-medium flex items-center gap-1.5 ml-auto text-white"
            >
              {isAnalyzingMedia ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin text-white" />
                  <span>Analyzing in Detail...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-white" />
                  <span>Explain in Exhaustive Detail</span>
                </>
              )}
            </button>
          )}

          {/* Reset / Return to Radar button */}
          {mode === 'inspection' && (
            <button
              type="button"
              onClick={handleClearMedia}
              className="btn-secondary py-2.5 px-4 text-xs font-medium ml-auto cursor-pointer text-white"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* Notices & Alerts (No Inner Border) */}
      {interruptionNotice && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-[24px] bg-white/[0.06] backdrop-blur-[6px] text-white flex items-center justify-between text-xs shadow-md"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-white shrink-0" />
            <span>{interruptionNotice}</span>
          </div>
          <button
            onClick={() => setInterruptionNotice(null)}
            className="font-semibold text-white/75 hover:text-white ml-2 transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          aria-live="assertive"
          className="p-4 rounded-[24px] bg-white/[0.08] backdrop-blur-[6px] text-white flex items-center justify-between text-xs shadow-md"
        >
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="font-semibold ml-2 hover:underline text-white cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Unified Sensory, Analysis & Conversational Feed */}
      <section aria-labelledby="feed-heading" className="card space-y-5">
        {/* Header (No inner divider border) */}
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-white" />
            <h3 id="feed-heading" className="text-base font-semibold text-white drop-shadow-sm">
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
              className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3.5 cursor-pointer text-white"
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="h-3.5 w-3.5 text-white" />
                  <span>Silence</span>
                </>
              ) : (
                <>
                  <Volume2 className="h-3.5 w-3.5 text-white" />
                  <span>Read Aloud</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Empty State (No Inner Border) */}
        {feedItems.length === 0 && (
          <div className="py-8 text-center space-y-2.5 rounded-[26px] p-6 bg-white/[0.02]">
            <Eye className="mx-auto h-8 w-8 text-white/50 opacity-80" />
            <p className="text-sm font-semibold text-white">
              No sensory events yet
            </p>
            <p className="text-xs text-white/70 max-w-sm mx-auto font-normal">
              Start the walking radar to detect obstacles, capture a snapshot to examine an object, or ask any question.
            </p>
          </div>
        )}

        {/* Isolated Scrollable Container */}
        {feedItems.length > 0 && (
          <div
            ref={feedContainerRef}
            className="max-h-96 overflow-y-auto space-y-3.5 pr-1"
            role="log"
            aria-live="polite"
          >
            {feedItems.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-[22px] bg-white/[0.04] backdrop-blur-[6px] space-y-2.5 shadow-sm"
              >
                {/* Header */}
                <div className="flex items-center justify-between text-xs text-white/75">
                  <div className="flex items-center gap-1.5">
                    {item.type === 'spatial' && <MapPin className="h-3.5 w-3.5 text-white/80" />}
                    <span className="font-semibold uppercase tracking-wider text-white">
                      {item.title ||
                        (item.type === 'radar'
                          ? 'Radar Event'
                          : item.type === 'spatial'
                          ? 'Spatial Memory'
                          : item.type === 'analysis'
                          ? 'Analysis'
                          : 'System')}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-white/50">{item.timestamp}</span>
                </div>

                {/* Proactive Takeaway highlight if present (Normal Monochrome Glass) */}
                {item.proactiveInsight && (
                  <div className="p-3 rounded-[16px] bg-white/[0.06] text-xs font-medium text-white">
                    Takeaway: {item.proactiveInsight}
                  </div>
                )}

                {/* Content */}
                <p className="text-sm text-white leading-relaxed font-normal">
                  {item.content}
                </p>

                {/* Exhaustive Detailed Breakdown if present */}
                {item.detailedText && (
                  <details className="pt-2 text-xs text-white/75">
                    <summary className="cursor-pointer font-semibold hover:text-white transition-colors">
                      View Comprehensive Written Architecture
                    </summary>
                    <div className="mt-2 p-3.5 rounded-[16px] bg-black/30 whitespace-pre-wrap font-sans text-xs text-white/90 leading-relaxed shadow-inner">
                      {item.detailedText}
                    </div>
                  </details>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Conversational Follow-Up Input (No Inner Border) */}
        <form onSubmit={handleFollowupSubmit} className="pt-4 flex gap-2.5">
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
                : "Ask about surroundings, pinned items, or media (e.g. 'Where did I put my water bottle?')"
            }
            disabled={isAnsweringFollowup}
            className="flex-1 rounded-full border-0 bg-white/[0.05] px-5 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/30 backdrop-blur-[6px] shadow-inner"
          />
          {isSpeechRecognitionSupported() && (
            <button
              type="button"
              onClick={toggleVoiceControl}
              disabled={isAnsweringFollowup}
              className={`glass-pill text-xs px-3.5 h-11 flex items-center justify-center cursor-pointer text-white ${
                isVoiceActive ? 'bg-white/[0.14]' : 'text-white/70'
              }`}
              aria-label={isVoiceActive ? 'Mute voice' : 'Ask question with voice'}
            >
              {isVoiceActive ? <MicOff className="h-4 w-4 text-white" /> : <Mic className="h-4 w-4 text-white" />}
            </button>
          )}
          <button
            type="submit"
            disabled={!followupText.trim() || isAnsweringFollowup}
            className="btn-secondary whitespace-nowrap text-xs font-medium px-5 rounded-full cursor-pointer h-11 text-white"
          >
            {isAnsweringFollowup ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin text-white" />
            ) : (
              <span className="flex items-center gap-1.5 text-white">
                <Send className="h-3.5 w-3.5 text-white" />
                <span>Ask</span>
              </span>
            )}
          </button>
        </form>
      </section>
    </div>
  );
}
