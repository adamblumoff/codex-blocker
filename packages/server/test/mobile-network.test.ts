import { describe, expect, it } from "vitest";
import { assessWindowsDiagnostics } from "../src/mobile-network.js";

describe("assessWindowsDiagnostics", () => {
  it("recommends mobile:fix when port proxy is missing", () => {
    const assessment = assessWindowsDiagnostics(
      {
        profileName: "Home",
        interfaceAlias: "Wi-Fi",
        networkCategory: "Private",
        wifiIp: "192.168.1.10",
        hasPortProxy: false,
        hasPrivateRule: true,
        hasPublicRule: false,
        localhostReachable: true,
        lanReachable: false,
      },
      8765
    );

    expect(assessment.ok).toBe(false);
    expect(assessment.recommendations).toContain(
      "Run: npx codex-blocker mobile:fix --port 8765"
    );
  });

  it("flags public profile mismatch when only private rule exists", () => {
    const assessment = assessWindowsDiagnostics(
      {
        profileName: "Cafe Wi-Fi",
        interfaceAlias: "Wi-Fi",
        networkCategory: "Public",
        wifiIp: "192.168.68.54",
        hasPortProxy: true,
        hasPrivateRule: true,
        hasPublicRule: false,
        localhostReachable: true,
        lanReachable: false,
      },
      8765
    );

    const firewallCheck = assessment.checks.find(
      (check) => check.name === "Firewall rule for Public profile"
    );

    expect(firewallCheck?.ok).toBe(false);
    expect(assessment.recommendations).toContain(
      "Run: npx codex-blocker mobile:fix --port 8765"
    );
  });

  it("passes when proxy, firewall, localhost, and LAN checks are healthy", () => {
    const assessment = assessWindowsDiagnostics(
      {
        profileName: "Home",
        interfaceAlias: "Wi-Fi",
        networkCategory: "Private",
        wifiIp: "192.168.68.54",
        hasPortProxy: true,
        hasPrivateRule: true,
        hasPublicRule: true,
        localhostReachable: true,
        lanReachable: true,
      },
      8765
    );

    expect(assessment.ok).toBe(true);
    expect(assessment.recommendations).toEqual([]);
  });
});
