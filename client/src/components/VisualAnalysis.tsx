import { useState, useEffect, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Upload,
  FileText,
  Video,
  Trophy,
  CheckCircle2,
  RefreshCw,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  MessageSquare,
  AlertCircle,
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
} from '../services/speechService';

type AnalysisMode = 'image' | 'video' | 'scorecard';

interface FollowupItem {
  id: string;
  question: string;
  answer: string;
  timestamp: string;
}

export function VisualAnalysis() {
  const [mode, setMode] = useState<AnalysisMode>('image');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [toolResult, setToolResult] = useState<ToolResult | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isVoiceListening, setIsVoiceListening] = useState<boolean>(false);
  const [interimSpeech, setInterimSpeech] = useState<string>('');
  const [followupText, setFollowupText] = useState<string>('');
  const [isAnsweringFollowup, setIsAnsweringFollowup] = useState<boolean>(false);
  const [followups, setFollowups] = useState<FollowupItem[]>([]);
  const [contextHistory, setContextHistory] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interruptionNotice, setInterruptionNotice] = useState<string | null>(null);

  // Synchronization and concurrency locks to guarantee user questions take priority
  const queryTokenRef = useRef<number>(0);
  const narrationSupersededRef = useRef<boolean>(false);
  const selectedFileRef = useRef<File | null>(null);
  const fileBase64Ref = useRef<string | null>(null);
  const contextHistoryRef = useRef<string>('');
  const modeRef = useRef<AnalysisMode>('image');
  const isAnalyzingRef = useRef<boolean>(false);

  // Keep state refs synchronized to eliminate stale closures in speech callbacks
  useEffect(() => {
    selectedFileRef.current = selectedFile;
    fileBase64Ref.current = fileBase64;
    contextHistoryRef.current = contextHistory;
    modeRef.current = mode;
    isAnalyzingRef.current = isAnalyzing;
  }, [selectedFile, fileBase64, contextHistory, mode, isAnalyzing]);

  // Synchronize speech state directly from speech service (including instant barge-in interruptions)
  useEffect(() => {
    return onSpeechStateChange((speaking) => {
      setIsSpeaking(speaking);
    });
  }, []);

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
      setSelectedFile(file);
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
        setFileBase64(base64);
      } catch (err: any) {
        setErrorMessage('Failed to read file: ' + err.message);
      }
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

  const handleReset = () => {
    narrationSupersededRef.current = true;
    stopSpeaking();
    stopListening();
    setIsSpeaking(false);
    setIsVoiceListening(false);
    setSelectedFile(null);
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
   * Run initial exhaustive visual/video/scorecard analysis.
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

    try {
      let result: ToolResult;
      const file = selectedFileRef.current;
      const currentMode = modeRef.current;
      const mimeType = file.type || (currentMode === 'video' ? 'video/mp4' : 'image/jpeg');

      if (currentMode === 'image') {
        result = await callTool('analyze_visual', {
          image_base64: fileBase64Ref.current,
          mime_type: mimeType,
        });
      } else if (currentMode === 'video') {
        result = await callTool('analyze_video', {
          video_base64: fileBase64Ref.current,
          mime_type: mimeType,
        });
      } else {
        result = await callTool('analyze_scorecard', {
          image_base64: fileBase64Ref.current,
          mime_type: mimeType,
        });
      }

      // Always populate the visual output cards
      setToolResult(result);
      const initialContext = `Tool: ${currentMode}\nDescription: ${result.detailedText}`;
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

  /**
   * Voice Command Processor with Instant Barge-In Interruption.
   */
  const handleVoiceCommand = (command: string) => {
    const lower = command.toLowerCase().trim();
    setInterimSpeech('');

    // 1. Stop / Silence commands
    if (
      lower.includes('stop') ||
      lower.includes('pause') ||
      lower.includes("that's enough") ||
      lower.includes('quiet') ||
      lower.includes('shut up') ||
      lower.includes('be quiet') ||
      lower.includes('silence')
    ) {
      narrationSupersededRef.current = true;
      stopSpeaking();
      setIsSpeaking(false);
      setInterruptionNotice('Silenced audio on user voice command.');
      return;
    }

    // 2. Trigger initial analysis by voice
    if (
      lower.includes('analyze this') ||
      lower.includes('start analysis') ||
      lower.includes('explain this') ||
      lower.includes('describe this') ||
      lower.includes('read this')
    ) {
      if (fileBase64Ref.current && !isAnalyzingRef.current) {
        handleRunAnalysis();
        return;
      }
    }

    // 3. Any other spoken input is treated as a direct question that interrupts ongoing narration!
    handleAskFollowup(command);
  };

  /**
   * Interim speech callback: interrupts speech on the very first syllable spoken by the user!
   */
  const handleInterimSpeech = (interim: string) => {
    setInterimSpeech(interim);

    // Instant barge-in: If user speaks ANY word while EchoSight is narrating, silence system voice immediately
    if (interim.trim() && (window.speechSynthesis?.speaking || isEchoSightSpeaking)) {
      narrationSupersededRef.current = true;
      stopSpeaking();
      setIsSpeaking(false);
      setInterruptionNotice('Interrupted: listening to your question...');
    }
  };

  /**
   * Toggle continuous hands-free voice control.
   */
  const toggleVoiceControl = () => {
    if (isVoiceListening) {
      stopListening((listening) => setIsVoiceListening(listening));
      setIsVoiceListening(false);
      setInterimSpeech('');
    } else {
      const started = startListening(
        (transcript) => handleVoiceCommand(transcript),
        (listening) => setIsVoiceListening(listening),
        (err) => setErrorMessage(err),
        (interim) => handleInterimSpeech(interim)
      );
      if (started) {
        setIsVoiceListening(true);
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode Selector Tabs */}
      <section aria-labelledby="analysis-mode-heading" className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-neutral)] pb-4">
          <div>
            <h2 id="analysis-mode-heading" className="text-xl font-semibold text-[var(--text-primary)]">
              Visual & Video Analysis
            </h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Deep structured walkthroughs with instant conversational interruption.
            </p>
          </div>

          <div role="tablist" aria-label="Analysis Modes" className="flex items-center gap-1.5">
            <button
              role="tab"
              aria-selected={mode === 'image'}
              onClick={() => { setMode('image'); handleReset(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border transition-colors ${
                mode === 'image'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] border-[var(--accent-primary)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-neutral)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <FileText className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Still Image / Chart</span>
            </button>
            <button
              role="tab"
              aria-selected={mode === 'video'}
              onClick={() => { setMode('video'); handleReset(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border transition-colors ${
                mode === 'video'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] border-[var(--accent-primary)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-neutral)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <Video className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Video Narration</span>
            </button>
            <button
              role="tab"
              aria-selected={mode === 'scorecard'}
              onClick={() => { setMode('scorecard'); handleReset(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] border transition-colors ${
                mode === 'scorecard'
                  ? 'bg-[var(--accent-primary)] text-[var(--accent-text)] border-[var(--accent-primary)]'
                  : 'bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-neutral)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Scorecard Reasoning</span>
            </button>
          </div>
        </div>

        {/* Voice Control & Status Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            {isSpeechRecognitionSupported() && (
              <button
                type="button"
                onClick={toggleVoiceControl}
                className={`btn-secondary text-xs flex items-center gap-1.5 py-1 px-2.5 rounded-[var(--radius-sm)] ${
                  isVoiceListening
                    ? 'border-[var(--status-listening-border)] bg-[var(--status-listening-bg)] text-[var(--status-listening-text)] font-semibold'
                    : ''
                }`}
                aria-pressed={isVoiceListening}
                aria-label={isVoiceListening ? 'Disable hands-free voice control' : 'Enable hands-free voice control'}
              >
                {isVoiceListening ? (
                  <>
                    <Mic className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Voice Control: Active</span>
                  </>
                ) : (
                  <>
                    <MicOff className="h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden="true" />
                    <span>Enable Voice Control</span>
                  </>
                )}
              </button>
            )}

            {isVoiceListening && interimSpeech && (
              <span className="text-[var(--accent-primary)] italic font-medium animate-pulse">
                Heard: "{interimSpeech}"
              </span>
            )}
          </div>

          {/* Active Narration and Instant Interruption Trigger */}
          {isSpeaking && (
            <div className="flex items-center gap-2">
              <span className="text-[var(--accent-primary)] font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[var(--accent-primary)] animate-pulse" />
                Narrating (Ask question or say Stop to interrupt)
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

        {/* Upload / Capture Drop Area */}
        <div className="space-y-4">
          {!selectedFile ? (
            <label
              htmlFor="visual-file-input"
              className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-[var(--border-neutral)] rounded-[var(--radius-md)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-surface)] cursor-pointer transition-colors text-center"
            >
              <Upload className="h-10 w-10 text-[var(--text-secondary)] mb-2" aria-hidden="true" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {mode === 'image' && 'Select or Drop a Still Image (Chart, Diagram, Document)'}
                {mode === 'video' && 'Select or Drop a Short Video Clip (MP4, WebM)'}
                {mode === 'scorecard' && 'Select or Drop a Match Scorecard Image (Cricket, Sports)'}
              </span>
              <span className="text-xs text-[var(--text-secondary)] mt-1">
                {mode === 'video' ? 'Max length: 30 seconds • Max size: 20MB' : 'Max size: 10MB • Formats: JPEG, PNG, WebP'}
              </span>
              <input
                id="visual-file-input"
                type="file"
                accept={mode === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp'}
                onChange={handleFileChange}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="border border-[var(--border-neutral)] rounded-[var(--radius-md)] p-4 bg-[var(--bg-surface)] space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-neutral)] pb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                  <span className="text-sm font-medium text-[var(--text-primary)]">{selectedFile.name}</span>
                  <span className="text-xs text-[var(--text-secondary)]">({(selectedFile.size / 1024).toFixed(0)} KB)</span>
                </div>
                <button
                  onClick={handleReset}
                  className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                  Change File
                </button>
              </div>

              {/* Preview */}
              <div className="max-h-60 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-subtle)] flex items-center justify-center">
                {mode === 'video' ? (
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
                      <span>Analyzing via MCP...</span>
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
            <FileText className="mx-auto h-8 w-8 text-[var(--text-secondary)]" aria-hidden="true" />
            <p className="text-sm font-medium text-[var(--text-primary)]">
              No analysis requested yet
            </p>
            <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
              Upload an image, video, or match scorecard above. EchoSight will break down the content in structured, patient detail designed for listening.
            </p>
          </div>
        )}

        {/* Active Analysis State */}
        {isAnalyzing && (
          <div className="p-4 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--status-thinking-bg)] text-[var(--status-thinking-text)] space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-[2px] bg-[var(--status-thinking-text)] animate-pulse" aria-hidden="true" />
              <p className="text-xs font-bold uppercase tracking-wider">Analyzing Visual Stream</p>
            </div>
            <p className="text-xs">
              Deconstructing layout, data points, trends, and contextual meaning via Google Gemini pipeline...
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