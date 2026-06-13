/**
 * Node 文件日志实现（CommonJS，供 instrumentation 运行时加载，避免 webpack 打包 fs）。
 */
/* eslint-disable @typescript-eslint/no-require-imports */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

function localAppData() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return process.env.LOCALAPPDATA;
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support");
  }
  return path.join(os.homedir(), ".local", "share");
}

function logsDir() {
  const raw = process.env.ALICE_LOGS_DIR && String(process.env.ALICE_LOGS_DIR).trim();
  if (raw) return path.resolve(raw);
  return path.join(localAppData(), "Alice", "Logs");
}

function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

function padMs(n) {
  return n < 10 ? `00${n}` : n < 100 ? `0${n}` : `${n}`;
}

function timestampMs() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())},${padMs(d.getMilliseconds())}`;
}

let currentDateKey = "";
let writeStream = null;

function ensureStream() {
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

function formatArgs(args) {
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

function initAliceConsoleFileLogging() {
  const origLog = console.log.bind(console);
  const origErr = console.error.bind(console);
  const origWarn = console.warn.bind(console);

  const writeLine = (level, args) => {
    try {
      const line = `${timestampMs()} | ${level} | ${formatArgs(args)}\n`;
      ensureStream().write(line);
    } catch {
      /* ignore disk errors */
    }
  };

  console.log = (...args) => {
    writeLine("INFO", args);
    origLog(...args);
  };
  console.warn = (...args) => {
    writeLine("WARN", args);
    origWarn(...args);
  };
  console.error = (...args) => {
    writeLine("ERROR", args);
    origErr(...args);
  };
}

module.exports = { initAliceConsoleFileLogging };
