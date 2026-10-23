/**
 * The script that runs inside the comic frame — an iframe on the web and in the
 * desktop shell, a WebView on Android. It draws the strip it is handed, cuts it
 * into pages by what it measures, and says when the reader taps or picks an
 * option; it decides nothing about the story.
 *
 * It is one string, in plain ES5, for the reasons the editor's frame script is:
 * Hermes keeps no source for a function, so `fn.toString()` cannot ship it, and
 * nothing here may contain a backtick or a dollar-brace, either of which ends
 * or splices the template it lives in.
 *
 * Drawing:
 *  - Panels are kept by id. A strip that comes again with the same panel keeps
 *    its node, so its pictures are not decoded again and it does not animate
 *    again; a panel no longer in the strip (a rollback) goes.
 *  - A panel is as tall as its picture's aspect, or taller when its words need
 *    the room: the words are in the flow, the picture behind them fills
 *    whatever height that gives. Large text makes taller panels rather than
 *    words cut off — the spike's fixed layouts lost 16 of 19 bubbles at ×2.
 *  - Pages are cut once panels are laid out, from their measured heights: a
 *    page ends after six panels or before one that would take it past about a
 *    screen and a third.
 *  - Pictures load only near the viewport and are let go far from it
 *    (`keepScreens` screens either way), so a long strip does not hold every
 *    image decoded. The observer's root is the document: inside a frame the
 *    implicit root never reaches past the frame's edge (the spike's finding).
 *
 * Text always goes in through textContent. The frame runs with allow-same-origin
 * on the web, so markup in a story's words would otherwise run as the host.
 */
