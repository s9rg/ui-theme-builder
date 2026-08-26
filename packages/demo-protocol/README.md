# `@s9rg/theme-demo-protocol`

Versioned, runtime-validated message data for Theme Compiler previews.

> 0.5.0 is an early 0.x release. APIs may change before 1.0.0.

## Install

```sh
npm install @s9rg/theme-demo-protocol
```

## Usage

```ts
import {
  createThemeUpdateMessage,
  safeParsePreviewMessage,
} from "@s9rg/theme-demo-protocol";

const update = createThemeUpdateMessage({
  requestId: "mui@9:light:1",
  target: "mui@9",
  profile: "light",
  fidelity: "exact-runtime",
  colors: {
    background: "#f8faff",
    surface: "#ffffff",
    foreground: "#13161f",
    muted: "#66708a",
    primary: "#6f56f3",
    primaryText: "#ffffff",
    accent: "#09b6d4",
    accentText: "#13161f",
    border: "#66708a",
  },
});

const parsed = safeParsePreviewMessage(update);
if (!parsed.success) console.error(parsed.issues);
```

Protocol `@s9rg/theme-preview` version `1` defines `theme.update`, `preview.ready`, and
`preview.error`. It supports `light` and `dark` profiles and these fidelity values:

- `exact-runtime`
- `exact-css-variables`
- `mapped-preview`
- `native-web-approximation`
- `compile-verified`

Parsing requires plain objects, rejects unknown fields, bounds identifier and error lengths, and
requires all nine semantic colors to be strict hexadecimal values. `assertPreviewMessage` is available
when throwing validation is preferable.

The current protocol validates message data; it is not yet a secure iframe transport. It has no origin
policy, session nonce, input hash, or `rendered` acknowledgement. Those features must be added before
cross-document previews ship. Generated source code is intentionally absent from every message.

## License

MIT
