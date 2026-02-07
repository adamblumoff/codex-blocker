import { describe, expect, it } from "vitest";
import {
  assessWindowsDiagnostics,
  parseFirstIpv4Candidate,
  parseRouteSourceIpv4,
} from "../src/mobile-network.js";

describe("assessWindowsDiagnostics", () => {
  it("parses the first IPv4 candidate from shell output", () => {
    expect(parseFirstIpv4Candidate("172.27.80.2 10.0.0.4\n")).toBe("172.27.80.2");
    expect(parseFirstIpv4Candidate("no ipv4 here")).toBeNull();
  });

  it("parses default-route source IPv4 from ip route output", () => {
    const routeOutput =
      "1.1.1.1 via 172.27.80.1 dev eth0 src 172.27.94.44 uid 1000 cache";
    expect(parseRouteSourceIpv4(routeOutput)).toBe("172.27.94.44");
    expect(parseRouteSourceIpv4("no src value")).toBeNull();
  });

  it("recommends mobile:fix when port proxy is missing", () => {
    const assessment = assessWindowsDiagnostics(
      {
        profileName: "Home",
        interfaceAlias: "Wi-Fi",
        networkCategory: "Private",
        wifiIp: "192.168.1.10",
        hasPortProxy: false,
        portProxyTarget: null,
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

  it("requires explicit allow-public mode on public network profiles", () => {
    const assessment = assessWindowsDiagnostics(
      {
        profileName: "Cafe Wi-Fi",
        interfaceAlias: "Wi-Fi",
        networkCategory: "Public",
        wifiIp: "192.168.68.54",
        hasPortProxy: true,
        portProxyTarget: "127.0.0.1",
        hasPrivateRule: true,
        hasPublicRule: false,
        localhostReachable: true,
        lanReachable: false,
      },
      8765,
      { allowPublicFirewallRule: false }
    );

    const firewallCheck = assessment.checks.find(
      (check) => check.name === "Firewall rule for Public profile"
    );

    expect(firewallCheck?.ok).toBe(false);
    expect(assessment.recommendations).toContain(
      "Run: npx codex-blocker mobile:fix --port 8765 --allow-public"
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
        portProxyTarget: "127.0.0.1",
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

  it("recommends router isolation check when LAN remains unreachable after host setup", () => {
    const assessment = assessWindowsDiagnostics(
      {
        profileName: "Public Hotspot",
        interfaceAlias: "Wi-Fi",
        networkCategory: "Public",
        wifiIp: "192.168.68.54",
        hasPortProxy: true,
        portProxyTarget: "127.0.0.1",
        hasPrivateRule: true,
        hasPublicRule: true,
        localhostReachable: true,
        lanReachable: false,
      },
      8765,
      { allowPublicFirewallRule: true }
    );

    expect(assessment.recommendations).toContain(
      "Check router/client isolation or guest Wi-Fi settings (phone may be blocked from peer LAN devices)."
    );
  });
});
