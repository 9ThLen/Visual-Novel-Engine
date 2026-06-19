import type { VNPlateEditorPayload } from './types';
import type { EmbeddedCommand } from './embedded-commands';
import { jsonForScript } from './embedded-utils';

export function createEmbeddedScript(payload: VNPlateEditorPayload, commands: EmbeddedCommand[]): string {
  return `
    var payload = ${jsonForScript(payload)};
    var commands = ${jsonForScript(commands)};
    var editor = document.getElementById('editor');
    var title = document.getElementById('title');
    var menu = document.getElementById('slashMenu');
    var saveTimer = 0;
    var activeSlash = null;
    var activeIndex = 0;

    function uid(prefix) {
      return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function post(message) {
      var full = Object.assign({ source: 'vn-plate-editor', editorId: payload.editorId }, message);
      if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(full));
      } else {
        window.parent.postMessage(full, '*');
      }
    }

    function scheduleSave() {
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(saveNow, 260);
    }

    function textOf(node) {
      return (node.textContent || '').replace(/\\u00a0/g, ' ').trimEnd();
    }

    function originalBlockForNode(node) {
      var id = node.dataset.id;
      if (!id || !payload.scene || !payload.scene.blocks) return null;
      return payload.scene.blocks.find(function(block) { return block.id === id; }) || null;
    }

    function serializeBlock(node) {
      var kind = node.dataset.kind;
      if (kind === 'technical') {
        var commandId = node.dataset.command || 'effect';
        var originalTechnical = originalBlockForNode(node);
        if (originalTechnical && originalTechnical.kind === 'technical' && originalTechnical.step) {
          return Object.assign({}, originalTechnical, {
            id: node.dataset.id || originalTechnical.id,
            commandId: commandId,
            blockType: originalTechnical.blockType || originalTechnical.step.blockType
          });
        }
        return {
          id: node.dataset.id || uid('doc_block'),
          kind: 'technical',
          commandId: commandId,
          blockType: commandId === 'sprite' ? 'character' : commandId,
          label: commandId,
          summary: '',
          step: null
        };
      }
      if (kind === 'choice') {
        var originalChoice = originalBlockForNode(node);
        if (originalChoice && originalChoice.kind === 'choice') {
          return Object.assign({}, originalChoice, {
            id: node.dataset.id || originalChoice.id,
            question: textOf(node) || originalChoice.question || 'Choice'
          });
        }
        return {
          id: node.dataset.id || uid('doc_choice'),
          kind: 'choice',
          question: textOf(node) || 'Choice',
          options: [
            { id: uid('choice'), text: 'Option 1', targetSceneId: null },
            { id: uid('choice'), text: 'Option 2', targetSceneId: null }
          ]
        };
      }
      if (kind === 'dialogue') {
        var originalDialogue = originalBlockForNode(node);
        var speaker = node.dataset.speaker || '';
        var badge = node.querySelector('.dialogue-badge');
        var raw = textOf(node);
        var text = badge ? raw.replace(/^.*?:\\s*/, '') : raw.replace(/^([^:]{1,48}):\\s*/, '');
        if (originalDialogue && originalDialogue.kind === 'dialogue') {
          return Object.assign({}, originalDialogue, {
            id: node.dataset.id || originalDialogue.id,
            speakerName: speaker || originalDialogue.speakerName,
            text: text
          });
        }
        return {
          id: node.dataset.id || uid('doc_dialogue'),
          kind: 'dialogue',
          speakerName: speaker,
          characterId: null,
          spriteId: null,
          text: text
        };
      }
      var originalText = originalBlockForNode(node);
      if (originalText && originalText.kind === 'text') {
        return Object.assign({}, originalText, {
          id: node.dataset.id || originalText.id,
          content: textOf(node)
        });
      }
      return {
        id: node.dataset.id || uid('doc_text'),
        kind: 'text',
        content: textOf(node)
      };
    }

    function buildScenePayload() {
      var blocks = Array.prototype.slice.call(editor.children)
        .map(serializeBlock)
        .filter(function(block) {
          if (block.kind !== 'text') return true;
          return block.content.trim() !== '' || editor.children.length === 1;
        });
      var last = blocks[blocks.length - 1];
      if (!last || last.kind !== 'text' || last.content.trim() !== '') {
        blocks.push({ id: uid('doc_text'), kind: 'text', content: '' });
      }
      return {
          sceneId: payload.scene.sceneId,
          sceneName: title.value || payload.scene.sceneName,
          blocks: blocks
      };
    }

    function saveNow() {
      post({
        type: 'save',
        scene: buildScenePayload()
      });
    }

    function ensureParagraph() {
      if (!editor.children.length) {
        var p = document.createElement('p');
        p.dataset.kind = 'text';
        p.dataset.id = uid('doc_text');
        p.appendChild(document.createElement('br'));
        editor.appendChild(p);
      }
    }

    function nearestParagraph() {
      var selection = window.getSelection();
      if (!selection || !selection.anchorNode) return null;
      var node = selection.anchorNode.nodeType === Node.TEXT_NODE ? selection.anchorNode.parentElement : selection.anchorNode;
      return node && node.closest ? node.closest('p') : null;
    }

    function transformDialogueIfNeeded() {
      var p = nearestParagraph();
      if (!p || p.dataset.kind === 'dialogue') return;
      var value = textOf(p);
      var match = /^([^:\\n]{1,48}):\\s*(.*)$/.exec(value);
      if (!match) return;
      var speaker = match[1].trim();
      if (!speaker || speaker[0] === '/') return;
      var text = match[2] || '';
      p.dataset.kind = 'dialogue';
      p.dataset.speaker = speaker;
      p.dataset.id = p.dataset.id || uid('doc_dialogue');
      p.innerHTML = '<span class="dialogue-badge" contenteditable="false"></span> ';
      p.querySelector('.dialogue-badge').textContent = speaker + ':';
      p.appendChild(document.createTextNode(text));
      moveCaretToEnd(p);
    }

    function moveCaretToEnd(element) {
      var range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function currentSlashQuery() {
      var selection = window.getSelection();
      if (!selection || !selection.rangeCount) return null;
      var range = selection.getRangeAt(0);
      var p = nearestParagraph();
      if (!p) return null;
      var text = textOf(p);
      var offsetText = text;
      var slash = offsetText.lastIndexOf('/');
      if (slash < 0) return null;
      var beforeSlash = offsetText.slice(0, slash);
      if (/\\S$/.test(beforeSlash)) return null;
      var query = offsetText.slice(slash + 1);
      if (/\\s/.test(query)) return null;
      var rect = range.getBoundingClientRect();
      return { paragraph: p, query: query, rect: rect };
    }

    function commandMatches(command, query) {
      if (!query) return true;
      var q = query.toLowerCase();
      return command.id.toLowerCase().indexOf(q) >= 0 || command.title.toLowerCase().indexOf(q) >= 0;
    }

    function renderSlashMenu(state) {
      activeSlash = state;
      var items = commands.filter(function(command) { return commandMatches(command, state.query); });
      if (!items.length) {
        closeSlashMenu();
        return;
      }
      activeIndex = Math.min(activeIndex, items.length - 1);
      menu.innerHTML = items.map(function(command, index) {
        return '<button class="slash-item ' + (index === activeIndex ? 'active' : '') + '" data-id="' + command.id + '">' +
          '<span class="slash-icon">' + command.title.slice(0, 2) + '</span>' +
          '<span><span class="slash-title">' + command.title + '</span><span class="slash-desc">' + command.description + '</span></span>' +
          '<span class="slash-alias">/' + command.id + '</span>' +
        '</button>';
      }).join('');
      menu.classList.remove('hidden');
      menu.style.left = Math.max(12, Math.min(window.innerWidth - 352, state.rect.left || 80)) + 'px';
      menu.style.top = Math.max(12, (state.rect.bottom || 120) + 8) + 'px';
      Array.prototype.slice.call(menu.querySelectorAll('.slash-item')).forEach(function(button) {
        button.addEventListener('mousedown', function(event) {
          event.preventDefault();
          insertCommand(button.dataset.id);
        });
      });
    }

    function closeSlashMenu() {
      activeSlash = null;
      menu.classList.add('hidden');
      menu.innerHTML = '';
    }

    function removeSlashToken(p) {
      var value = textOf(p);
      var slash = value.lastIndexOf('/');
      var next = slash >= 0 ? value.slice(0, slash).trimEnd() : value;
      p.textContent = next;
    }

    function insertCommand(commandId) {
      var p = activeSlash && activeSlash.paragraph ? activeSlash.paragraph : nearestParagraph();
      if (!p) return;
      if (commandId === 'newScene') {
        removeSlashToken(p);
        closeSlashMenu();
        post({ type: 'createNextScene', scene: buildScenePayload() });
        return;
      }
      removeSlashToken(p);
      var block = document.createElement('div');
      block.className = 'void-block';
      block.contentEditable = 'false';
      block.dataset.kind = 'technical';
      block.dataset.id = uid('doc_block');
      block.dataset.command = commandId;
      block.innerHTML = '<div class="void-title">/' + commandId + '</div><div class="void-summary">New block</div>';
      p.insertAdjacentElement('afterend', block);
      var next = document.createElement('p');
      next.dataset.kind = 'text';
      next.dataset.id = uid('doc_text');
      next.appendChild(document.createElement('br'));
      block.insertAdjacentElement('afterend', next);
      closeSlashMenu();
      moveCaretToEnd(next);
      saveNow();
    }

    editor.addEventListener('input', function() {
      ensureParagraph();
      transformDialogueIfNeeded();
      var slash = currentSlashQuery();
      if (slash) renderSlashMenu(slash);
      else closeSlashMenu();
      scheduleSave();
    });

    editor.addEventListener('keydown', function(event) {
      if (!activeSlash) return;
      var items = menu.querySelectorAll('.slash-item');
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        activeIndex = Math.min(items.length - 1, activeIndex + 1);
        renderSlashMenu(activeSlash);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        activeIndex = Math.max(0, activeIndex - 1);
        renderSlashMenu(activeSlash);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        var button = items[activeIndex];
        if (button) insertCommand(button.dataset.id);
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeSlashMenu();
      }
    });

    title.addEventListener('input', scheduleSave);
    document.addEventListener('selectionchange', function() {
      if (document.activeElement !== editor) return;
      var slash = currentSlashQuery();
      if (slash) renderSlashMenu(slash);
    });

    ensureParagraph();
    post({ type: 'ready' });
  `;
}
