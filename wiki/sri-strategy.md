# SRI & CDN Strategy

## Current state
The CSP meta tag in `app/+html.tsx` restricts all resource loading to `'self'` plus safe protocols (`https:`, `blob:`, `data:` for specific types). No external CDN assets are currently loaded at runtime.

## SRI (Subresource Integrity)
If external CDN assets are added in the future, each `<link>` or `<script>` tag referencing an external origin MUST include an `integrity` attribute with a valid base64-encoded hash (`sha256-`, `sha384-`, or `sha512-`).

```html
<script src="https://cdn.example.com/lib.js"
  integrity="sha384-abc123..."
  crossorigin="anonymous">
```

## CSP + SRI enforcement
- The CSP `script-src 'self' 'unsafe-inline' 'unsafe-eval'` permits inline scripts (needed for Metro/expo web). For production hardening, `'unsafe-inline'` should be replaced with `'strict-dynamic'` and nonces once Metro supports it.
- Any externally-hosted script must have a matching `integrity` hash AND be allowed by CSP.
- For fonts, images, and media loaded from CDN, SRI is recommended but not required (CSP `https:` allows them).

## Verification
Before deploying a CDN integration, verify:
1. Integrity hash matches the file exactly
2. `crossorigin="anonymous"` is set
3. CSP allows the external origin
4. Fallback behavior is defined if SRI check fails
