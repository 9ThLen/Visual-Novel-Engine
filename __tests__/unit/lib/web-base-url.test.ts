import { resolveWebUrl } from '@/lib/web-base-url';

describe('resolveWebUrl', () => {
  afterEach(() => {
    document.querySelector('script[data-web-base-test]')?.remove();
  });

  it('resolves public files against the Expo deployment base path', () => {
    const script = document.createElement('script');
    script.dataset.webBaseTest = 'true';
    script.src = 'https://example.test/Visual-Novel-Engine/_expo/static/js/web/entry.js';
    document.head.appendChild(script);

    expect(resolveWebUrl('/vendor/weather-effects/rain/drop-alpha.png')).toBe(
      'https://example.test/Visual-Novel-Engine/vendor/weather-effects/rain/drop-alpha.png',
    );
  });
});
