// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { RelativeTime } from "./RelativeTime";
import React from "react";

// Mock @repo/lib since we're testing the interval logic in the component
vi.mock("@repo/lib", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
  formatRelativeTime: () => "just now",
}));

describe("RelativeTime", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the default interval of 30s", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    render(<RelativeTime date={new Date()} />);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
  });

  it("floors sub-second intervals to 1s", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    render(<RelativeTime date={new Date()} intervalSec={0.5} />);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
  });

  it("prevents zero intervals by flooring to 1s", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    render(<RelativeTime date={new Date()} intervalSec={0} />);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
  });

  it("prevents negative intervals by flooring to 1s", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    render(<RelativeTime date={new Date()} intervalSec={-30} />);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
  });

  it("uses provided valid intervals", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    render(<RelativeTime date={new Date()} intervalSec={60} />);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
  });

  it("handles NaN by falling back to default 30s", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    render(<RelativeTime date={new Date()} intervalSec={NaN} />);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 30000);
  });
});
