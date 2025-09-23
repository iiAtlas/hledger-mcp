import { execSync } from "child_process";

const DEFAULT_EXECUTABLE = "hledger";
const PLACEHOLDER_VALUE = "${user_config.hledgerExecutablePath}";

let hledgerExecutablePath = DEFAULT_EXECUTABLE;

const COMMON_PATHS = [
  "hledger", // System PATH lookup
  "/opt/homebrew/bin/hledger", // Homebrew on Apple Silicon
  "/usr/local/bin/hledger", // Homebrew on Intel
  "/usr/bin/hledger", // System install
  "/home/linuxbrew/.linuxbrew/bin/hledger", // Linux Homebrew
  "~/.local/bin/hledger", // User install
  "~/.cabal/bin/hledger", // Cabal install
  "~/.stack/bin/hledger", // Stack install
];

export function getHledgerPath(): string {
  return hledgerExecutablePath;
}

export function checkHledgerInstallation(): boolean {
  const customPath = process.env.HLEDGER_EXECUTABLE_PATH;
  if (
    customPath &&
    customPath !== PLACEHOLDER_VALUE &&
    customPath.trim() !== ""
  ) {
    if (verifyExecutable(customPath, true)) {
      hledgerExecutablePath = customPath;
      return true;
    }
  }

  for (const path of COMMON_PATHS) {
    if (verifyExecutable(path)) {
      hledgerExecutablePath = path;
      return true;
    }
  }

  return false;
}

function verifyExecutable(path: string, quote = false): boolean {
  try {
    const command = quote ? `"${path}" --version` : `${path} --version`;
    execSync(command, {
      stdio: "pipe",
      timeout: 5000,
    });
    return true;
  } catch {
    return false;
  }
}

export function resetHledgerPathForTesting(): void {
  hledgerExecutablePath = DEFAULT_EXECUTABLE;
}
