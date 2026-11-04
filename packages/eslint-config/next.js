/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["eslint:recommended", "next/core-web-vitals", "prettier"],
  env: { node: true, browser: true, es6: true },
  ignorePatterns: ["node_modules/", ".next/", "next-env.d.ts"],
};
