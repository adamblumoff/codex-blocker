import { execFile } from "child_process";
import { existsSync } from "fs";
import { promisify } from "util";

const execFileAsync = promisify(execFile);
const WSL_POWERSHELL_PATH = "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe";

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type WindowsDiagnostics = {
  profileName: string | null;
  interfaceAlias: string | null;
  networkCategory: "Public" | "Private" | "DomainAuthenticated" | "Unknown";
  wifiIp: string | null;
  hasPortProxy: boolean;
  portProxyTarget: string | null;
  hasPrivateRule: boolean;
  hasPublicRule: boolean;
  localhostReachable: boolean;
  lanReachable: boolean;
};

export type DoctorReport = {
  ok: boolean;
  checks: Array<{ name: string; ok: boolean; details: string }>;
  recommendations: string[];
};

export type WindowsDoctorAssessment = {
  checks: Array<{ name: string; ok: boolean; details: string }>;
  recommendations: string[];
  ok: boolean;
};

export type MobileNetworkOptions = {
  allowPublicFirewallRule?: boolean;
};

const IPV4_MATCH =
  /\b((?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3})\b/;

export function parseFirstIpv4Candidate(raw: string): string | null {
  const match = raw.match(IPV4_MATCH);
  return match ? match[1] : null;
}

function detectWsl(): boolean {
  if (process.platform !== "linux") return false;
  return Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP);
}

function getPowerShellExecutable(): string | null {
  if (process.platform === "win32") {
    return "powershell.exe";
  }

  if (detectWsl() && existsSync(WSL_POWERSHELL_PATH)) {
    return WSL_POWERSHELL_PATH;
  }

  return null;
}

async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      maxBuffer: 1024 * 1024,
    });
    return {
      code: 0,
      stdout,
      stderr,
    };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
    };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? failure.message,
    };
  }
}

async function checkDiscovery(url: string): Promise<{ ok: boolean; details: string }> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2_000),
    });
    if (!response.ok) {
      return {
        ok: false,
        details: `${response.status} ${response.statusText}`,
      };
    }
    return {
      ok: true,
      details: "reachable",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      details: message,
    };
  }
}

async function resolvePortProxyConnectAddress(): Promise<string> {
  if (!detectWsl()) {
    return "127.0.0.1";
  }

  const probe = await runCommand("sh", ["-lc", "hostname -I"]);
  if (probe.code !== 0) {
    return "127.0.0.1";
  }

  const ip = parseFirstIpv4Candidate(probe.stdout);
  return ip ?? "127.0.0.1";
}

function parseWindowsDiagnostics(rawJson: string): WindowsDiagnostics | null {
  try {
    const data = JSON.parse(rawJson) as Partial<WindowsDiagnostics>;
    return {
      profileName: typeof data.profileName === "string" ? data.profileName : null,
      interfaceAlias:
        typeof data.interfaceAlias === "string" ? data.interfaceAlias : null,
      networkCategory:
        data.networkCategory === "Public" ||
        data.networkCategory === "Private" ||
        data.networkCategory === "DomainAuthenticated"
          ? data.networkCategory
          : "Unknown",
      wifiIp: typeof data.wifiIp === "string" ? data.wifiIp : null,
      hasPortProxy: Boolean(data.hasPortProxy),
      portProxyTarget:
        typeof data.portProxyTarget === "string" ? data.portProxyTarget : null,
      hasPrivateRule: Boolean(data.hasPrivateRule),
      hasPublicRule: Boolean(data.hasPublicRule),
      localhostReachable: Boolean(data.localhostReachable),
      lanReachable: Boolean(data.lanReachable),
    };
  } catch {
    return null;
  }
}

function toPowerShellEncodedCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function buildWindowsDoctorScript(port: number): string {
  return `
$ErrorActionPreference = 'SilentlyContinue'
$port = ${port}

$profile = Get-NetConnectionProfile | Where-Object { $_.IPv4Connectivity -ne 'Disconnected' } | Select-Object -First 1
$wifiIp = $null
if ($profile) {
  $wifiIp = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.InterfaceAlias -eq $profile.InterfaceAlias -and $_.IPAddress -notlike '169.254*' } |
    Select-Object -First 1 -ExpandProperty IPAddress
}

$proxyTable = netsh interface portproxy show v4tov4 | Out-String
$proxyLine = ($proxyTable -split "\\r?\\n") |
  Where-Object { $_ -match ("^\\s*0\\.0\\.0\\.0\\s+" + $port + "\\s+") } |
  Select-Object -First 1
$hasPortProxy = $false
$portProxyTarget = $null
if ($proxyLine) {
  $parts = ($proxyLine -split "\\s+") | Where-Object { $_ -ne "" }
  if ($parts.Count -ge 4 -and [string]$parts[3] -eq [string]$port) {
    $hasPortProxy = $true
    $portProxyTarget = [string]$parts[2]
  }
}

$privateRule = Get-NetFirewallRule -DisplayName "Codex Blocker $port Private LocalSubnet" -ErrorAction SilentlyContinue
$publicRule = Get-NetFirewallRule -DisplayName "Codex Blocker $port Public LocalSubnet" -ErrorAction SilentlyContinue

$localhostReachable = $false
try {
  Invoke-RestMethod -Uri ("http://127.0.0.1:" + $port + "/mobile/discovery") -Method Get -TimeoutSec 2 | Out-Null
  $localhostReachable = $true
} catch {}

$lanReachable = $false
if ($wifiIp) {
  try {
    Invoke-RestMethod -Uri ("http://" + $wifiIp + ":" + $port + "/mobile/discovery") -Method Get -TimeoutSec 2 | Out-Null
    $lanReachable = $true
  } catch {}
}

[pscustomobject]@{
  profileName = if ($profile) { $profile.Name } else { $null }
  interfaceAlias = if ($profile) { $profile.InterfaceAlias } else { $null }
  networkCategory = if ($profile) { [string]$profile.NetworkCategory } else { "Unknown" }
  wifiIp = $wifiIp
  hasPortProxy = [bool]$hasPortProxy
  portProxyTarget = $portProxyTarget
  hasPrivateRule = [bool]$privateRule
  hasPublicRule = [bool]$publicRule
  localhostReachable = $localhostReachable
  lanReachable = $lanReachable
} | ConvertTo-Json -Compress
`.trim();
}

function buildWindowsFixScript(
  port: number,
  allowPublicFirewallRule: boolean,
  connectAddress: string
): string {
  const allowPublicLiteral = allowPublicFirewallRule ? "$true" : "$false";
  const elevatedCommands = `
$ErrorActionPreference = 'Stop'
$port = ${port}
$allowPublic = ${allowPublicLiteral}
$connectAddress = "${connectAddress}"

netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port 2>$null | Out-Null
netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=$port 2>$null | Out-Null
netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=$port connectaddress=$connectAddress connectport=$port

if (-not $allowPublic) {
  Remove-NetFirewallRule -DisplayName "Codex Blocker $port Public LocalSubnet" -ErrorAction SilentlyContinue | Out-Null
}

$profiles = @('Private')
if ($allowPublic) {
  $profiles += 'Public'
}

foreach ($profile in $profiles) {
  $ruleName = "Codex Blocker $port $profile LocalSubnet"
  if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName $ruleName | Out-Null
  }

  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile $profile -RemoteAddress LocalSubnet | Out-Null
}

Write-Output "Configured portproxy + firewall for port $port (allowPublic=$allowPublic, connectAddress=$connectAddress)"
netsh interface portproxy show v4tov4
`.trim();

  return buildWindowsElevatedScript(elevatedCommands);
}

function buildWindowsRemoveScript(port: number): string {
  const elevatedCommands = `
$ErrorActionPreference = 'SilentlyContinue'
$port = ${port}

netsh interface portproxy delete v4tov4 listenaddress=0.0.0.0 listenport=$port 2>$null | Out-Null
netsh interface portproxy delete v4tov4 listenaddress=127.0.0.1 listenport=$port 2>$null | Out-Null
netsh interface portproxy delete v4tov4 listenaddress=:: listenport=$port 2>$null | Out-Null

Remove-NetFirewallRule -DisplayName "Codex Blocker $port Private LocalSubnet" -ErrorAction SilentlyContinue | Out-Null
Remove-NetFirewallRule -DisplayName "Codex Blocker $port Public LocalSubnet" -ErrorAction SilentlyContinue | Out-Null
Remove-NetFirewallRule -DisplayName "Codex Blocker $port" -ErrorAction SilentlyContinue | Out-Null

Write-Output "Removed Codex Blocker networking setup for port $port"
netsh interface portproxy show v4tov4
`.trim();

  return buildWindowsElevatedScript(elevatedCommands);
}

