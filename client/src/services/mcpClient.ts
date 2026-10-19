// EchoSight - MCP Web Client Service
const SERVER_URL = import.meta.env.VITE_MCP_SERVER_URL || 'http://localhost:3001';

export interface ToolResult {
  spokenText: string;
  detailedText: string;
  confidence?: 'high' | 'medium' | 'low';
  isUnchanged?: boolean;
  proactiveInsight?: string;
  error?: string;
}

export async function callTool(toolName: string, args: Record<string, any>): Promise<ToolResult> {
  try {
    const res = await fetch(`${SERVER_URL}/api/tools/${toolName}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
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
    };
  } catch (err: any) {
    console.error(`[McpClient] Error calling tool ${toolName}:`, err);
    return {
      spokenText: `EchoSight was unable to process this request. ${err.message || 'Server connection error.'}`,
      detailedText: `Error invoking MCP tool "${toolName}": ${err.message}`,
      confidence: 'low',
      error: err.message,
    };
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