export const COMIC_FRAME_SCRIPT = String.raw`
(function () {
  'use strict';
  var boot = window.__VNE_COMIC_BOOT || {};
  var FRAME = 'vne-comic-frame';
  var HOST = 'vne-comic-host';
  var PAGE_PANELS = 6;
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
  var choicesBox = document.getElementById('choices');
  var root = document.documentElement;
  var panels = {};
  var shownIds = [];
  var drawnOnce = false;
  var observer = null;

  function setTextScale(scale) {
    var value = typeof scale === 'number' && isFinite(scale) && scale > 0 ? scale : 1;
    root.style.setProperty('--text-scale', String(value));
  }
  setTextScale(boot.textScale);

  function element(tag, className) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  }

  function fraction(value, fallback) {
    return typeof value === 'number' && isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
  }

  /* A fraction as a percentage, to a hundredth: no 26.999999999999996%. */
  function percent(value) {
    return Math.round(value * 10000) / 100;
  }

  function picture(url, className) {
    var img = element('img', className);
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    img.addEventListener('error', function () { img.classList.add('missing'); });
    if (typeof url === 'string' && url) img.setAttribute('data-src', url);
    else img.classList.add('missing');
    return img;
  }

  function buildWords(words) {
    var box = element('div', 'words');
    for (var i = 0; i < words.length; i += 1) {
      var item = words[i];
      if (!item || typeof item.text !== 'string') continue;
      if (item.kind === 'bubble') {
        var bubble = element('div', 'bubble');
        var leanRight = typeof item.speakerX === 'number' && item.speakerX > 0.55;
        bubble.classList.add(leanRight ? 'lean-right' : 'lean-left');
        if (typeof item.speaker === 'string' && item.speaker) {
          var speaker = element('span', 'speaker');
          speaker.textContent = item.speaker;
          bubble.appendChild(speaker);
        }
        var line = element('span', 'line');
        line.textContent = item.text;
        bubble.appendChild(line);
        box.appendChild(bubble);
      } else {
        var caption = element('p', 'caption');
        caption.textContent = item.text;
        box.appendChild(caption);
      }
    }
    return box;
  }

  function buildPanel(panel) {
    var node = element('section', 'panel');
    node.setAttribute('data-id', String(panel.id));
    var art = element('div', 'art');
    var stage = element('div', 'stage');
    /*
     * The shot: the stage scaled by zoom and moved so its focus lands on the
     * panel's place, but never so far that the stage stops covering the
     * panel. The stage is the panel's size, so its own percentages are the
     * panel's.
     */
    var zoom = typeof panel.zoom === 'number' && isFinite(panel.zoom) && panel.zoom >= 1 ? Math.min(panel.zoom, 4) : 1;
    var focus = panel.focus || {};
    var place = panel.place || {};
    var shiftX = Math.max(1 - zoom, Math.min(0, fraction(place.x, 0.5) - fraction(focus.x, 0.5) * zoom));
    var shiftY = Math.max(1 - zoom, Math.min(0, fraction(place.y, 0.5) - fraction(focus.y, 0.5) * zoom));
    stage.style.transformOrigin = '0 0';
    stage.style.transform = 'translate(' + percent(shiftX) + '%, ' + percent(shiftY) + '%) scale(' + zoom + ')';
    stage.appendChild(picture(panel.background, 'bg'));
    var sprites = Array.isArray(panel.sprites) ? panel.sprites : [];
    for (var i = 0; i < sprites.length; i += 1) {
      var sprite = picture(sprites[i].url, 'sprite');
      sprite.style.left = (fraction(sprites[i].x, 0.5) * 100) + '%';
      stage.appendChild(sprite);
    }
    art.appendChild(stage);
    node.appendChild(art);
    node.appendChild(buildWords(Array.isArray(panel.words) ? panel.words : []));
    return node;
  }

  /* Pictures near the viewport are loaded; far ones are let go. */
  function load(node, near) {
    var imgs = node.getElementsByTagName('img');
    for (var i = 0; i < imgs.length; i += 1) {
      var src = imgs[i].getAttribute('data-src');
      if (!src) continue;
      if (near && imgs[i].getAttribute('src') !== src) imgs[i].setAttribute('src', src);
      if (!near && imgs[i].hasAttribute('src')) imgs[i].removeAttribute('src');
    }
  }

  function watch(node) {
    if (observer) observer.observe(node);
    else load(node, true);
  }

  if (typeof IntersectionObserver === 'function') {
    var keep = Math.max(0.5, Number(boot.keepScreens) || 2) * 100;
    observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i += 1) load(entries[i].target, entries[i].isIntersecting);
    }, { root: document, rootMargin: keep + '% 0px ' + keep + '% 0px' });
  }

  function cutPages() {
    var limit = Math.max(window.innerHeight * 1.35, 520);
    var pages = 0;
    var count = 0;
    var height = 0;
    for (var i = 0; i < shownIds.length; i += 1) {
      var node = panels[shownIds[i]].node;
      var h = node.offsetHeight;
      var starts = i === 0 || count >= PAGE_PANELS || (count > 0 && height + h > limit);
      if (starts) {
        pages += 1;
        count = 0;
        height = 0;
      }
      node.classList.toggle('page-start', starts);
      if (starts) node.setAttribute('data-page', String(pages));
      else node.removeAttribute('data-page');
      count += 1;
      height += h;
    }
    post({ type: 'layout', panels: shownIds.length, pages: pages });
  }

  function drawChoices(choices, ready) {
    while (choicesBox.firstChild) choicesBox.removeChild(choicesBox.firstChild);
    if (!ready || !choices || !Array.isArray(choices.options)) return;
    var chosen = typeof choices.chosenId === 'string' ? choices.chosenId : null;
    for (var i = 0; i < choices.options.length; i += 1) {
      var option = choices.options[i];
      if (!option || typeof option.id !== 'string') continue;
      var button = element('button', 'choice');
      button.type = 'button';
      button.textContent = String(option.text || '');
      button.setAttribute('data-option', option.id);
      if (chosen) {
        button.disabled = true;
        button.classList.add(option.id === chosen ? 'taken' : 'not-taken');
      }
      choicesBox.appendChild(button);
    }
  }

  function draw(next) {
    var list = next && Array.isArray(next.panels) ? next.panels : [];
    var revealed = Math.max(0, Math.min(list.length, Math.floor(Number(next && next.revealed) || 0)));
    var keepIds = {};
    var nextIds = [];
    var added = [];
    for (var i = 0; i < revealed; i += 1) {
      var panel = list[i];
      if (!panel || typeof panel.id !== 'string' || keepIds[panel.id]) continue;
      var signature = JSON.stringify(panel);
      var known = panels[panel.id];
      if (!known || known.signature !== signature) {
        var node = buildPanel(panel);
        if (known) {
          if (observer) observer.unobserve(known.node);
          strip.replaceChild(node, known.node);
        } else {
          added.push(node);
        }
        panels[panel.id] = { node: node, signature: signature };
        watch(node);
      }
      keepIds[panel.id] = true;
      nextIds.push(panel.id);
    }
    for (var id in panels) {
      if (!Object.prototype.hasOwnProperty.call(panels, id) || keepIds[id]) continue;
      if (observer) observer.unobserve(panels[id].node);
      if (panels[id].node.parentNode) panels[id].node.parentNode.removeChild(panels[id].node);
      delete panels[id];
    }
    for (var j = 0; j < nextIds.length; j += 1) strip.appendChild(panels[nextIds[j]].node);
    shownIds = nextIds;
    if (drawnOnce) {
      for (var k = 0; k < added.length; k += 1) added[k].classList.add('enter');
    }
    drawChoices(next && next.choices, revealed === list.length);
    cutPages();
    var last = added.length ? added[added.length - 1] : null;
    if (drawnOnce && last && last.scrollIntoView) last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    else if (!drawnOnce && shownIds.length && window.scrollTo) window.scrollTo(0, document.body.scrollHeight);
    drawnOnce = true;
  }

  function receive(message) {
    if (!message || message.source !== HOST || message.token !== boot.token) return;
    if (message.type === 'strip') draw(message.strip);
    else if (message.type === 'textScale') {
      setTextScale(message.scale);
      cutPages();
    }
  }

  /* A tap anywhere but on an option asks for the next panel; so do Space and Enter. */
  document.addEventListener('click', function (event) {
    var target = event.target;
    var option = target && target.closest ? target.closest('[data-option]') : null;
    if (option) {
      if (!option.disabled) post({ type: 'choose', optionId: option.getAttribute('data-option') });
      return;
    }
    post({ type: 'tap' });
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    var target = event.target;
    if (target && target.closest && target.closest('[data-option]')) return;
    event.preventDefault();
    post({ type: 'tap' });
  });

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

  window.addEventListener('resize', cutPages);
  window.addEventListener('error', function (event) {
    post({ type: 'error', message: String(event.message || 'error') });
  });

  post({ type: 'ready' });
}());
`;
