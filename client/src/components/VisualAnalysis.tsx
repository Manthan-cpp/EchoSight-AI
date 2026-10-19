import { useState, useEffect } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { Upload, FileText, Video, Trophy, CheckCircle2, RefreshCw, Volume2, VolumeX, Mic, MicOff, MessageSquare } from 'lucide-react';
import { callTool, type ToolResult } from '../services/mcpClient';
import { speakText, stopSpeaking, startListening, stopListening, isSpeechRecognitionSupported } from '../services/speechService';

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
  const [followupText, setFollowupText] = useState<string>('');
  const [isAnsweringFollowup, setIsAnsweringFollowup] = useState<boolean>(false);
  const [followups, setFollowups] = useState<FollowupItem[]>([]);
  const [contextHistory, setContextHistory] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
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
      stopSpeaking();

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
    stopSpeaking();
    stopListening();
    setIsVoiceListening(false);
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFileBase64(null);
    setToolResult(null);
    setFollowups([]);
    setContextHistory('');
    setErrorMessage(null);
  };

  const handleRunAnalysis = async () => {
    if (!fileBase64 || !selectedFile) return;

    setIsAnalyzing(true);
    setErrorMessage(null);
    stopSpeaking();

    try {
      let result: ToolResult;
      const mimeType = selectedFile.type || (mode === 'video' ? 'video/mp4' : 'image/jpeg');

      if (mode === 'image') {
        result = await callTool('analyze_visual', {
          image_base64: fileBase64,
          mime_type: mimeType,
        });
      } else if (mode === 'video') {
        result = await callTool('analyze_video', {
          video_base64: fileBase64,
          mime_type: mimeType,
        });
      } else {
        result = await callTool('analyze_scorecard', {
          image_base64: fileBase64,
          mime_type: mimeType,
        });
      }

      setToolResult(result);
      const initialContext = `Tool: ${mode}\nDescription: ${result.detailedText}`;
      setContextHistory(initialContext);

      // Play spoken text automatically
      if (result.spokenText) {
        setIsSpeaking(true);
        speakText(result.spokenText, () => setIsSpeaking(false));
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Analysis failed. Please check connection and try again.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleSpeech = () => {
    if (isSpeaking) {
      stopSpeaking();
      setIsSpeaking(false);
    } else if (toolResult?.spokenText) {
      setIsSpeaking(true);
      speakText(toolResult.spokenText, () => setIsSpeaking(false));
    }
  };

  const handleAskFollowup = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || isAnsweringFollowup) return;

    setIsAnsweringFollowup(true);
    setErrorMessage(null);
    stopSpeaking();

    try {
      const mimeType = selectedFile?.type || 'image/jpeg';
      const result = await callTool('ask_followup', {
        question: trimmed,
        prior_context: contextHistory,
        image_base64: fileBase64 || undefined,
        mime_type: mimeType,
      });

      const newFollowup: FollowupItem = {
        id: Date.now().toString(),
        question: trimmed,
        answer: result.spokenText || result.detailedText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setFollowups((prev) => [...prev, newFollowup]);
      setContextHistory((prev) => `${prev}\nUser: ${trimmed}\nEchoSight: ${result.detailedText}`);
      setFollowupText('');

      // Speak answer out loud
      if (result.spokenText) {
        setIsSpeaking(true);
        speakText(result.spokenText, () => setIsSpeaking(false));
      }
    } catch (err: any) {
      setErrorMessage(`Follow-up error: ${err.message}`);
    } finally {
      setIsAnsweringFollowup(false);
    }
  };

  const handleFollowupSubmit = (e: FormEvent) => {
    e.preventDefault();
    handleAskFollowup(followupText);
  };

  const handleToggleVoiceInput = () => {
    if (isVoiceListening) {
      stopListening();
      setIsVoiceListening(false);
    } else {
      const started = startListening(
        (transcript) => {
          setFollowupText(transcript);
          handleAskFollowup(transcript);
        },
        (listening) => setIsVoiceListening(listening),
        (err) => setErrorMessage(err)
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
              Deep structured walkthroughs for charts, video clips, and sports scorecards.
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

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-3 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] text-[var(--text-primary)] flex items-center justify-between text-xs">
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
                aria-label={isSpeaking ? 'Stop spoken readout' : 'Read spoken analysis aloud'}
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Stop Audio</span>
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

            {/* Conversational Follow-Up Chain */}
            {followups.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Follow-Up Exploration
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

            {/* Follow-up question input */}
            <form onSubmit={handleFollowupSubmit} className="pt-2 flex gap-2">
              <label htmlFor="analysis-followup-input" className="sr-only">
                Ask a follow-up question
              </label>
              <input
                id="analysis-followup-input"
                type="text"
                value={followupText}
                onChange={(e) => setFollowupText(e.target.value)}
                placeholder="Ask a follow-up (e.g. 'What is the highest value?', 'Who bowled the 18th over?')"
                disabled={isAnsweringFollowup}
                className="flex-1 rounded-[var(--radius-sm)] border border-[var(--border-neutral)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              />
              {isSpeechRecognitionSupported() && (
                <button
                  type="button"
                  onClick={handleToggleVoiceInput}
                  disabled={isAnsweringFollowup}
                  className={`btn-secondary text-xs px-3 flex items-center gap-1 ${
                    isVoiceListening ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]' : ''
                  }`}
                  aria-label={isVoiceListening ? 'Stop listening' : 'Ask question with voice'}
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
                    <span>Ask</span>
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
