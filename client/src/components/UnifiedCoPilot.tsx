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

    // Constrain resolution to max 800px for instant encoding and low-latency API transport
    const maxDim = 800;
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
    const dataUrl = canvas.toDataURL('image/jpeg', 0.80);
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
      text.includes('silence')
    );
  };

  const extractPinnedItem = (text: string): string => {
    const lower = text.toLowerCase().trim();
    const rememberMatch = lower.match(
      /remember\s+where\s+(?:i\s+(?:put|left|placed)\s+)?(?:my\s+|the\s+|a\s+|an\s+)?([a-z0-9\s]+?)(?:\s+is|\s+are|\.|$)/i
    );
    if (rememberMatch && rememberMatch[1]?.trim()) {
      return rememberMatch[1].trim();
    }
    const pinMatch = lower.match(
      /\b(?:pin|track|save|remember)\s+(?:my\s+|the\s+|a\s+|an\s+)?([a-z0-9\s]+?)(?:\s+here|\s+on\s+the|\s+to\s+the|\.|$)/i
    );
    if (pinMatch && pinMatch[1]?.trim()) {
      const candidate = pinMatch[1].trim();
      if (!['this', 'it', 'object', 'item', 'here', 'location', 'where'].includes(candidate)) {
        return candidate;
      }
    }
    return 'object in view';
  };

  const isPinCommand = (text: string): boolean => {
    return (
      /\bremember\s+where\b/i.test(text) ||
      /\bpin\s+(my|the|this|an?|[a-z0-9]+)\b/i.test(text) ||
      /\b(remember|save|track)\s+(this|my|the)\s+(item|object|keys?|wallet|bottle|glasses|phone|bag|backpack|cup|plate|laptop|charger|badge|book|medicine|pills?)\b/i.test(text) ||
      /^(pin this|pin object|remember this|pin item|remember location)$/i.test(text)
    );
  };

  const isWhereIsCommand = (text: string): boolean => {
    return (
      /\bwhere\s+(?:did\s+i\s+(?:put|leave|place)|are|is|have\s+i\s+put|'s)\b/i.test(text) ||
      /\b(find|locate|search\s+for)\s+(?:my|the)\b/i.test(text) ||
      /\bwhere('s|\s+is|\s+are)\b.*\b(keys?|wallet|bottle|glasses|phone|bag|backpack|laptop|charger|badge|book|medicine|pills?|item)\b/i.test(text)
    );
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

    // 1. Stop Radar / Audio silence command
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
                  isPinningObject || isLocatingObject
                    ? 'bg-amber-500/10 text-amber-500 border-amber-500/40'
                    : mode === 'radar'
                    ? 'bg-[var(--status-listening-bg)] text-[var(--status-listening-text)] border-[var(--status-listening-border)]'
                    : mode === 'inspection'
                    ? 'bg-[var(--bg-subtle)] text-[var(--accent-primary)] border-[var(--accent-primary)]'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--border-neutral)]'
                }`}
                role="status"
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isPinningObject || isLocatingObject
                      ? 'bg-amber-500 animate-pulse'
                      : mode === 'radar'
                      ? 'bg-[var(--status-listening-text)] animate-ping'
                      : mode === 'inspection'
                      ? 'bg-[var(--accent-primary)]'
                      : 'bg-[var(--text-secondary)]'
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
              Hands-free visual co-pilot with Spatial Memory. Say &quot;start surroundings&quot;, &quot;remember where my keys are&quot;, or &quot;where did I put my water bottle?&quot;.
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

        {/* Spatial Memory Registry Strip */}
        <div className="rounded-[var(--radius-sm)] border border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs font-semibold text-[var(--text-primary)]">
                Spatial Memory Registry ({spatialPins.length})
              </span>
            </div>
            {spatialPins.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllPins}
                className="text-[11px] text-[var(--text-secondary)] hover:text-rose-500 transition-colors flex items-center gap-1"
                title="Clear all spatial pins"
              >
                <Trash2 className="h-3 w-3" />
                <span>Clear All</span>
              </button>
            )}
          </div>

          {spatialPins.length === 0 ? (
            <p className="text-xs text-[var(--text-secondary)]">
              No items pinned yet. Point your camera and say &quot;Remember where my keys are&quot; or click &quot;Pin Object&quot;.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {spatialPins.map((pin) => (
                <div
                  key={pin.id}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-amber-500/40 bg-[var(--bg-surface)] text-xs shadow-sm hover:border-amber-500 transition-all group"
                >
                  <button
                    type="button"
                    onClick={() => handleLocateObject(`Where is my ${pin.item}?`)}
                    disabled={isLocatingObject}
                    className="flex items-center gap-1.5 text-left"
                    title={`Click to locate ${pin.item}`}
                  >
                    <MapPin className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="font-semibold text-[var(--text-primary)]">{pin.item}</span>
                    <span className="text-[10px] text-[var(--text-secondary)]">({pin.timestamp})</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemovePin(pin.id, pin.item);
                    }}
                    className="text-[var(--text-secondary)] hover:text-rose-500 ml-1 p-0.5 rounded-full"
                    aria-label={`Remove ${pin.item} from spatial memory`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
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

          {/* Pin Object Button */}
          <button
            type="button"
            onClick={() => handlePinObject()}
            disabled={isPinningObject}
            className="btn-secondary py-2 px-3 text-xs font-semibold flex items-center gap-1.5 border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
            aria-label="Pin object in view to spatial memory"
          >
            {isPinningObject ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-amber-500" />
                <span>Pinning...</span>
              </>
            ) : (
              <>
                <MapPin className="h-4 w-4 text-amber-500" />
                <span>Pin Object</span>
              </>
            )}
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
                    : item.type === 'spatial'
                    ? 'border-amber-500/40 bg-amber-50/30 dark:bg-amber-950/20'
                    : item.type === 'analysis'
                    ? 'border-[var(--accent-primary)] bg-[var(--bg-subtle)]'
                    : item.type === 'followup'
                    ? 'border-[var(--border-neutral)] bg-[var(--bg-surface)]'
                    : 'border-[var(--border-neutral)] bg-[var(--bg-subtle)] text-xs text-[var(--text-secondary)]'
                }`}
              >
                {/* Header */}
                <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
                  <div className="flex items-center gap-1.5">
                    {item.type === 'spatial' && <MapPin className="h-3.5 w-3.5 text-amber-500" />}
                    <span className="font-semibold uppercase tracking-wider text-[var(--text-primary)]">
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
                : "Ask about surroundings, pinned items, or media (e.g. 'Where did I put my water bottle?')"
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
