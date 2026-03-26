import { describe, expect, it } from "vitest";

import {
  MINTING_DATA_HANDLE_NAME,
  SETTINGS_HANDLE_NAME,
} from "../src/constants/index.js";

describe("constants", () => {
  it("uses the live HAL handle names", () => {
    expect(SETTINGS_HANDLE_NAME).toBe("hal@handle_settings");
    expect(MINTING_DATA_HANDLE_NAME).toBe("hal_root@handle_settings");
  });
});
