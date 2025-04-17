import { 
  wait, 
  isUrl, 
  logUsage, 
  hiddenPrompt,
} from "../src/helpers/utilities.helper";
import * as signale from "signale";

jest.mock("signale", () => ({
  log: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  success: jest.fn(),
  pending: jest.fn(),
}));

jest.mock("inquirer", () => ({
  prompt: jest.fn().mockResolvedValue({ hiddenInput: "test input" })
}));

describe("wait()", () => {
  it("resolves after given ms", async () => {
    const start = Date.now();
    await wait(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});

describe("isUrl()", () => {
  it("should return true for http URLs", () => {
    expect(isUrl("http://example.com")).toBe(true);
  });

  it("should return true for https URLs", () => {
    expect(isUrl("https://example.com")).toBe(true);
  });

  it("should return false for non-URLs", () => {
    expect(isUrl("not a url")).toBe(false);
  });
});

describe("logUsage()", () => {
  const signaleMock = signale as jest.Mocked<typeof signale>;

  it("should show success for default values", () => {
    logUsage("TEST_VAR", "default", "default");
    expect(signaleMock.success).toHaveBeenCalled();
  });

  it("should show pending for overridden values", () => {
    logUsage("TEST_VAR", "custom", "default");
    expect(signaleMock.pending).toHaveBeenCalled();
  });
});

describe("hiddenPrompt()", () => {
  it("should return user input", async () => {
    const result = await hiddenPrompt();
    expect(result).toBe("test input");
  });
});