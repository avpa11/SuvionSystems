# Shared TypeScript configuration

`@repo/typescript-config` supplies configurations used by the API, web app, and
shared packages. Import these JSON files through the npm workspace package.

| File                 | Purpose                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `base.json`          | Strict checking, declarations, and NodeNext defaults               |
| `nextjs.json`        | Next.js plugin, browser libraries, bundler resolution, and no emit |
| `react-library.json` | React JSX settings for shared UI source                            |

For example:

```json
{
  "extends": "@repo/typescript-config/base.json"
}
```

The API and emissions package are ESM and use explicit `.js` extensions in relative
imports. Their TypeScript source resolves those paths through NodeNext. Changes
here affect multiple workspaces; run the root `npm run check` before submitting.
