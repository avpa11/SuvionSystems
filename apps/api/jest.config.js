import { createDefaultEsmPreset } from "ts-jest";

const preset = createDefaultEsmPreset();

/** @type {import('jest').Config} */
export default {
  ...preset,
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  roots: ["<rootDir>"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  modulePathIgnorePatterns: ["<rootDir>/node_modules", "<rootDir>/dist"],
  testMatch: ["**/__tests__/**/*.test.ts"],
};