function buildWindowsElevatedScript(elevatedCommands: string): string {
  const encoded = toPowerShellEncodedCommand(elevatedCommands);
  return `
$ErrorActionPreference = 'Stop'
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  $proc = Start-Process -FilePath "powershell.exe" -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}" -Wait -PassThru
  exit $proc.ExitCode
}

${elevatedCommands}
`.trim();
}

async function runPowerShellScript(
  powershellExe: string,
  script: string
): Promise<CommandResult> {
  return runCommand(powershellExe, [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ]);
}

export function assessWindowsDiagnostics(
  diagnostics: WindowsDiagnostics,
  port: number,
  options?: MobileNetworkOptions
): WindowsDoctorAssessment {
  const allowPublicFirewallRule = options?.allowPublicFirewallRule ?? false;
  const checks: Array<{ name: string; ok: boolean; details: string }> = [];

  checks.push({
    name: "Port proxy (0.0.0.0 -> target)",
    ok: diagnostics.hasPortProxy,
    details: diagnostics.hasPortProxy
      ? `configured for TCP ${port} -> ${diagnostics.portProxyTarget ?? "unknown"}`
      : `missing for TCP ${port}`,
  });

  const category = diagnostics.networkCategory;
  let profileRuleOk = false;
  let profileDetails = `private=${diagnostics.hasPrivateRule}, public=${diagnostics.hasPublicRule}`;
  if (category === "Public") {
    profileRuleOk = allowPublicFirewallRule
      ? diagnostics.hasPublicRule
      : false;
    profileDetails = allowPublicFirewallRule
      ? `private=${diagnostics.hasPrivateRule}, public=${diagnostics.hasPublicRule}`
      : "public profile is locked down by default; pass --allow-public if you need LAN access on public Wi-Fi";
  } else if (category === "Private") {
    profileRuleOk = diagnostics.hasPrivateRule;
  } else {
    profileRuleOk = diagnostics.hasPrivateRule || diagnostics.hasPublicRule;
  }

  checks.push({
    name: `Firewall rule for ${category} profile`,
    ok: profileRuleOk,
    details: profileDetails,
  });

  checks.push({
    name: "Windows loopback access",
    ok: diagnostics.localhostReachable,
    details: diagnostics.localhostReachable
      ? "http://127.0.0.1 reachable"
      : "http://127.0.0.1 unreachable",
  });

  checks.push({
    name: "Windows LAN access",
    ok: diagnostics.lanReachable,
    details: diagnostics.wifiIp
      ? diagnostics.lanReachable
        ? `http://${diagnostics.wifiIp}:${port} reachable`
        : `http://${diagnostics.wifiIp}:${port} unreachable`
      : "Wi-Fi IPv4 not detected",
  });

  const recommendations: string[] = [];
  const fixCommand = allowPublicFirewallRule
    ? `Run: npx codex-blocker mobile:fix --port ${port} --allow-public`
    : `Run: npx codex-blocker mobile:fix --port ${port}`;
  if (!diagnostics.hasPortProxy || !profileRuleOk) {
    recommendations.push(
      category === "Public" && !allowPublicFirewallRule
        ? `Run: npx codex-blocker mobile:fix --port ${port} --allow-public`
        : fixCommand
    );
  }
  if (category === "Public" && !allowPublicFirewallRule) {
    recommendations.push(
      "Public Wi-Fi profile detected. Either switch this network to Private or use --allow-public for mobile LAN access."
    );
  }
  if (
    diagnostics.localhostReachable &&
    diagnostics.hasPortProxy &&
    profileRuleOk &&
    !diagnostics.lanReachable
  ) {
    recommendations.push(
      "Check router/client isolation or guest Wi-Fi settings (phone may be blocked from peer LAN devices)."
    );
  }

  const ok = checks.every((check) => check.ok);
  return {
    checks,
    recommendations,
    ok,
  };
}

