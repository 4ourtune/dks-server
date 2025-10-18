import { writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

interface LogContext {
  userId?: number;
  vehicleId?: number;
  keyId?: string;
  ip?: string;
  requestData?: any;
  headers?: any;
  systemState?: any;
  promise?: string;
  [key: string]: any; // Allow additional properties
}

class LoggerService {
  private static instance: LoggerService;
  private logLevel: LogLevel;
  private logDirectory: string;
  private isProduction: boolean;

  // Colors for console output
  private colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m",
    bold: "\x1b[1m",
  };

  private constructor() {
    const env = process.env.NODE_ENV || "development";
    this.isProduction = env === "production";

    // Set log level based on environment
    switch (env) {
      case "test":
        this.logLevel = LogLevel.ERROR;
        break;
      case "production":
        this.logLevel = LogLevel.INFO;
        break;
      default:
        this.logLevel = LogLevel.DEBUG;
    }

    this.logDirectory =
      process.env.LOG_DIRECTORY || join(process.cwd(), "logs");
    this.ensureLogDirectory();
  }

  static getInstance(): LoggerService {
    if (!LoggerService.instance) {
      LoggerService.instance = new LoggerService();
    }
    return LoggerService.instance;
  }

  private ensureLogDirectory(): void {
    if (!existsSync(this.logDirectory)) {
      mkdirSync(this.logDirectory, { recursive: true });
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return level <= this.logLevel;
  }

  private getTimestamp(): string {
    const now = new Date();
    return now.toTimeString().split(" ")[0]; // HH:MM:SS format
  }

  private colorize(text: string, color: keyof typeof this.colors): string {
    if (this.isProduction) return text;
    return `${this.colors[color]}${text}${this.colors.reset}`;
  }

  private writeToFile(content: string, errorLog: boolean = false): void {
    if (!this.isProduction && !errorLog) return; // Only write to file in production or for errors

    const today = new Date().toISOString().split("T")[0];
    const filename = errorLog ? `error-${today}.log` : `app-${today}.log`;
    const filepath = join(this.logDirectory, filename);

    try {
      appendFileSync(filepath, content + "\n", "utf8");
    } catch (error) {
      console.error("Failed to write to log file:", error);
    }
  }

  // Basic logging methods
  info(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const timestamp = this.getTimestamp();
    const prefix = this.colorize("[INFO] ", "blue");
    const timeStr = this.colorize(`[${timestamp}]`, "gray");

    const logLine = `${prefix} ${timeStr} ${message}`;
    console.log(logLine);

    const fileContent = `[INFO]  [${timestamp}] ${message}${data ? " " + JSON.stringify(data) : ""}`;
    this.writeToFile(fileContent);
  }

  warn(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.WARN)) return;

    const timestamp = this.getTimestamp();
    const prefix = this.colorize("[WARN] ", "yellow");
    const timeStr = this.colorize(`[${timestamp}]`, "gray");

    const logLine = `${prefix} ${timeStr} ${message}`;
    console.log(logLine);

    const fileContent = `[WARN]  [${timestamp}] ${message}${data ? " " + JSON.stringify(data) : ""}`;
    this.writeToFile(fileContent);
  }

  debug(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const timestamp = this.getTimestamp();
    const prefix = this.colorize("[DEBUG]", "gray");
    const timeStr = this.colorize(`[${timestamp}]`, "gray");

    const logLine = `${prefix} ${timeStr} ${message}`;
    console.log(logLine);
  }

  error(message: string, error?: Error | any, context?: LogContext): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;

    const timestamp = this.getTimestamp();
    const prefix = this.colorize("[ERROR]", "red");
    const timeStr = this.colorize(`[${timestamp}]`, "gray");

    console.log(
      `${prefix} ${timeStr} ${this.colorize(message.toUpperCase(), "bold")}`,
    );

    // Detailed error information
    if (error) {
      const errorInfo =
        error instanceof Error ? error : new Error(String(error));
      console.log(
        `${this.colorize("?쒋?", "red")} Error: ${errorInfo.message}`,
      );

      if (errorInfo.stack && this.shouldLog(LogLevel.DEBUG)) {
        const stackLines = errorInfo.stack.split("\n").slice(1, 4); // Show top 3 stack lines
        console.log(`${this.colorize("?쒋?", "red")} Stack Trace:`);
        stackLines.forEach((line, index) => {
          const isLast = index === stackLines.length - 1;
          const prefix = isLast ? "?붴?" : "?쒋?";
          console.log(`${this.colorize("?? " + prefix, "red")} ${line.trim()}`);
        });
      }
    }

    // Context information
    if (context && Object.keys(context).length > 0) {
      console.log(`${this.colorize("?쒋?", "red")} Context:`);
      if (context.userId)
        console.log(
          `${this.colorize("?? ?쒋?", "red")} User ID: ${context.userId}`,
        );
      if (context.vehicleId)
        console.log(
          `${this.colorize("?? ?쒋?", "red")} Vehicle ID: ${context.vehicleId}`,
        );
      if (context.keyId)
        console.log(
          `${this.colorize("?? ?쒋?", "red")} Key ID: ${context.keyId}`,
        );
      if (context.ip)
        console.log(`${this.colorize("?? ?붴?", "red")} IP: ${context.ip}`);
    }

    // Request data (only in debug mode)
    if (context?.requestData && this.shouldLog(LogLevel.DEBUG)) {
      console.log(`${this.colorize("?쒋?", "red")} Request Data:`);
      console.log(
        `${this.colorize("?? ?붴?", "red")} ${JSON.stringify(context.requestData, null, 2).replace(/\n/g, "\n??    ")}`,
      );
    }

    // System state (only in debug mode)
    if (context?.systemState && this.shouldLog(LogLevel.DEBUG)) {
      console.log(`${this.colorize("?붴?", "red")} System State:`);
      console.log(
        `   ${this.colorize("?붴?", "red")} ${JSON.stringify(context.systemState, null, 2).replace(/\n/g, "\n      ")}`,
      );
    }

    // Write detailed error to file
    let fileContent = `[ERROR] [${timestamp}] ${message}\n`;
    if (error) {
      const errorInfo =
        error instanceof Error ? error : new Error(String(error));
      fileContent += `?쒋? Error: ${errorInfo.message}\n`;
      if (errorInfo.stack) {
        fileContent += `?쒋? Stack: ${errorInfo.stack.replace(/\n/g, "\n?? ")}\n`;
      }
    }
    if (context) {
      fileContent += `?쒋? Context: ${JSON.stringify(context, null, 2).replace(/\n/g, "\n?? ")}\n`;
    }
    fileContent += `?붴? Timestamp: ${new Date().toISOString()}`;

    this.writeToFile(fileContent, true);
  }

  // API logging
  api(
    method: string,
    path: string,
    statusCode: number,
    responseTime: number,
    extra?: any,
  ): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const timestamp = this.getTimestamp();
    const prefix = this.colorize("[API]  ", "cyan");
    const timeStr = this.colorize(`[${timestamp}]`, "gray");

    let statusColor: keyof typeof this.colors = "green";
    if (statusCode >= 400) statusColor = "red";
    else if (statusCode >= 300) statusColor = "yellow";

    const statusStr = this.colorize(statusCode.toString(), statusColor);
    const methodStr = this.colorize(method, "magenta");

    let logLine = `${prefix} ${timeStr} ${methodStr} ${path} - ${statusStr} (${responseTime}ms)`;

    if (extra?.error) {
      logLine += ` - ${extra.error}`;
    }

    console.log(logLine);

    // Write to file only for important requests or errors
    if (statusCode >= 400 || this.isProduction) {
      const fileContent = `[API]   [${timestamp}] ${method} ${path} - ${statusCode} (${responseTime}ms)${extra?.error ? " - " + extra.error : ""}`;
      this.writeToFile(fileContent);
    }
  }

  // Business logic logging
  auth(
    action: string,
    data: { email?: string; userId?: number; error?: string },
  ): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const timestamp = this.getTimestamp();
    const prefix = this.colorize("[OK]   ", "green");
    const timeStr = this.colorize(`[${timestamp}]`, "gray");

    let message = "";
    switch (action) {
      case "login_success":
        message = `User login: ${data.email}`;
        break;
      case "register_success":
        message = `User registered: ${data.email}`;
        break;
      case "logout":
        message = `User logout: ${data.email || "Unknown"}`;
        break;
      case "token_refresh":
        message = `Token refreshed for user: ${data.userId}`;
        break;
      default:
        message = `Auth ${action}: ${JSON.stringify(data)}`;
    }

    if (data.error) {
      const errorPrefix = this.colorize("[ERROR]", "red");
      console.log(
        `${errorPrefix} ${timeStr} Auth ${action} failed: ${data.error}`,
      );
    } else {
      console.log(`${prefix} ${timeStr} ${message}`);
    }

    const fileContent = `[AUTH]  [${timestamp}] ${action}: ${JSON.stringify(data)}`;
    this.writeToFile(fileContent);
  }

  vehicle(
    action: string,
    data: {
      vehicleId: number;
      userId: number;
      success?: boolean;
      error?: string;
    },
  ): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const timestamp = this.getTimestamp();
    const success = data.success !== false;
    const prefix = success
      ? this.colorize("[CAR]  ", "green")
      : this.colorize("[ERROR]", "red");
    const timeStr = this.colorize(`[${timestamp}]`, "gray");

    const statusText = success ? "success" : "failed";
    const message = `Vehicle ${action}: ${statusText} (Vehicle #${data.vehicleId}, User #${data.userId})`;

    console.log(
      `${prefix} ${timeStr} ${message}${data.error ? " - " + data.error : ""}`,
    );

    const fileContent = `[VEHICLE] [${timestamp}] ${action}: ${JSON.stringify(data)}`;
    this.writeToFile(fileContent);
  }

  key(
    action: string,
    data: {
      keyId: string;
      userId: number;
      vehicleId: number;
      success?: boolean;
      error?: string;
    },
  ): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const timestamp = this.getTimestamp();
    const success = data.success !== false;
    const prefix = success
      ? this.colorize("[KEY]  ", "yellow")
      : this.colorize("[ERROR]", "red");
    const timeStr = this.colorize(`[${timestamp}]`, "gray");

    let message = "";
    switch (action) {
      case "create":
        message = `Digital key created for Vehicle #${data.vehicleId}`;
        break;
      case "delete":
        message = `Digital key deleted: ${data.keyId}`;
        break;
      case "validate":
        message = `Key validation ${success ? "successful" : "failed"}: ${data.keyId}`;
        break;
      default:
        message = `Key ${action}: ${data.keyId}`;
    }

    console.log(
      `${prefix} ${timeStr} ${message}${data.error ? " - " + data.error : ""}`,
    );

    const fileContent = `[KEY]   [${timestamp}] ${action}: ${JSON.stringify(data)}`;
    this.writeToFile(fileContent);
  }

  socket(event: string, data?: any): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;

    const timestamp = this.getTimestamp();
    const prefix = this.colorize("[WS]   ", "magenta");
    const timeStr = this.colorize(`[${timestamp}]`, "gray");

    const message = `Socket ${event}${data ? ": " + JSON.stringify(data) : ""}`;
    console.log(`${prefix} ${timeStr} ${message}`);
  }

  // Server lifecycle
  server(message: string, data?: any): void {
    if (!this.shouldLog(LogLevel.INFO)) return;

    const timestamp = this.getTimestamp();
    const prefix = this.colorize("[INFO] ", "blue");
    const timeStr = this.colorize(`[${timestamp}]`, "gray");

    console.log(`${prefix} ${timeStr} ${message}`);

    const fileContent = `[SERVER] [${timestamp}] ${message}${data ? " " + JSON.stringify(data) : ""}`;
    this.writeToFile(fileContent);
  }

  // Get log statistics (simplified)
  getLogStats(): any {
    return {
      logDirectory: this.logDirectory,
      currentLogLevel: LogLevel[this.logLevel],
      environment: process.env.NODE_ENV || "development",
      isProduction: this.isProduction,
    };
  }
}

export default LoggerService;
