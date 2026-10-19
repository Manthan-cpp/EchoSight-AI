import { useState } from 'react';
import type { ChangeEvent } from 'react';
import { Upload, FileText, Video, Trophy, CheckCircle2, RefreshCw } from 'lucide-react';

type AnalysisMode = 'image' | 'video' | 'scorecard';

export function VisualAnalysis() {
  const [mode, setMode] = useState<AnalysisMode>('image');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [result, setResult] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Mode Selector Tabs - Rectangular, zero pills */}
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
                  onClick={() => setIsAnalyzing(true)}
                  disabled={isAnalyzing}
                  className="btn-primary flex-1"
                >
                  {isAnalyzing ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                      <span>Analyzing...</span>
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

      {/* Structured Output Walkthrough Area */}
      <section aria-labelledby="analysis-output-heading" className="card space-y-3">
        <h3 id="analysis-output-heading" className="text-base font-semibold text-[var(--text-primary)]">
          Exhaustive Spoken Analysis
        </h3>

        {/* Real Empty State */}
        {!result && !isAnalyzing && (
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
              Deconstructing layout, data points, trends, and contextual meaning...
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
