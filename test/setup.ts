// Setup for the jsdom (component) project.
// - Adds jest-dom matchers (toBeInTheDocument, toHaveClass, …) to expect.
// - Unmounts rendered trees after each test. Testing Library only auto-cleans
//   when Vitest globals are enabled; we import explicitly, so do it by hand.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
