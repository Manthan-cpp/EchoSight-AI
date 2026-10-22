// EchoSight - MCP Web Client Service
const SERVER_URL = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:3001';

export interface ToolResult {
  spokenText: string;
  detailedText: string;
  confidence?: 'high' | 'medium' | 'low';
  isUnchanged?: boolean;
  proactiveInsight?: string;
  safety?: {
    status: 'clear' | 'stop' | 'caution' | 'left' | 'right' | 'slow' | 'unknown';
    direction?: 'left' | 'right' | 'none';
    hazard?: string;
    confidence: 'high' | 'medium' | 'low';
  };
  error?: string;
}

export interface CallToolOptions {
  timeoutMs?: number;
}

export async function callTool(
  toolName: string,
  args: Record<string, any>,
  options: CallToolOptions = {}
): Promise<ToolResult> {
  // The walking fast path may rotate across keys inside the server. Give it
  // enough room to finish a fallback attempt without turning a valid slow
  // Gemini response into a false "path not verified" result.
  const timeoutMs = options.timeoutMs ?? (toolName === 'check_walking_path' ? 13000 : 20000);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${SERVER_URL}/api/tools/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status} ${res.statusText}`);
    }

    const data = await res.json();
    return {
      spokenText: data.spokenText || data.text || 'Observation completed.',
      detailedText: data.detailedText || data.text || 'Observation completed.',
      confidence: data.confidence || 'high',
      isUnchanged: data.isUnchanged || false,
      proactiveInsight: data.proactiveInsight,
      safety: data.safety,
    };
  } catch (err: any) {
    console.error(`[McpClient] Error calling tool ${toolName}:`, err);
    const message = err?.name === 'AbortError'
      ? `The ${toolName} request timed out after ${timeoutMs}ms.`
      : err.message || 'Server connection error.';
    return {
      spokenText: `EchoSight was unable to process this request. ${message}`,
      detailedText: `Error invoking MCP tool "${toolName}": ${message}`,
      confidence: 'low',
      error: message,
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function checkServerHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export interface ServerCapabilities {
  configuredGeminiKeys: number;
  radarCadenceSeconds: number;
}

export async function getServerCapabilities(): Promise<ServerCapabilities | null> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(`${SERVER_URL}/health`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      configuredGeminiKeys: Number(data.configuredGeminiKeys) || 0,
      radarCadenceSeconds: Number(data.radarCadenceSeconds) || 5,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}
