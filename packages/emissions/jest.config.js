import { createDefaultEsmPreset } from "ts-jest";

const preset = createDefaultEsmPreset();

/** @type {import('jest').Config} */
export default {
  ...preset,
  moduleNameMapper: {
    // Map .js import paths to extensionless so Jest finds the .ts source files
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  roots: ["<rootDir>"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json", "node"],
  modulePathIgnorePatterns: ["<rootDir>/node_modules", "<rootDir>/dist"],
};
