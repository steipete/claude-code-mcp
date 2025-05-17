import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';

export interface MCPResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

/**
 * Mock MCP client for testing the server
 */
export class MCPTestClient extends EventEmitter {
  private server: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, {
    resolve: (response: MCPResponse) => void;
    reject: (error: Error) => void;
  }>();
  private buffer = '';

  constructor(private serverPath: string, private env: Record<string, string> = {}) {
    super();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = spawn('node', [this.serverPath], {
        env: { ...process.env, ...this.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.server.stdout?.on('data', (data) => {
        this.handleData(data.toString());
      });

      this.server.stderr?.on('data', (data) => {
        console.error('Server stderr:', data.toString());
      });

      this.server.on('error', (error) => {
        reject(error);
      });

      this.server.on('spawn', () => {
        resolve();
      });
    });
  }

  async disconnect(): Promise<void> {
    if (this.server) {
      this.server.kill();
      await new Promise((resolve) => {
        this.server!.on('exit', resolve);
      });
      this.server = null;
    }
  }

  private handleData(data: string): void {
    this.buffer += data;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const response = JSON.parse(line);
        if (response.id && this.pendingRequests.has(response.id)) {
          const pending = this.pendingRequests.get(response.id)!;
          this.pendingRequests.delete(response.id);
          pending.resolve(response);
        } else {
          this.emit('notification', response);
        }
      } catch (error) {
        console.error('Failed to parse response:', line, error);
      }
    }
  }

  async sendRequest(method: string, params?: any): Promise<any> {
    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      method,
      params,
      id,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      this.server?.stdin?.write(JSON.stringify(request) + '\n');
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request ${id} timed out`));
        }
      }, 30000);
    });
  }

  async callTool(name: string, args: any): Promise<any> {
    const response = await this.sendRequest('tools/call', {
      name,
      arguments: args,
    });
    
    if (response.error) {
      throw new Error(`Tool call failed: ${response.error.message}`);
    }
    
    return response.result?.content;
  }

  async listTools(): Promise<any> {
    const response = await this.sendRequest('tools/list');
    return response.result?.tools || [];
  }
}