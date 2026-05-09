/**
 * Next.js Node 进程文件日志：%LOCALAPPDATA%\\MData\\Logs\\console-YYYY-MM-DD.log
 * 仅在服务端初始化（instrumentation）；浏览器端不执行。
 */

import fs from "fs";
import os from "os";
import path from "path";

function localAppData(): string {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return process.env.LOCALAPPDATA;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return path.join(os.homedir(), ".local", "share");
}

function logsDir(): string {
  const raw = process.env.MDATA_LOGS_DIR?.trim();
  if (raw) return path.resolve(raw);
  return path.join(localAppData(), "MData", "Logs");
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function padMs(n: number): string {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`;
}

function timestampMs(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())},${padMs(d.getMilliseconds())}`;
}

let currentDateKey = "";
let writeStream: fs.WriteStream | null = null;

function ensureStream(): fs.WriteStream {
  const d = new Date();
  const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  if (key !== currentDateKey || !writeStream) {
    currentDateKey = key;
    if (writeStream) {
      try {
        writeStream.end();
      } catch {
        /* ignore */
      }
      writeStream = null;
    }
    const dir = logsDir();
    fs.mkdirSync(dir, { recursive: true });
    const fp = path.join(dir, `console-${key}.log`);
    writeStream = fs.createWriteStream(fp, { flags: "a" });
  }
  return writeStream;
}

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

export function initMdataConsoleFileLogging(): void {
  if (typeof window !== "undefined") return;

  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  const writeLine = (level: string, args: unknown[]) => {
    try {
      const line = `${timestampMs()} | ${level} | ${formatArgs(args)}\n`;
      ensureStream().write(line);
    } catch {
      /* ignore disk errors */
    }
  };

  console.log = (...args: unknown[]) => {
    writeLine("INFO", args);
    origLog(...args);
  };
  console.warn = (...args: unknown[]) => {
    writeLine("WARN", args);
    origWarn(...args);
  };
  console.error = (...args: unknown[]) => {
    writeLine("ERROR", args);
    origErr(...args);
  };
}
