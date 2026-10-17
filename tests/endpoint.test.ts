import { describe, expect, it } from "vitest";
import { assertEndpointShape, isPrivateAddress } from "@/lib/endpoint";

describe("isPrivateAddress", () => {
  const cases: [string, boolean][] = [
    ["10.1.2.3", true],
    ["172.16.0.1", true],
    ["172.31.255.255", true],
    ["172.32.0.1", false],
    ["192.168.1.1", true],
    ["127.0.0.1", true],
    ["169.254.169.254", true],
    ["100.64.0.1", true],
    ["0.0.0.0", true],
    ["224.0.0.1", true],
    ["8.8.8.8", false],
    ["1.1.1.1", false],
    ["::1", true],
    ["::", true],
    ["fe80::1", true],
    ["fd00::1", true],
    ["::ffff:127.0.0.1", true],
    ["2001:4860:4860::8888", false],
  ];

  it.each(cases)("%s -> %s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});

describe("assertEndpointShape", () => {
  it("accepts a public https endpoint", () => {
    expect(assertEndpointShape("https://api.together.xyz/v1").host).toBe("api.together.xyz");
    expect(assertEndpointShape("  https://openrouter.ai/api/v1  ").host).toBe("openrouter.ai");
  });

  it("refuses plain http", () => {
    expect(() => assertEndpointShape("http://api.example.com/v1")).toThrow(/https/);
  });

  it("refuses loopback and private hosts", () => {
    expect(() => assertEndpointShape("https://localhost:8080/v1")).toThrow(/不允许/);
    expect(() => assertEndpointShape("https://10.0.0.5/v1")).toThrow(/不允许/);
    expect(() => assertEndpointShape("https://169.254.169.254/latest")).toThrow(/不允许/);
    expect(() => assertEndpointShape("https://metadata.internal/v1")).toThrow(/不允许/);
    expect(() => assertEndpointShape("https://printer.local/v1")).toThrow(/不允许/);
  });

  it("refuses credentials in the URL", () => {
    expect(() => assertEndpointShape("https://user:pass@api.example.com/v1")).toThrow(/账号密码/);
  });

  it("refuses nonsense", () => {
    expect(() => assertEndpointShape("not a url")).toThrow();
    expect(() => assertEndpointShape("")).toThrow();
  });
});
