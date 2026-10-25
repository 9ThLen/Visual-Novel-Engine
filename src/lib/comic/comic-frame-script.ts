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
 *  - Two half panels one after the other share a row; a half panel alone,
 *    and any on a narrow screen, takes the whole width. Rows are paired over
 *    the whole strip, open or not, so a panel opens at the width it keeps.
 *  - Pages are cut once panels are laid out, from their measured heights: a
 *    page ends after six panels or before one that would take it past about a
 *    screen and a third. A row is cut as one: both its panels on one page.
 *  - In the editor's Preview the strip carries the author's marks: a ✂
 *    before every sentence a panel does not begin with, and a × over every
 *    panel but the first. A press says which sentence; the host decides.
 *  - Words are drawn as the author picked — speech, a shout, a whisper, a
 *    thought or a caption box — or as their kind's own. A shout's spikes and
 *    a thought's cloud are SVG drawn to the bubble's measured size, so they
 *    are not stretched; one not laid out yet keeps a plain outline.
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
  /* Narrower than this, a half panel is too small for its words: every panel takes the whole width. */
  var NARROW = 480;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var BUBBLE_STYLES = { speech: true, shout: true, whisper: true, thought: true };
  var isNative = !!(window.ReactNativeWebView && window.ReactNativeWebView.postMessage);

  /*
   * The exact origin to address. Never read from location: a srcdoc document's
   * URL is about:srcdoc, whose origin serializes to "null", and posting to
   * "null" throws. The host names itself. Only an http(s) origin can be named:
   * an opaque host (a page opened from file://, "null" or "file://"; a custom
   * scheme) would have every message dropped, and the receiver is the
   * embedder anyway.
   */
  var hostOrigin = (function () {
    var value = boot.hostOrigin;
    return typeof value === 'string' && /^https?:\/\//i.test(value) ? value : '*';
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
  /* Every panel of the strip, open or not, as { id, size }: what rows are paired over. */
  var sized = [];
  var more = false;
  /* A shown panel's place in a row of two: 'first' or 'second'. */
  var rowOf = Object.create(null);
  /* The author's marks of the strip drawn now ({ breakLabel, mergeLabel }), or null: the reader's strip. */
  var marks = null;
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

  /* How words are drawn: as the author picked, or as their kind's own. */
  function styleOf(item) {
    if (item.style === 'caption' || BUBBLE_STYLES[item.style] === true) return item.style;
    return item.kind === 'bubble' ? 'speech' : 'caption';
  }

  function speakerLabel(item) {
    if (typeof item.speaker !== 'string' || !item.speaker) return null;
    var speaker = element('span', 'speaker');
    speaker.textContent = item.speaker;
    return speaker;
  }

  /* A ✂ or a × of the author's, for the sentence at anchor. */
  function markButton(kind, anchor) {
    var button = element('button', 'mark mark-' + kind);
    var label = String((kind === 'break' ? marks.breakLabel : marks.mergeLabel) || '');
    button.type = 'button';
    button.setAttribute('data-mark', kind);
    button.setAttribute('data-anchor', anchor);
    button.setAttribute('aria-label', label);
    button.title = label;
    button.textContent = kind === 'break' ? '\u2702' : '\u00d7';
    return button;
  }

  /* The sentences of the words, with the author's marks, when the strip has them. */
  function markedSentences(item) {
    return marks && Array.isArray(item.sentences) && item.sentences.length ? item.sentences : null;
  }

  /*
   * The words' line. With the author's marks it is set sentence by sentence,
   * a ✂ before each but the panel's first (place.first, which this turns
   * off): a panel cannot begin again where it begins.
   */
  function lineOf(item, place) {
    var line = element('span', 'line');
    var sentences = markedSentences(item);
    if (!sentences) {
      line.textContent = item.text;
      place.first = false;
      return line;
    }
    for (var i = 0; i < sentences.length; i += 1) {
      var sentence = sentences[i];
      if (!sentence || typeof sentence.text !== 'string') continue;
      if (i > 0) line.appendChild(document.createTextNode(' '));
      if (!place.first && typeof sentence.anchor === 'string') line.appendChild(markButton('break', sentence.anchor));
      place.first = false;
      line.appendChild(document.createTextNode(sentence.text));
    }
    return line;
  }

  /* A caption box; a line drawn as one keeps the name of who says it. */
  function buildCaption(item, place) {
    var caption = element('p', 'caption');
    var speaker = item.kind === 'bubble' ? speakerLabel(item) : null;
    if (!speaker && !markedSentences(item)) {
      caption.textContent = item.text;
      place.first = false;
      return caption;
    }
    if (speaker) caption.appendChild(speaker);
    caption.appendChild(lineOf(item, place));
    return caption;
  }

  function svgNode(tag, attributes) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var name in attributes) {
      if (Object.prototype.hasOwnProperty.call(attributes, name)) node.setAttribute(name, attributes[name]);
    }
    return node;
  }

  /* The outline a shout or a thought is drawn with once its size is known; a thought's has its puffs. */
  function outline(puffs) {
    var svg = svgNode('svg', { 'class': 'outline', 'aria-hidden': 'true', focusable: 'false' });
    svg.appendChild(svgNode('path', {}));
    if (puffs) {
      svg.appendChild(svgNode('circle', {}));
      svg.appendChild(svgNode('circle', {}));
    }
    return svg;
  }

  /* A bubble leans to the side its tail points to: the author's, or its speaker's. */
  function buildBubble(item, style, place) {
    var bubble = element('div', 'bubble');
    var leanRight = item.tail === 'left' || item.tail === 'right'
      ? item.tail === 'right'
      : typeof item.speakerX === 'number' && item.speakerX > 0.55;
    bubble.classList.add(leanRight ? 'lean-right' : 'lean-left');
    if (style !== 'speech') bubble.classList.add('style-' + style);
    if (style === 'shout' || style === 'thought') bubble.appendChild(outline(style === 'thought'));
    var speaker = speakerLabel(item);
    if (speaker) bubble.appendChild(speaker);
    bubble.appendChild(lineOf(item, place));
    return bubble;
  }

  function buildWords(words) {
    var box = element('div', 'words');
    var place = { first: true };
    for (var i = 0; i < words.length; i += 1) {
      var item = words[i];
      if (!item || typeof item.text !== 'string') continue;
      var style = styleOf(item);
      box.appendChild(style === 'caption' ? buildCaption(item, place) : buildBubble(item, style, place));
    }
    return box;
  }

  /* A length for a path, to a tenth of a pixel. */
  function px(value) {
    return String(Math.round(value * 10) / 10);
  }

  /*
   * A shout: the bubble's box with spikes all round it, about every 16 px,
   * each pointing away from its middle. The spike under the side it leans to
   * is drawn longer, as its tail; like a speech bubble's, it grows with the
   * words (unit: 1 for 15 px words).
   */
  function shoutPath(w, h, right, unit) {
    var perimeter = 2 * (w + h);
    var count = Math.max(12, Math.round(perimeter / 16));
    if (count % 2) count += 1;
    var cx = w / 2;
    var cy = h / 2;
    var tailX = right ? w - 22 : 22;
    var points = [];
    var tail = -1;
    var nearest = Infinity;
    for (var i = 0; i < count; i += 1) {
      var t = (i / count) * perimeter;
      var x = t < w ? t : t < w + h ? w : t < 2 * w + h ? w - (t - w - h) : 0;
      var y = t < w ? 0 : t < w + h ? t - w : t < 2 * w + h ? h : h - (t - 2 * w - h);
      var spike = i % 2 === 1 ? 7 : 0;
      var dx = (x - cx) / cx;
      var dy = (y - cy) / cy;
      var length = Math.sqrt(dx * dx + dy * dy) || 1;
      points.push([x + (dx / length) * spike, y + (dy / length) * spike]);
      if (spike && y === h && Math.abs(x - tailX) < nearest) {
        nearest = Math.abs(x - tailX);
        tail = i;
      }
    }
    if (tail >= 0) points[tail] = [tailX + (right ? 6 : -6) * unit, h + 16 * unit];
    var d = 'M' + px(points[0][0]) + ' ' + px(points[0][1]);
    for (var j = 1; j < points.length; j += 1) d += ' L' + px(points[j][0]) + ' ' + px(points[j][1]);
    return d + ' Z';
  }

  /* A thought: a cloud of arcs bulging out of the bubble's box, about every 22 px, meeting at its corners. */
  function cloudPath(w, h) {
    var corners = [[0, 0], [w, 0], [w, h], [0, h]];
    var d = 'M0 0';
    for (var side = 0; side < 4; side += 1) {
      var from = corners[side];
      var to = corners[(side + 1) % 4];
      var length = side % 2 ? h : w;
      var steps = Math.max(1, Math.round(length / 22));
      var radius = px((length / steps) * 0.62);
      for (var k = 1; k <= steps; k += 1) {
        var x = from[0] + ((to[0] - from[0]) * k) / steps;
        var y = from[1] + ((to[1] - from[1]) * k) / steps;
        d += ' A' + radius + ' ' + radius + ' 0 0 1 ' + px(x) + ' ' + px(y);
      }
    }
    return d + ' Z';
  }

  /* How large a bubble's words are against 15 px ones: what its tail and puffs grow by. */
  function unitOf(node) {
    var size = window.getComputedStyle ? parseFloat(window.getComputedStyle(node).fontSize) : NaN;
    return size > 0 ? size / 15 : 1;
  }

  /*
   * The outline of every shout and thought shown, drawn to the size it has
   * now. All are measured before any is drawn, so drawing one does not lay
   * the page out again for the next. One not laid out (0 px) keeps its plain
   * outline until it is.
   */
  function shapeBubbles() {
    var nodes = strip.querySelectorAll('.bubble.style-shout, .bubble.style-thought');
    var sizes = [];
    for (var i = 0; i < nodes.length; i += 1) sizes.push([nodes[i].clientWidth, nodes[i].clientHeight, unitOf(nodes[i])]);
    for (var j = 0; j < nodes.length; j += 1) {
      var node = nodes[j];
      var w = sizes[j][0];
      var h = sizes[j][1];
      var unit = sizes[j][2];
      var key = w + 'x' + h + '@' + unit;
      if (!(w > 0 && h > 0) || node.getAttribute('data-shape') === key) continue;
      var svg = node.querySelector('.outline');
      if (!svg) continue;
      var right = node.classList.contains('lean-right');
      var thought = node.classList.contains('style-thought');
      svg.firstChild.setAttribute('d', thought ? cloudPath(w, h) : shoutPath(w, h, right, unit));
      if (thought) {
        var x = right ? w - 18 * unit : 18 * unit;
        var puffs = svg.getElementsByTagName('circle');
        puffs[0].setAttribute('cx', px(x));
        puffs[0].setAttribute('cy', px(h + 11 * unit));
        puffs[0].setAttribute('r', px(4 * unit));
        puffs[1].setAttribute('cx', px(x + (right ? 8 : -8) * unit));
        puffs[1].setAttribute('cy', px(h + 20 * unit));
        puffs[1].setAttribute('r', px(2.5 * unit));
      }
      node.setAttribute('data-shape', key);
      node.classList.add('shaped');
    }
  }

  /* A panel; joins: it has a panel before it, which the author's × can join it to. */
  function buildPanel(panel, joins) {
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
    var words = buildWords(Array.isArray(panel.words) ? panel.words : []);
    if (panel.choices && Array.isArray(panel.choices.options)) words.appendChild(buildPastChoices(panel.choices));
    node.appendChild(words);
    if (marks && joins && typeof panel.anchor === 'string') node.appendChild(markButton('merge', panel.anchor));
    return node;
  }

  /* A choice an earlier scene ended on, as it was answered: nothing to press. */
  function buildPastChoices(choices) {
    var box = element('div', 'past-choices');
    box.setAttribute('role', 'group');
    for (var i = 0; i < choices.options.length; i += 1) {
      var option = choices.options[i];
      if (!option || typeof option.id !== 'string') continue;
      var button = element('button', 'choice');
      button.type = 'button';
      button.disabled = true;
      button.textContent = String(option.text || '');
      button.setAttribute('data-option', option.id);
      button.classList.add(option.id === choices.chosenId ? 'taken' : 'not-taken');
      box.appendChild(button);
    }
    return box;
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

  /*
   * Half panels in twos, from the first. The last panel of the strip has no
   * next to pair with yet; while more may come it keeps the place beside it.
   */
  function pairRows() {
    rowOf = Object.create(null);
    if (window.innerWidth < NARROW) return;
    for (var i = 0; i < sized.length; i += 1) {
      if (sized[i].size !== 'half') continue;
      var next = sized[i + 1];
      if (next ? next.size !== 'half' : !more) continue;
      rowOf[sized[i].id] = 'first';
      if (next) rowOf[next.id] = 'second';
      i += 1;
    }
  }

  function cutPages() {
    var limit = Math.max(window.innerHeight * 1.35, 520);
    var pages = 0;
    var count = 0;
    var height = 0;
    for (var i = 0; i < shownIds.length; i += 1) {
      var row = [panels[shownIds[i]].node];
      if (rowOf[shownIds[i]] === 'first' && rowOf[shownIds[i + 1]] === 'second') row.push(panels[shownIds[i + 1]].node);
      var h = 0;
      for (var r = 0; r < row.length; r += 1) h = Math.max(h, row[r].offsetHeight);
      var starts = i === 0 || count + row.length > PAGE_PANELS || (count > 0 && height + h > limit);
      if (starts) {
        pages += 1;
        count = 0;
        height = 0;
      }
      for (var c = 0; c < row.length; c += 1) {
        row[c].classList.toggle('page-start', starts && c === 0);
        row[c].classList.toggle('page-gap', starts && pages > 1);
        if (starts && c === 0) row[c].setAttribute('data-page', String(pages));
        else row[c].removeAttribute('data-page');
      }
      count += row.length;
      height += h;
      i += row.length - 1;
    }
    post({ type: 'layout', panels: shownIds.length, pages: pages });
  }

  /* Rows, outlines and pages, for the panels shown at the width the frame has now. */
  function layout() {
    pairRows();
    for (var i = 0; i < shownIds.length; i += 1) {
      var place = rowOf[shownIds[i]];
      var classes = panels[shownIds[i]].node.classList;
      classes.toggle('half', !!place);
      classes.toggle('row-first', place === 'first');
      classes.toggle('row-second', place === 'second');
    }
    shapeBubbles();
    cutPages();
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
    var seen = Object.create(null);
    sized = [];
    for (var s = 0; s < list.length; s += 1) {
      if (!list[s] || typeof list[s].id !== 'string' || seen[list[s].id]) continue;
      seen[list[s].id] = true;
      sized.push({ id: list[s].id, size: list[s].size });
    }
    more = !!(next && next.more === true);
    var nextMarks = next && next.marks && typeof next.marks === 'object' ? next.marks : null;
    marks = nextMarks;
    root.classList.toggle('marking', !!marks);
    var marking = marks ? JSON.stringify(marks) : '';
    for (var i = 0; i < revealed; i += 1) {
      var panel = list[i];
      if (!panel || typeof panel.id !== 'string' || keepIds[panel.id]) continue;
      var signature = JSON.stringify(panel) + (marking ? '|' + (i > 0) + marking : '');
      var known = panels[panel.id];
      if (!known || known.signature !== signature) {
        var node = buildPanel(panel, i > 0);
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
    layout();
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
      layout();
    }
  }

  /*
   * A tap anywhere but on an option asks for the next panel, naming the panel
   * it landed on; so do Space and Enter, naming none.
   */
  document.addEventListener('click', function (event) {
    var target = event.target;
    var mark = target && target.closest ? target.closest('[data-mark]') : null;
    if (mark) {
      post({ type: 'mark', anchor: mark.getAttribute('data-anchor'), begins: mark.getAttribute('data-mark') === 'break' });
      return;
    }
    var option = target && target.closest ? target.closest('[data-option]') : null;
    if (option) {
      if (!option.disabled) post({ type: 'choose', optionId: option.getAttribute('data-option') });
      return;
    }
    var panel = target && target.closest ? target.closest('.panel') : null;
    var message = { type: 'tap' };
    if (panel && panel.getAttribute('data-id')) message.panelId = panel.getAttribute('data-id');
    post(message);
  });
  document.addEventListener('keydown', function (event) {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    var target = event.target;
    if (target && target.closest && (target.closest('[data-option]') || target.closest('[data-mark]'))) return;
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

  window.addEventListener('resize', layout);
  window.addEventListener('error', function (event) {
    post({ type: 'error', message: String(event.message || 'error') });
  });

  post({ type: 'ready' });
}());
`;
