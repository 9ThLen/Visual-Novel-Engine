import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

const frameGuard = `
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location = window.self.location; } catch {}
  }
`;

/**
 * This file is web-only and used to configure the root HTML for every page in the app.
 * Expo Router will automatically use this file as the root HTML shell.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />

        {/* 
          Disable body scrolling on web. This makes ScrollView components work closer to how they do on native. 
          However, body scrolling is often nice to have for mobile web. If you want to enable it, remove this line.
        */}
        <ScrollViewStyleReset />

        <meta
          httpEquiv="Content-Security-Policy"
          content="default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https:; media-src 'self' blob: data: https:; font-src 'self' data:; connect-src 'self' https:; frame-src 'self' https:;"
        />
        {/* GitHub Pages cannot emit frame-ancestors as an HTTP header, and
            browsers ignore that directive in a meta policy. Hide the app
            before paint when a third-party page embeds it. */}
        <script dangerouslySetInnerHTML={{ __html: frameGuard }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
