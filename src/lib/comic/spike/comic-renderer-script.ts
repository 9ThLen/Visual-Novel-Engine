/**
 * The script that runs inside the comic frame — an iframe on the web and in the
 * desktop shell, a WebView on Android. It draws pages it is handed and reports
 * how long that took; it decides nothing about what a page holds.
 *
 * It is one string, in plain ES5, for the reasons the editor's frame script is:
 * Hermes keeps no source for a function, so `fn.toString()` cannot ship it, and
 * nothing here may contain a backtick or a dollar-brace, either of which ends
 * or splices the template it lives in.
 *
 * What it measures, for stage 1 of the comic plan:
 *  - first page: from the script starting to the page's images decoded, the
 *    bubble font ready and two frames painted after that;
 *  - a long strip: frame intervals while the strip scrolls at a fixed speed,
 *    how often a visible panel was still blank, and how many pages and images
 *    were alive at once;
 *  - the font: whether the embedded family loaded, for Latin and for Cyrillic;
 *  - the network: every resource the frame fetched that was not data: or blob:.
 *
 * Text placed on a page always goes through textContent. The frame runs with
 * allow-same-origin on the web, so markup in a story's text would run as the
 * host.
 */
export const COMIC_RENDERER_SCRIPT = String.raw`
(function () {
  'use strict';
  var boot = window.__VNE_COMIC_BOOT || {};
  var marks = { scriptStart: performance.now() };
  var FRAME = 'vne-comic-frame';
  var HOST = 'vne-comic-host';
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var isNative = !!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage);

  /*
   * The exact origin to address. Never read from location: a srcdoc document's
   * URL is about:srcdoc, whose origin serializes to "null", and posting to
   * "null" throws. The host names itself; an opaque host (a page opened from
   * file://) leaves nothing to name, and the receiver is the embedder anyway.
   */
  var hostOrigin = (function () {
    var value = boot.hostOrigin;
    return typeof value === 'string' && value !== '' && value !== 'null' ? value : '*';
  }());

  function post(message) {
    message.source = FRAME;
    message.token = boot.token;
    if (isNative) {
      window.ReactNativeWebView.postMessage(JSON.stringify(message));
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage(message, hostOrigin);
    }
  }

  function safeParse(value) {
    try { return JSON.parse(value); } catch (error) { return null; }
  }

  var strip = document.getElementById('strip');
  var root = document.documentElement;
  var pages = [];
  var images = {};
  var counters = { builds: 0, releases: 0, failedImages: [], missingImages: [] };
  var nearObserver = null;
  var visibleObserver = null;
  var visiblePages = [];

  function setTextScale(scale) {
    var value = typeof scale === 'number' && isFinite(scale) && scale > 0 ? scale : 1;
    root.style.setProperty('--text-scale', String(value));
    return value;
  }
  var textScale = setTextScale(boot.textScale);

  function element(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function percent(value) {
    return (value * 100).toFixed(3) + '%';
  }

  function placeRect(node, rect) {
    node.style.left = percent(rect.x);
    node.style.top = percent(rect.y);
    node.style.width = percent(rect.w);
    node.style.height = percent(rect.h);
  }

  function picture(key, className) {
    var img = element('img', className);
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    var url = images[key];
    if (typeof url !== 'string' || url === '') {
      counters.missingImages.push(key);
      img.className += ' missing';
      return img;
    }
    img.onerror = function () { counters.failedImages.push(key); };
    img.src = url;
    return img;
  }

  function buildBubble(bubble) {
    var node = element('div', 'bubble ' + bubble.kind);
    node.style.left = percent(bubble.x);
    node.style.top = percent(bubble.y);
    node.setAttribute('data-top', percent(bubble.y));
    node.style.maxWidth = percent(bubble.maxWidth);
    if (bubble.speaker && bubble.kind !== 'caption') {
      var speaker = element('span', 'speaker');
      speaker.textContent = bubble.speaker;
      node.appendChild(speaker);
    }
    var text = element('span', 'text');
    text.textContent = bubble.text;
    node.appendChild(text);
    if (bubble.tail) {
      node.setAttribute('data-tail-x', String(bubble.tail.x));
      node.setAttribute('data-tail-y', String(bubble.tail.y));
    }
    return node;
  }

  function buildPanel(panel) {
    var node = element('div', 'panel');
    placeRect(node, panel.rect);
    var bg = panel.background;
    node.setAttribute('data-focus-x', String(bg.focusX));
    node.setAttribute('data-focus-y', String(bg.focusY));
    node.setAttribute('data-zoom', String(bg.zoom));
    var art = element('div', 'art');
    art.style.transformOrigin = percent(bg.focusX) + ' ' + percent(bg.focusY);
    art.style.transform = 'scale(' + bg.zoom + ')';
    var backdrop = picture(bg.image, 'bg');
    backdrop.style.objectPosition = percent(bg.focusX) + ' ' + percent(bg.focusY);
    art.appendChild(backdrop);
    for (var i = 0; i < panel.sprites.length; i += 1) {
      var sprite = panel.sprites[i];
      var img = picture(sprite.image, 'sprite' + (sprite.flip ? ' flip' : ''));
      img.style.left = percent(sprite.x);
      img.style.bottom = percent(sprite.bottom);
      img.style.height = percent(sprite.height);
      art.appendChild(img);
    }
    node.appendChild(art);
    var tails = document.createElementNS(SVG_NS, 'svg');
    tails.setAttribute('class', 'tails');
    node.appendChild(tails);
    var layer = element('div', 'bubbles');
    for (var j = 0; j < panel.bubbles.length; j += 1) layer.appendChild(buildBubble(panel.bubbles[j]));
    node.appendChild(layer);
    return node;
  }

  function buildPage(entry) {
    if (entry.built) return;
    entry.built = true;
    counters.builds += 1;
    var plan = entry.plan;
    for (var i = 0; i < plan.panels.length; i += 1) entry.el.appendChild(buildPanel(plan.panels[i]));
    layoutPage(entry);
  }

  function releasePage(entry) {
    if (!entry.built) return;
    entry.built = false;
    counters.releases += 1;
    while (entry.el.firstChild) entry.el.removeChild(entry.el.firstChild);
  }

  function overlaps(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }

  function relativeRect(node, box) {
    var rect = node.getBoundingClientRect();
    return { left: rect.left - box.left, top: rect.top - box.top, right: rect.right - box.left, bottom: rect.bottom - box.top };
  }

  /*
   * Bubbles are laid out first, because only then is a bubble's size known: it
   * depends on the words, the font and the reader's text scale. A bubble that
   * lands on an earlier one moves down below it — reading order is never
   * changed, only the gap. Then come the tails; a tail's target moves with the
   * camera, which scales the art about its focus point.
   */
  function layoutPanel(panelNode) {
    var tails = panelNode.querySelector('.tails');
    var layer = panelNode.querySelector('.bubbles');
    if (!tails || !layer) return 0;
    while (tails.firstChild) tails.removeChild(tails.firstChild);
    var box = layer.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return 0;
    var focusX = Number(panelNode.getAttribute('data-focus-x'));
    var focusY = Number(panelNode.getAttribute('data-focus-y'));
    var zoom = Number(panelNode.getAttribute('data-zoom')) || 1;
    var overflow = 0;
    var bubbles = layer.querySelectorAll('.bubble');
    var placed = [];
    for (var b = 0; b < bubbles.length; b += 1) {
      bubbles[b].style.top = bubbles[b].getAttribute('data-top');
      var own = relativeRect(bubbles[b], box);
      for (var p = 0; p < placed.length; p += 1) {
        if (!overlaps(own, placed[p])) continue;
        var shift = placed[p].bottom + 6 - own.top;
        bubbles[b].style.top = (own.top + shift) + 'px';
        own = { left: own.left, top: own.top + shift, right: own.right, bottom: own.bottom + shift };
      }
      placed.push(own);
    }
    for (var i = 0; i < bubbles.length; i += 1) {
      var bubble = bubbles[i];
      var left = placed[i].left;
      var top = placed[i].top;
      var right = placed[i].right;
      var bottom = placed[i].bottom;
      var outside = left < -1 || top < -1 || right > box.width + 1 || bottom > box.height + 1;
      bubble.classList.toggle('overflow', outside);
      if (outside) overflow += 1;
      var tailX = bubble.getAttribute('data-tail-x');
      if (tailX === null) continue;
      var targetX = (focusX + (Number(tailX) - focusX) * zoom) * box.width;
      var targetY = (focusY + (Number(bubble.getAttribute('data-tail-y')) - focusY) * zoom) * box.height;
      var below = targetY > bottom;
      var baseY = below ? bottom - 2 : top + 2;
      var baseX = Math.max(left + 14, Math.min(right - 14, targetX));
      var reach = Math.min(Math.abs(targetY - baseY), 42 * textScale);
      var tipY = below ? baseY + reach : baseY - reach;
      var tipX = baseX + (targetX - baseX) * 0.35;
      if (bubble.classList.contains('thought')) {
        for (var k = 1; k <= 3; k += 1) {
          var dot = document.createElementNS(SVG_NS, 'circle');
          dot.setAttribute('cx', String(baseX + (tipX - baseX) * k / 3));
          dot.setAttribute('cy', String(baseY + (tipY - baseY) * k / 3));
          dot.setAttribute('r', String(5 - k));
          tails.appendChild(dot);
        }
      } else {
        var half = 7 * Math.min(textScale, 1.6);
        var tail = document.createElementNS(SVG_NS, 'polygon');
        tail.setAttribute('points', (baseX - half) + ',' + baseY + ' ' + (baseX + half) + ',' + baseY + ' ' + tipX + ',' + tipY);
        tails.appendChild(tail);
      }
    }
    return overflow;
  }

  function layoutPage(entry) {
    var overflow = 0;
    var panels = entry.el.querySelectorAll('.panel');
    for (var i = 0; i < panels.length; i += 1) overflow += layoutPanel(panels[i]);
    entry.overflow = overflow;
    return overflow;
  }

  function relayoutBuilt() {
    for (var i = 0; i < pages.length; i += 1) if (pages[i].built) layoutPage(pages[i]);
  }

  function overflowCount() {
    var total = 0;
    for (var i = 0; i < pages.length; i += 1) if (pages[i].built) total += pages[i].overflow || 0;
    return total;
  }

  function pageImages(entry) {
    return Array.prototype.slice.call(entry.el.querySelectorAll('img[src]'));
  }

  function decoded(img) {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve();
    if (typeof img.decode === 'function') return img.decode().catch(function () {});
    return new Promise(function (resolve) {
      img.addEventListener('load', resolve, { once: true });
      img.addEventListener('error', resolve, { once: true });
    });
  }

  /*
   * Whether the family itself draws these characters. document.fonts.check()
   * cannot say: it answers true for characters the family does not have at
   * all, since nothing is left to load. A text measured through the family
   * with two different fallbacks behind it comes out the same width only if
   * no character fell through to the fallback.
   */
  var measureContext = null;
  function covers(family, text) {
    if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
    if (!measureContext) return false;
    measureContext.font = '40px "' + family + '", monospace';
    var withMono = measureContext.measureText(text).width;
    measureContext.font = '40px "' + family + '", serif';
    var withSerif = measureContext.measureText(text).width;
    measureContext.font = '40px monospace';
    var monoOnly = measureContext.measureText(text).width;
    return withMono === withSerif && withMono !== monoOnly;
  }

  function fontState() {
    var family = boot.fontFamily;
    if (!family || !document.fonts) return { family: family || null, loaded: false, latin: false, cyrillic: false };
    var loaded = document.fonts.check('16px "' + family + '"', 'A');
    return {
      family: family,
      loaded: loaded,
      latin: loaded && covers(family, 'The library'),
      cyrillic: loaded && covers(family, 'Бібліотека'),
    };
  }

  function fontReady() {
    var family = boot.fontFamily;
    if (!family || !document.fonts || !document.fonts.load) return Promise.resolve();
    return document.fonts.load('16px "' + family + '"', 'A').then(function () {}, function () {});
  }

  /** Every fetch that left the document: anything but data: and blob:. */
  function networkRequests() {
    if (!performance.getEntriesByType) return [];
    return performance.getEntriesByType('resource')
      .map(function (entry) { return entry.name; })
      .filter(function (name) { return !/^(data|blob):/.test(name); });
  }

  function jsHeapMb() {
    var memory = performance.memory;
    return memory && memory.usedJSHeapSize ? Math.round(memory.usedJSHeapSize / 1048576 * 10) / 10 : null;
  }

  /** What the live images would take decoded, each distinct picture once. */
  function decodedImageMb() {
    var seen = {};
    var bytes = 0;
    var all = document.images;
    for (var i = 0; i < all.length; i += 1) {
      var img = all[i];
      if (!img.src || seen[img.src] || !img.naturalWidth) continue;
      seen[img.src] = true;
      bytes += img.naturalWidth * img.naturalHeight * 4;
    }
    return Math.round(bytes / 1048576);
  }

  function livePages() {
    var count = 0;
    for (var i = 0; i < pages.length; i += 1) if (pages[i].built) count += 1;
    return count;
  }

  function stats() {
    return {
      pages: pages.length,
      livePages: livePages(),
      liveImages: document.images.length,
      domNodes: document.getElementsByTagName('*').length,
      builds: counters.builds,
      releases: counters.releases,
      overflowBubbles: overflowCount(),
      liveBubbles: document.querySelectorAll('.bubble').length,
      failedImages: counters.failedImages.slice(0, 20),
      missingImages: counters.missingImages.slice(0, 20),
      jsHeapMb: jsHeapMb(),
      decodedImageMb: decodedImageMb(),
      font: fontState(),
      networkRequests: networkRequests().slice(0, 50),
      textScale: textScale,
      rootFontPx: parseFloat(getComputedStyle(root).fontSize) || null,
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio || 1 },
    };
  }

  function observe() {
    if (nearObserver) nearObserver.disconnect();
    if (visibleObserver) visibleObserver.disconnect();
    var keep = Math.max(0.5, Number(boot.keepScreens) || 2) * 100;
    /*
     * root: document, not the implicit root. Inside a frame the implicit root
     * is the top-level viewport clipped to the frame, so a rootMargin never
     * reaches past the frame's edge and pages were built only once already on
     * screen — a blank panel on nearly every frame of a scroll.
     */
    nearObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i += 1) {
        var entry = pages[Number(entries[i].target.getAttribute('data-index'))];
        if (!entry) continue;
        if (entries[i].isIntersecting) buildPage(entry);
        else if (boot.virtualize) releasePage(entry);
      }
    }, { root: document, rootMargin: keep + '% 0px ' + keep + '% 0px' });
    visibleObserver = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i += 1) {
        var entry = pages[Number(entries[i].target.getAttribute('data-index'))];
        if (!entry) continue;
        var at = visiblePages.indexOf(entry);
        if (entries[i].isIntersecting && at < 0) visiblePages.push(entry);
        if (!entries[i].isIntersecting && at >= 0) visiblePages.splice(at, 1);
      }
    }, { root: document });
    for (var j = 0; j < pages.length; j += 1) {
      nearObserver.observe(pages[j].el);
      visibleObserver.observe(pages[j].el);
    }
  }

  function renderStrip(next) {
    marks.stripReceived = performance.now();
    images = next && next.images ? next.images : {};
    var plans = next && Array.isArray(next.pages) ? next.pages : [];
    while (strip.firstChild) strip.removeChild(strip.firstChild);
    pages = [];
    visiblePages = [];
    counters = { builds: 0, releases: 0, failedImages: [], missingImages: [] };
    for (var i = 0; i < plans.length; i += 1) {
      var el = element('section', 'page');
      el.setAttribute('data-index', String(i));
      el.setAttribute('aria-label', 'Page ' + (i + 1));
      el.style.setProperty('--aspect', String(plans[i].aspect || 1.45));
      strip.appendChild(el);
      pages.push({ plan: plans[i], el: el, built: false, overflow: 0 });
    }
    if (pages.length === 0) {
      post({ type: 'error', message: 'empty strip' });
      return;
    }
    buildPage(pages[0]);
    marks.firstPageBuilt = performance.now();
    var first = pages[0];
    var waitImages = Promise.all(pageImages(first).map(decoded)).then(function () {
      marks.firstPageImages = performance.now();
    });
    var waitFont = fontReady().then(function () {
      marks.fontReady = performance.now();
    });
    Promise.all([waitImages, waitFont]).then(function () {
      layoutPage(first);
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          marks.firstPagePainted = performance.now();
          post({
            type: 'firstPage',
            marks: marks,
            paintedAtEpochMs: Date.now(),
            imagesOnFirstPage: pageImages(first).length,
            stats: stats(),
          });
          observe();
        });
      });
    });
  }

  function percentile(sorted, p) {
    if (sorted.length === 0) return 0;
    var index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return Math.round(sorted[index] * 10) / 10;
  }

  function visibleBlank() {
    for (var i = 0; i < visiblePages.length; i += 1) {
      var entry = visiblePages[i];
      if (!entry.built) return true;
      var imgs = entry.el.getElementsByTagName('img');
      for (var j = 0; j < imgs.length; j += 1) {
        if (imgs[j].src && !(imgs[j].complete && imgs[j].naturalWidth > 0)) return true;
      }
    }
    return false;
  }

  /*
   * Scrolls the whole strip top to bottom at a fixed speed, one step per
   * animation frame, and records how long each frame took. This is a stress
   * figure for the main thread, not a fling: a compositor-driven fling can be
   * smoother than this, never rougher.
   */
  function runScrollTest(options) {
    var speed = options && options.pxPerSecond > 0 ? options.pxPerSecond : 2000;
    var scroller = document.scrollingElement || document.documentElement;
    scroller.scrollTop = 0;
    var deltas = [];
    var blank = 0;
    var heapStart = jsHeapMb();
    var heapPeak = heapStart || 0;
    var maxLivePages = 0;
    var maxLiveImages = 0;
    var start = 0;
    var last = 0;
    var buildsBefore = counters.builds;
    var releasesBefore = counters.releases;
    var limit = Math.max(0, scroller.scrollHeight - window.innerHeight);

    function finish(now) {
      var sorted = deltas.slice().sort(function (a, b) { return a - b; });
      var dropped = 0;
      var over25 = 0;
      var over50 = 0;
      for (var i = 0; i < deltas.length; i += 1) {
        if (deltas[i] > 25) over25 += 1;
        if (deltas[i] > 50) over50 += 1;
        dropped += Math.max(0, Math.round(deltas[i] / 16.667) - 1);
      }
      post({
        type: 'scrollResult',
        result: {
          pxPerSecond: speed,
          scrollHeight: scroller.scrollHeight,
          durationMs: Math.round(now - start),
          frames: deltas.length,
          frameMs: {
            p50: percentile(sorted, 0.5),
            p95: percentile(sorted, 0.95),
            p99: percentile(sorted, 0.99),
            max: percentile(sorted, 1),
          },
          over25ms: over25,
          over50ms: over50,
          droppedFrames: dropped,
          blankFrames: blank,
          maxLivePages: maxLivePages,
          maxLiveImages: maxLiveImages,
          builds: counters.builds - buildsBefore,
          releases: counters.releases - releasesBefore,
          jsHeapMb: { start: heapStart, peak: heapPeak || null, end: jsHeapMb() },
        },
        stats: stats(),
      });
    }

    function step(now) {
      deltas.push(now - last);
      last = now;
      if (visibleBlank()) blank += 1;
      if (deltas.length % 10 === 0) {
        var heap = jsHeapMb();
        if (heap && heap > heapPeak) heapPeak = heap;
        maxLivePages = Math.max(maxLivePages, livePages());
        maxLiveImages = Math.max(maxLiveImages, document.images.length);
      }
      var y = (now - start) / 1000 * speed;
      scroller.scrollTop = y;
      if (y < limit) requestAnimationFrame(step);
      else finish(now);
    }

    requestAnimationFrame(function (now) {
      start = now;
      last = now;
      requestAnimationFrame(step);
    });
  }

  function receive(message) {
    if (!message || message.source !== HOST || message.token !== boot.token) return;
    if (message.type === 'strip') renderStrip(message.strip);
    else if (message.type === 'scrollTest') runScrollTest(message);
    else if (message.type === 'textScale') {
      textScale = setTextScale(message.scale);
      relayoutBuilt();
      post({ type: 'stats', stats: stats() });
    } else if (message.type === 'stats') post({ type: 'stats', stats: stats() });
  }

  window.addEventListener('message', function (event) {
    if (isNative) return;
    if (event.source !== window.parent) return;
    if (hostOrigin !== '*' && event.origin !== hostOrigin) return;
    receive(typeof event.data === 'string' ? safeParse(event.data) : event.data);
  });

  /* The Android host speaks through injectJavaScript, which calls this. */
  window.__vneComicReceive = function (json) {
    if (!isNative) return;
    receive(typeof json === 'string' ? safeParse(json) : null);
  };

  if (document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', relayoutBuilt);
  }
  window.addEventListener('resize', relayoutBuilt);
  window.addEventListener('error', function (event) {
    post({ type: 'error', message: String(event.message || 'error') });
  });

  marks.ready = performance.now();
  post({ type: 'ready', marks: marks });
}());
`;
