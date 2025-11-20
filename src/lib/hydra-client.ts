/**
 * Hydra Head Protocol API Client
 *
 * Client for interacting with Hydra head nodes via HTTP and WebSocket
 */

export type Party = string;

export interface HeadStatus {
  tag:
    | "Idle"
    | "Initial"
    | "Initializing"
    | "Open"
    | "SnapshotConfirmed"
    | "Closed"
    | "Finalized";
  pendingCommits?: number;
  committed?: string[];
  utxo?: string | Record<string, any>; // Can be a string or an object (UTXO map)
  contestationDeadline?: number | string; // Can be Unix timestamp (number) or ISO 8601 string
}

export interface CommitResponse {
  transaction?: {
    cborHex: string;
    txId?: string;
  };
  error?: string;
  message?: string;
  isScriptError?: boolean;
}

export class HydraAPIClient {
  private apiBaseUrl: string;
  private directBaseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private useDirectConnection: boolean;

  constructor(public party: Party = "alice", useDirectConnection = false) {
    // Port mapping: alice=4001, bob=4002, others use default 4001
    // For dynamic wallets, use API routes instead of direct connection
    const port = party === "alice" ? 4001 : party === "bob" ? 4002 : 4001;
    this.directBaseUrl = `http://127.0.0.1:${port}`;
    this.apiBaseUrl = `/api/hydra/${party}`;
    this.wsUrl = `ws://127.0.0.1:${port}`;
    this.useDirectConnection = useDirectConnection;
  }

  private get baseUrl() {
    return this.useDirectConnection ? this.directBaseUrl : this.apiBaseUrl;
  }

  /**
   * Get current head status
   * Returns null if the node is not available (not running) - this is acceptable
   */
  async getStatus(): Promise<HeadStatus | null> {
    try {
      const url = this.useDirectConnection
        ? `${this.baseUrl}/head`
        : `${this.baseUrl}/status`;
      const response = await fetch(url);

      if (!response.ok) {
        // For connection errors (503, 504), return null instead of throwing
        // This means the node is not running, which is acceptable
        if (response.status === 503 || response.status === 504) {
          return null;
        }

        // Try to get error details from response
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else {
            errorMessage = `HTTP ${response.status}: ${errorData.toString()}`;
          }
        } catch (parseError) {
          // If we can't parse the error, use the status text
          const statusText = response.statusText || `Error ${response.status}`;
          errorMessage = `HTTP ${response.status}: ${statusText}`;
        }

        const error = new Error(errorMessage);
        (error as any).status = response.status;
        (error as any).isServerError = response.status >= 500;
        throw error;
      }

      return await response.json();
    } catch (error) {
      // If it's already our custom error, check if it's a network error
      if (error instanceof Error && (error as any).status) {
        // For network errors, return null instead of throwing - node not running is acceptable
        if ((error as any).isNetworkError) {
          return null;
        }
        throw error;
      }

      // Handle network errors or other fetch failures - return null instead of throwing
      if (error instanceof TypeError && error.message.includes("fetch")) {
        // Node is not running - this is acceptable, return null
        console.log(
          `[HydraAPIClient] ${this.party}'s node is not available (not running)`
        );
        return null;
      }

      console.error(`Error fetching status for ${this.party}:`, error);
      throw error;
    }
  }

  /**
   * Initialize a head (protocol state change)
   */
  async init(): Promise<any> {
    if (this.useDirectConnection) {
      const response = await fetch(`${this.baseUrl}/init`, {
        method: "POST",
      });
      return response.json();
    } else {
      const response = await fetch(`${this.baseUrl}/action?action=init`, {
        method: "POST",
      });
      return response.json();
    }
  }

  /**
   * Commit a UTXO to the head (protocol state change)
   */
  async commit(utxo: string): Promise<CommitResponse> {
    if (this.useDirectConnection) {
      const response = await fetch(`${this.baseUrl}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utxo }),
      });
      return response.json();
    } else {
      const response = await fetch(`${this.baseUrl}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ utxo }),
      });
      return response.json();
    }
  }

  /**
   * Submit a new transaction to an open head
   */
  async newTransaction(txCborHex: string): Promise<any> {
    let response: Response;

    if (this.useDirectConnection) {
      response = await fetch(`${this.baseUrl}/new-transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: txCborHex }),
      });
    } else {
      response = await fetch(`${this.baseUrl}/transaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction: txCborHex }),
      });
    }

    // Check if response is OK before parsing
    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch (parseError) {
        // If we can't parse the error, try to get text
        try {
          const errorText = await response.text();
          errorMessage = errorText || errorMessage;
        } catch (textError) {
          // Use status text as fallback
          errorMessage = response.statusText || errorMessage;
        }
      }

      const error = new Error(errorMessage);
      (error as any).status = response.status;
      throw error;
    }

    return await response.json();
  }

  /**
   * Close the head (protocol state change)
   */
  async close(): Promise<any> {
    if (this.useDirectConnection) {
      const response = await fetch(`${this.baseUrl}/close`, {
        method: "POST",
      });
      return response.json();
    } else {
      const response = await fetch(`${this.baseUrl}/action?action=close`, {
        method: "POST",
      });
      return response.json();
    }
  }

  /**
   * Fanout (finalize) the head (protocol state change)
   */
  async fanout(): Promise<any> {
    if (this.useDirectConnection) {
      const response = await fetch(`${this.baseUrl}/fanout`, {
        method: "POST",
      });
      return response.json();
    } else {
      const response = await fetch(`${this.baseUrl}/action?action=fanout`, {
        method: "POST",
      });
      return response.json();
    }
  }

  /**
   * Get UTXOs from the head snapshot
   */
  async getUTXOs(): Promise<any> {
    if (this.useDirectConnection) {
      const response = await fetch(`${this.baseUrl}/snapshot/utxo`);
      return response.json();
    } else {
      const response = await fetch(`${this.apiBaseUrl}/utxos`);
      return response.json();
    }
  }

  /**
   * Get transaction history from the head
   */
  async getHistory(): Promise<any> {
    if (this.useDirectConnection) {
      // Get head status which contains transaction history
      const headData = await this.getStatus();
      return headData;
    } else {
      const response = await fetch(`${this.apiBaseUrl}/history`);
      return response.json();
    }
  }

  /**
   * Connect to WebSocket for real-time updates
   */
  connect(onMessage?: (data: any) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.onopen = () => {
          console.log(`✅ WebSocket connected for ${this.party}`);
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (onMessage) onMessage(data);
          } catch (error) {
            console.error("Error parsing WebSocket message:", error);
          }
        };

        this.ws.onerror = (error) => {
          console.error(`WebSocket error for ${this.party}:`, error);
          reject(error);
        };

        this.ws.onclose = () => {
          console.log(`WebSocket closed for ${this.party}`);
          this.ws = null;
          // Attempt to reconnect
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => {
              console.log(`Attempting to reconnect ${this.party}...`);
              this.connect(onMessage).catch(console.error);
            }, 1000 * this.reconnectAttempts);
          }
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect WebSocket
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
