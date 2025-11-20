import { spawn } from "child_process";
import type { SpawnOptions } from "child_process";

export interface RunResult {
  stdout: string;
  stderr: string;
}

// Semaphore to limit concurrent cardano-cli commands
// This prevents blocking when multiple queries run simultaneously
class CommandSemaphore {
  private queue: Array<() => void> = [];
  private running = 0;
  private maxConcurrent: number;

  constructor(maxConcurrent: number = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  async acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      if (this.running < this.maxConcurrent) {
        this.running++;
        resolve(() => this.release());
      } else {
        this.queue.push(() => {
          this.running++;
          resolve(() => this.release());
        });
      }
    });
  }

  private release() {
    this.running--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}

// Separate semaphores for different command types
const cardanoCliSemaphore = new CommandSemaphore(2); // Limit to 2 concurrent cardano-cli commands
const generalSemaphore = new CommandSemaphore(5); // More lenient for other commands

export function runCommand(
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnOptions & { logCommand?: string } = {}
): Promise<RunResult> {
  // Use cardano-cli semaphore if it's a cardano-cli command
  const semaphore =
    command.includes("cardano-cli") || command.endsWith("cardano-cli")
      ? cardanoCliSemaphore
      : generalSemaphore;

  return new Promise(async (resolve, reject) => {
    // Acquire semaphore before running command
    const release = await semaphore.acquire();

    try {
      const child = spawn(command, args, {
        stdio: ["ignore", "pipe", "pipe"],
        ...options,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("error", (error) => {
        release();
        reject(error);
      });

      child.on("close", (code) => {
        release(); // Release semaphore when command completes
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          const error = new Error(
            `Command failed (${command} ${args.join(
              " "
            )}): exit code ${code}\n${stderr}`
          );
          reject(error);
        }
      });
    } catch (error) {
      release();
      reject(error);
    }
  });
}