export async function runMobileDoctor(
  port: number,
  options?: MobileNetworkOptions
): Promise<boolean> {
  const allowPublicFirewallRule = options?.allowPublicFirewallRule ?? false;
  const report: DoctorReport = {
    ok: true,
    checks: [],
    recommendations: [],
  };

  const localCheck = await checkDiscovery(`http://127.0.0.1:${port}/mobile/discovery`);
  report.checks.push({
    name: "Local server from current shell",
    ok: localCheck.ok,
    details: localCheck.details,
  });
  if (!localCheck.ok) {
    report.recommendations.push("Start the server: npx codex-blocker");
  }

  const powershellExe = getPowerShellExecutable();
  if (!powershellExe) {
    report.recommendations.push(
      "PowerShell not found. Windows-specific diagnostics are unavailable in this environment."
    );
  } else {
    const doctorScript = buildWindowsDoctorScript(port);
    const doctorResult = await runPowerShellScript(powershellExe, doctorScript);

    if (doctorResult.code !== 0) {
      report.checks.push({
        name: "Windows diagnostics execution",
        ok: false,
        details: doctorResult.stderr.trim() || "failed",
      });
      report.recommendations.push(
        "Failed to query Windows networking state. Try running mobile:doctor from a Windows terminal."
      );
    } else {
      const diagnostics = parseWindowsDiagnostics(doctorResult.stdout);
      if (!diagnostics) {
        report.checks.push({
          name: "Windows diagnostics parsing",
          ok: false,
          details: "Unexpected PowerShell output",
        });
        report.recommendations.push(
          "Unable to parse Windows diagnostics output. Re-run with a clean shell."
        );
      } else {
        const windowsAssessment = assessWindowsDiagnostics(diagnostics, port, {
          allowPublicFirewallRule,
        });
        for (const check of windowsAssessment.checks) {
          report.checks.push(check);
        }
        report.recommendations.push(...windowsAssessment.recommendations);

        if (localCheck.ok && !diagnostics.localhostReachable) {
          report.recommendations.push(
            "Windows cannot reach the forwarded localhost port. Re-run mobile:fix so portproxy can target the current WSL IP."
          );
        }
      }
    }
  }

  report.ok = report.checks.every((check) => check.ok);

  console.log("\nCodex Blocker Mobile Doctor");
  console.log(`Port: ${port}`);
  if (detectWsl()) {
    console.log("Environment: WSL");
  }
  console.log("");

  for (const check of report.checks) {
    const icon = check.ok ? "[OK]" : "[FAIL]";
    console.log(`${icon} ${check.name} - ${check.details}`);
  }

  console.log("");
  if (report.recommendations.length > 0) {
    console.log("Recommendations:");
    for (const recommendation of report.recommendations) {
      console.log(`- ${recommendation}`);
    }
  } else {
    console.log("No issues detected.");
  }

  console.log("");
  return report.ok;
}

export async function runMobileFix(
  port: number,
  options?: MobileNetworkOptions
): Promise<boolean> {
  return runMobileFixWithOptions(port, options);
}

async function runMobileFixWithOptions(
  port: number,
  options?: MobileNetworkOptions
): Promise<boolean> {
  const allowPublicFirewallRule = options?.allowPublicFirewallRule ?? false;
  const powershellExe = getPowerShellExecutable();
  if (!powershellExe) {
    console.error("PowerShell is required for mobile:fix but was not found.");
    return false;
  }

  const connectAddress = await resolvePortProxyConnectAddress();
  const script = buildWindowsFixScript(port, allowPublicFirewallRule, connectAddress);
  const result = await runPowerShellScript(powershellExe, script);

  if (result.code !== 0) {
    const stderr = result.stderr.trim() || "unknown error";
    console.error(`mobile:fix failed: ${stderr}`);
    return false;
  }

  const stdout = result.stdout.trim();
  if (stdout) {
    console.log(stdout);
  }

  console.log("\nRunning doctor after fix...\n");
  return runMobileDoctor(port, { allowPublicFirewallRule });
}

export async function runMobileRemove(port: number): Promise<boolean> {
  const powershellExe = getPowerShellExecutable();
  if (!powershellExe) {
    console.error("PowerShell is required for mobile:remove but was not found.");
    return false;
  }

  const script = buildWindowsRemoveScript(port);
  const result = await runPowerShellScript(powershellExe, script);

  if (result.code !== 0) {
    const stderr = result.stderr.trim() || "unknown error";
    console.error(`mobile:remove failed: ${stderr}`);
    return false;
  }

  const stdout = result.stdout.trim();
  if (stdout) {
    console.log(stdout);
  }

  console.log("\nRunning doctor after remove...\n");
  await runMobileDoctor(port);
  return true;
}
