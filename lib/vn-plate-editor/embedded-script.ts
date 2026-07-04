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
    var resizeTimer = 0;
    var activeSlash = null;
    var activeBackgroundBlock = null;
    var backgroundPopover = null;
    var backgroundDraft = null;
    var backgroundAssets = Array.isArray(payload.backgroundAssets) ? payload.backgroundAssets : [];
    var characters = Array.isArray(payload.characters) ? payload.characters.slice() : [];
    var characterPopover = null;
    var activeCharacterToken = null;
    var effectPopover = null;
    var activeEffectChip = null;
    var draggedEffectChip = null;
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

    function measureHeight() {
      var body = document.body;
      var root = document.documentElement;
      return Math.max(
        body ? body.scrollHeight : 0,
        body ? body.offsetHeight : 0,
        root ? root.scrollHeight : 0,
        root ? root.offsetHeight : 0
      );
    }

    function afterLayout(callback) {
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(callback);
        return;
      }
      window.setTimeout(callback, 0);
    }

    function postResize() {
      post({
        type: 'resize',
        height: measureHeight()
      });
    }

    function scheduleResize() {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(postResize, 140);
    }

    function textOf(node) {
      return (node.textContent || '').replace(/\\u00a0/g, ' ').trimEnd();
    }

    function originalBlockForNode(node) {
      var id = node.dataset.id;
      if (!id || !payload.scene || !payload.scene.blocks) return null;
      return payload.scene.blocks.find(function(block) { return block.id === id; }) || null;
    }

    function normalizeAssetName(value) {
      return (value || '').trim();
    }

    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function normalizeSpeakerName(value) {
      return String(value || '').normalize('NFC').trim().replace(/\\s+/g, ' ');
    }

    function normalizeSpeakerLookup(value) {
      return normalizeSpeakerName(value).toLocaleLowerCase();
    }

    function escapeRegExp(value) {
      return String(value || '').replace(/[\\\\^$.*+?()[\\]{}|]/g, '\\\\$&');
    }

    function stripLeadingSpeakerLabel(text, speaker) {
      var normalizedSpeaker = normalizeSpeakerName(speaker);
      if (!normalizedSpeaker) return String(text || '');
      return String(text || '').replace(new RegExp('^\\\\s*' + escapeRegExp(normalizedSpeaker) + '\\\\s*:\\\\s*', 'i'), '');
    }

    function textWithoutBadge(node, badge) {
      var raw = textOf(node);
      if (!badge) return raw.replace(/^([^:]{1,48}):\\s*/, '');
      var speaker = node.dataset.speaker || (badge.textContent || '').replace(/:\\s*$/, '');
      var withoutBadge = stripLeadingSpeakerLabel(raw, speaker);
      return stripLeadingSpeakerLabel(withoutBadge, speaker);
    }

    function isEffectChip(node) {
      return node && node.nodeType === Node.ELEMENT_NODE && node.classList && node.classList.contains('effect-chip');
    }

    function numberFromDataset(value, fallback) {
      var number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    }

    function jsonFromDataset(value) {
      if (!value) return undefined;
      try {
        var parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' ? parsed : undefined;
      } catch (error) {
        return undefined;
      }
    }

    function serializeInlineParts(node) {
      var parts = [];
      Array.prototype.slice.call(node.childNodes).forEach(function(child) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.textContent) parts.push({ type: 'text', text: child.textContent });
          return;
        }
        if (isEffectChip(child)) {
          var childEffectType = child.dataset.effectType || 'rain';
          var childDurationMode = normalizedEffectDurationMode(childEffectType, child.dataset.durationMode, child.dataset.duration);
          parts.push({
            type: 'effect',
            id: child.dataset.id || uid('inline_effect'),
            effectType: childEffectType,
            target: child.dataset.target || 'screen',
            characterId: child.dataset.characterId || undefined,
            intensity: numberFromDataset(child.dataset.intensity, 50),
            duration: normalizedEffectDuration(childEffectType, child.dataset.duration),
            durationMode: childDurationMode,
            fadeIn: child.dataset.fadeIn ? numberFromDataset(child.dataset.fadeIn, 0) : undefined,
            fadeOut: child.dataset.fadeOut ? numberFromDataset(child.dataset.fadeOut, 0) : undefined,
            rain: jsonFromDataset(child.dataset.rainOptions),
            snow: jsonFromDataset(child.dataset.snowOptions),
            fog: jsonFromDataset(child.dataset.fogOptions)
          });
          return;
        }
        if (child.nodeType === Node.ELEMENT_NODE && child.classList && child.classList.contains('speaker-token')) {
          return;
        }
        if (child.nodeName !== 'BR' && child.textContent) {
          parts.push({ type: 'text', text: child.textContent });
        }
      });
      return parts;
    }

    function hasEffectPart(parts) {
      return parts.some(function(part) { return part.type === 'effect'; });
    }

    function inlinePartsText(parts) {
      return parts
        .filter(function(part) { return part.type === 'text'; })
        .map(function(part) { return part.text; })
        .join('')
        .replace(/\\u00a0/g, ' ')
        .trimEnd();
    }

    function effectChipLabel(effectType) {
      var labels = {
        shake: 'Тряска',
        flash: 'Спалах',
        blur: 'Розмиття',
        rain: 'Дощ',
        snow: 'Сніг',
        fog: 'Туман',
        glitch: 'Гліч',
        vignette: 'Віньєтка'
      };
      return labels[effectType] || 'Ефект';
    }

    function effectTypeIcon(effectType) {
      var icons = {
        shake: '📳',
        flash: '⚡',
        blur: '🌀',
        rain: '🌧',
        snow: '❄️',
        fog: '🌫',
        glitch: '👾',
        vignette: '⭕'
      };
      return icons[effectType] || '✦';
    }

    function rainVariantLabel(variant) {
      var labels = {
        drizzle: 'мряка',
        rain: 'дощ',
        storm: 'гроза',
        fallout: 'fallout'
      };
      return labels[variant] || '';
    }

    function fogVariantLabel(variant) {
      var labels = { light: 'легкий', dense: 'щільний' };
      return labels[variant] || '';
    }

    function formatChipDuration(value) {
      var number = Number(value);
      if (!Number.isFinite(number) || number <= 0) return '';
      return String(Math.round(number * 10) / 10) + 'с';
    }

    function effectChipDetails(chip) {
      var effectType = chip.dataset.effectType || 'rain';
      var parts = [];
      if (effectType === 'rain') {
        var rain = jsonFromDataset(chip.dataset.rainOptions) || {};
        var variant = rain.variant || (rain.lightning ? 'storm' : 'rain');
        var variantLabel = rainVariantLabel(variant);
        if (variantLabel && variant !== 'rain') parts.push(variantLabel);
      }
      if (effectType === 'fog') {
        var fog = jsonFromDataset(chip.dataset.fogOptions) || {};
        var fogLabel = fogVariantLabel(fog.variant);
        if (fogLabel) parts.push(fogLabel);
      }
      if (chip.dataset.durationMode === 'scene') {
        parts.push('до кінця сцени');
      } else {
        var duration = formatChipDuration(chip.dataset.duration);
        if (duration) parts.push(duration);
      }
      return parts.join(' · ');
    }

    function defaultEffectDuration(effectType) {
      if (effectType === 'rain' || effectType === 'snow' || effectType === 'fog') return 8;
      if (effectType === 'flash') return 0.35;
      if (effectType === 'shake' || effectType === 'glitch' || effectType === 'vignette') return 0.8;
      return 1;
    }

    function normalizedEffectDuration(effectType, value) {
      var number = Number(value);
      return Number.isFinite(number) && number > 0 ? Math.max(0.1, number) : defaultEffectDuration(effectType);
    }

    function isSceneBoundEffectType(effectType) {
      return effectType === 'rain' || effectType === 'snow' || effectType === 'fog';
    }

    function normalizedEffectDurationMode(effectType, value, duration) {
      if (value === 'scene' || value === 'timed') return value;
      if (!isSceneBoundEffectType(effectType)) return 'timed';
      var number = Number(duration);
      return Number.isFinite(number) && number > 0 && Math.abs(number - defaultEffectDuration(effectType)) > 0.001
        ? 'timed'
        : 'scene';
    }

    function renderEffectChipContent(chip) {
      var effectType = chip.dataset.effectType || 'rain';
      var details = effectChipDetails(chip);
      chip.innerHTML = '<span class="effect-chip-icon">' + effectTypeIcon(effectType) + '</span>'
        + '<span>' + escapeHtml(effectChipLabel(effectType)) + '</span>'
        + (details ? '<span class="effect-chip-details">' + escapeHtml(details) + '</span>' : '')
        + '<span class="effect-chip-menu">⋮</span>';
    }

    function createEffectChip(data) {
      var chip = document.createElement('span');
      var effectType = data.effectType || 'rain';
      chip.className = 'effect-chip';
      chip.contentEditable = 'false';
      chip.draggable = true;
      chip.tabIndex = 0;
      chip.setAttribute('role', 'button');
      chip.dataset.kind = 'effect';
      chip.dataset.id = data.id || uid('inline_effect');
      chip.dataset.effectType = effectType;
      chip.dataset.target = data.target || 'screen';
      chip.dataset.intensity = String(data.intensity == null ? 50 : data.intensity);
      chip.dataset.durationMode = normalizedEffectDurationMode(effectType, data.durationMode, data.duration);
      chip.dataset.duration = String(normalizedEffectDuration(effectType, data.duration));
      if (data.characterId) chip.dataset.characterId = data.characterId;
      if (data.fadeIn != null) chip.dataset.fadeIn = String(data.fadeIn);
      if (data.fadeOut != null) chip.dataset.fadeOut = String(data.fadeOut);
      if (data.rain) chip.dataset.rainOptions = JSON.stringify(data.rain);
      if (data.snow) chip.dataset.snowOptions = JSON.stringify(data.snow);
      if (data.fog) chip.dataset.fogOptions = JSON.stringify(data.fog);
      renderEffectChipContent(chip);
      return chip;
    }

    function closeEffectPopover() {
      if (effectPopover) effectPopover.remove();
      effectPopover = null;
      if (activeEffectChip) activeEffectChip.classList.remove('is-selected');
      activeEffectChip = null;
      scheduleResize();
    }

    function positionEffectPopover(anchor) {
      if (!effectPopover || !anchor) return;
      var rect = anchor.getBoundingClientRect();
      var scrollX = window.scrollX || window.pageXOffset || 0;
      var scrollY = window.scrollY || window.pageYOffset || 0;
      var width = Math.min(420, window.innerWidth - 32);
      var left = scrollX + Math.max(16, Math.min(window.innerWidth - width - 16, rect.right + 12));
      var height = effectPopover.offsetHeight || 0;
      var top = scrollY + Math.max(16, Math.min(window.innerHeight - height - 16, rect.top - 16));
      effectPopover.style.left = left + 'px';
      effectPopover.style.top = top + 'px';
    }

    function effectDataFromChip(chip) {
      var effectType = chip.dataset.effectType || 'rain';
      return {
        effectType: effectType,
        target: chip.dataset.target || 'screen',
        characterId: chip.dataset.characterId || '',
        intensity: numberFromDataset(chip.dataset.intensity, 50),
        duration: normalizedEffectDuration(effectType, chip.dataset.duration),
        durationMode: normalizedEffectDurationMode(effectType, chip.dataset.durationMode, chip.dataset.duration),
        fadeIn: numberFromDataset(chip.dataset.fadeIn, 0),
        fadeOut: numberFromDataset(chip.dataset.fadeOut, 0),
        rain: jsonFromDataset(chip.dataset.rainOptions) || {},
        snow: jsonFromDataset(chip.dataset.snowOptions) || {},
        fog: jsonFromDataset(chip.dataset.fogOptions) || {}
      };
    }

    function setChipJson(chip, key, value) {
      if (value && Object.keys(value).length) chip.dataset[key] = JSON.stringify(value);
      else delete chip.dataset[key];
    }

    function applyEffectData(chip, data) {
      var effectType = data.effectType || 'rain';
      chip.dataset.effectType = effectType;
      chip.dataset.target = data.target || 'screen';
      chip.dataset.intensity = String(Math.max(0, Math.min(100, Number(data.intensity) || 0)));
      chip.dataset.durationMode = normalizedEffectDurationMode(effectType, data.durationMode, data.duration);
      chip.dataset.duration = String(normalizedEffectDuration(effectType, data.duration));
      chip.dataset.fadeIn = String(Math.max(0, Number(data.fadeIn) || 0));
      chip.dataset.fadeOut = String(Math.max(0, Number(data.fadeOut) || 0));
      if (data.characterId) chip.dataset.characterId = data.characterId;
      else delete chip.dataset.characterId;
      setChipJson(chip, 'rainOptions', data.rain || {});
      setChipJson(chip, 'snowOptions', data.snow || {});
      setChipJson(chip, 'fogOptions', data.fog || {});
      renderEffectChipContent(chip);
    }

    function weatherNumber(popover, field, fallback) {
      var input = popover.querySelector('[data-effect-field="' + field + '"]');
      return input ? numberFromDataset(input.value, fallback) : fallback;
    }

    function weatherText(popover, field, fallback) {
      var input = popover.querySelector('[data-effect-field="' + field + '"]');
      return input && input.value ? input.value : fallback;
    }

    function weatherChecked(popover, field) {
      var input = popover.querySelector('[data-effect-field="' + field + '"]');
      return Boolean(input && input.checked);
    }

    function activeEffectTypeValue() {
      if (!effectPopover) return 'rain';
      var active = effectPopover.querySelector('.effect-type-chip.is-active');
      return active && active.dataset.effectTypeOption ? active.dataset.effectTypeOption : 'rain';
    }

    function collectEffectForm() {
      if (!effectPopover) return null;
      var type = activeEffectTypeValue();
      var target = selectedValue(effectPopover.querySelector('[data-effect-field="target"]'), 'screen');
      var existing = activeEffectChip ? effectDataFromChip(activeEffectChip) : null;
      var durationMode = isSceneBoundEffectType(type) && weatherChecked(effectPopover, 'sceneBoundDuration') ? 'scene' : 'timed';
      var data = {
        effectType: type,
        target: target,
        characterId: target === 'character' ? selectedValue(effectPopover.querySelector('[data-effect-field="characterId"]'), '') : '',
        intensity: weatherNumber(effectPopover, 'intensity', 50),
        duration: normalizedEffectDuration(type, weatherNumber(effectPopover, 'duration', defaultEffectDuration(type))),
        durationMode: durationMode,
        fadeIn: weatherNumber(effectPopover, 'fadeIn', 0),
        fadeOut: weatherNumber(effectPopover, 'fadeOut', 0),
        rain: {},
        snow: {},
        fog: {}
      };
      if (type === 'rain') {
        // Поля, які прибрані з форми (color/wind/angle/dropLength/splash),
        // переносимо зі старих даних чипа, щоб не ламати наявні історії.
        var previousRain = existing && existing.rain ? existing.rain : {};
        var rainVariant = selectedValue(effectPopover.querySelector('[data-effect-field="rainVariant"]'), 'rain');
        data.rain = Object.assign({}, previousRain, {
          variant: rainVariant,
          opacity: weatherNumber(effectPopover, 'rainOpacity', 0.4),
          density: weatherNumber(effectPopover, 'rainDensity', 100),
          speed: weatherNumber(effectPopover, 'rainSpeed', 2),
          dropWidth: weatherNumber(effectPopover, 'rainDropWidth', 2),
          lightning: rainVariant === 'storm' || weatherChecked(effectPopover, 'rainLightning'),
          sound: weatherChecked(effectPopover, 'rainSound')
        });
      }
      if (type === 'snow') {
        var imageUris = weatherText(effectPopover, 'snowImageUris', '').split(',').map(function(item) { return item.trim(); }).filter(Boolean);
        data.snow = {
          color: weatherText(effectPopover, 'snowColor', '#ffffff'),
          snowflakeCount: weatherNumber(effectPopover, 'snowflakeCount', 150),
          radius: [weatherNumber(effectPopover, 'snowRadiusMin', 0.5), weatherNumber(effectPopover, 'snowRadiusMax', 3)],
          speed: [weatherNumber(effectPopover, 'snowSpeedMin', 1), weatherNumber(effectPopover, 'snowSpeedMax', 3)],
          wind: [weatherNumber(effectPopover, 'snowWindMin', -0.5), weatherNumber(effectPopover, 'snowWindMax', 2)],
          changeFrequency: weatherNumber(effectPopover, 'snowChangeFrequency', 200),
          rotationSpeed: [weatherNumber(effectPopover, 'snowRotationMin', -1), weatherNumber(effectPopover, 'snowRotationMax', 1)],
          opacity: [weatherNumber(effectPopover, 'snowOpacityMin', 1), weatherNumber(effectPopover, 'snowOpacityMax', 1)],
          enable3DRotation: weatherChecked(effectPopover, 'snowEnable3D'),
          imageUris: imageUris
        };
      }
      if (type === 'fog') {
        data.fog = {
          variant: selectedValue(effectPopover.querySelector('[data-effect-field="fogVariant"]'), 'light')
        };
      }
      return data;
    }

    function effectOption(value, label, current) {
      return option(value, label, current);
    }

    function openEffectPopover(chip) {
      if (!chip) return;
      closeSlashMenu();
      closeBackgroundPopover();
      closeCharacterPopover();
      if (activeEffectChip === chip && effectPopover) {
        closeEffectPopover();
        return;
      }
      closeEffectPopover();
      activeEffectChip = chip;
      activeEffectChip.classList.add('is-selected');
      var data = effectDataFromChip(chip);
      var rain = data.rain || {};
      var snow = data.snow || {};
      var fog = data.fog || {};
      var popover = document.createElement('div');
      popover.className = 'effect-popover';
      var effectTypes = ['rain', 'snow', 'fog', 'shake', 'flash', 'blur', 'glitch', 'vignette'];
      var typeChipsHtml = effectTypes.map(function(effectType) {
        return '<button type="button" class="effect-type-chip' + (effectType === data.effectType ? ' is-active' : '') + '" data-effect-type-option="' + effectType + '">' +
          '<span class="effect-type-chip-icon">' + effectTypeIcon(effectType) + '</span>' +
          '<span>' + escapeHtml(effectChipLabel(effectType)) + '</span>' +
        '</button>';
      }).join('');
      var characterOptionsHtml = '<option value=""' + (data.characterId ? '' : ' selected') + '>—</option>' +
        characters.map(function(character) {
          return option(character.id, character.name || character.id, data.characterId);
        }).join('');
      if (data.characterId && !findCharacterById(data.characterId)) {
        characterOptionsHtml += option(data.characterId, data.characterId, data.characterId);
      }
      var rainVariantCurrent = rain.variant || (rain.lightning ? 'storm' : 'rain');
      var sceneBoundChecked = isSceneBoundEffectType(data.effectType) && data.durationMode !== 'timed';
      popover.innerHTML =
        '<div class="effect-type-grid">' + typeChipsHtml + '</div>' +
        '<div class="effect-popover-grid">' +
          '<label class="popover-label">Ціль</label>' +
          '<select class="popover-control" data-effect-field="target">' +
            effectOption('screen', 'Весь екран', data.target) +
            effectOption('background', 'Фон', data.target) +
            effectOption('character', 'Персонаж', data.target) +
          '</select>' +
          '<label class="popover-label" data-effect-row="character">Персонаж</label>' +
          '<select class="popover-control" data-effect-field="characterId" data-effect-row="character">' + characterOptionsHtml + '</select>' +
          '<label class="popover-label">Інтенсивність</label>' +
          '<div class="effect-range-row"><input data-effect-field="intensity" type="range" min="0" max="100" step="1" value="' + escapeHtml(String(data.intensity)) + '" /><span class="effect-range-value">' + escapeHtml(String(data.intensity)) + '</span></div>' +
          '<label class="popover-label">Тривалість (с)</label>' +
          '<label class="effect-checkbox" data-effect-row="sceneBoundDuration"><input type="checkbox" data-effect-field="sceneBoundDuration"' + (sceneBoundChecked ? ' checked' : '') + ' /> До кінця сцени</label>' +
          '<input class="popover-control" data-effect-field="duration" type="number" min="0.1" step="0.1" value="' + escapeHtml(String(data.duration)) + '" />' +
          '<label class="popover-label">Поява (с)</label>' +
          '<input class="popover-control" data-effect-field="fadeIn" type="number" min="0" step="0.1" value="' + escapeHtml(String(data.fadeIn || 0)) + '" />' +
          '<label class="popover-label">Згасання (с)</label>' +
          '<input class="popover-control" data-effect-field="fadeOut" type="number" min="0" step="0.1" value="' + escapeHtml(String(data.fadeOut || 0)) + '" />' +
        '</div>' +
        '<div class="effect-options" data-effect-section="rain">' +
          '<div class="effect-section-title">Дощ</div>' +
          '<div class="effect-popover-grid">' +
            '<label class="popover-label">Пресет</label><select class="popover-control" data-effect-field="rainVariant">' +
              effectOption('drizzle', 'Мряка', rainVariantCurrent) +
              effectOption('rain', 'Дощ', rainVariantCurrent) +
              effectOption('storm', 'Гроза', rainVariantCurrent) +
              effectOption('fallout', 'Fallout', rainVariantCurrent) +
            '</select>' +
            '<label class="popover-label">Прозорість</label>' +
            '<div class="effect-range-row"><input data-effect-field="rainOpacity" type="range" min="0" max="1" step="0.05" value="' + escapeHtml(String(rain.opacity ?? 0.4)) + '" /><span class="effect-range-value">' + escapeHtml(String(rain.opacity ?? 0.4)) + '</span></div>' +
          '</div>' +
          '<label class="effect-checkbox"><input type="checkbox" data-effect-field="rainLightning"' + (rain.lightning ? ' checked' : '') + ' /> Блискавка</label>' +
          '<label class="effect-checkbox"><input type="checkbox" data-effect-field="rainSound"' + (rain.sound === false ? '' : ' checked') + ' /> Звук дощу і грому</label>' +
          '<details class="effect-advanced"><summary>Розширені</summary>' +
            '<div class="effect-popover-grid">' +
              '<label class="popover-label">Щільність</label><input class="popover-control" data-effect-field="rainDensity" type="number" min="0" value="' + escapeHtml(String(rain.density ?? 100)) + '" />' +
              '<label class="popover-label">Швидкість</label><input class="popover-control" data-effect-field="rainSpeed" type="number" min="0" step="0.1" value="' + escapeHtml(String(rain.speed ?? 2)) + '" />' +
              '<label class="popover-label">Товщина краплі</label><input class="popover-control" data-effect-field="rainDropWidth" type="number" min="1" step="0.5" value="' + escapeHtml(String(rain.dropWidth ?? 2)) + '" />' +
            '</div>' +
          '</details>' +
        '</div>' +
        '<div class="effect-options" data-effect-section="snow">' +
          '<div class="effect-section-title">Сніг</div>' +
          '<div class="effect-popover-grid">' +
            '<label class="popover-label">Кількість сніжинок</label><input class="popover-control" data-effect-field="snowflakeCount" type="number" min="0" value="' + escapeHtml(String(snow.snowflakeCount ?? 150)) + '" />' +
            '<label class="popover-label">Колір</label><input class="popover-control" data-effect-field="snowColor" value="' + escapeHtml(snow.color || '#ffffff') + '" />' +
          '</div>' +
          '<details class="effect-advanced"><summary>Розширені</summary>' +
            '<div class="effect-popover-grid">' +
              '<label class="popover-label">Розмір min/max</label><div class="effect-pair"><input class="popover-control" data-effect-field="snowRadiusMin" type="number" step="0.1" value="' + escapeHtml(String((snow.radius && snow.radius[0]) ?? 0.5)) + '" /><input class="popover-control" data-effect-field="snowRadiusMax" type="number" step="0.1" value="' + escapeHtml(String((snow.radius && snow.radius[1]) ?? 3)) + '" /></div>' +
              '<label class="popover-label">Швидкість min/max</label><div class="effect-pair"><input class="popover-control" data-effect-field="snowSpeedMin" type="number" step="0.1" value="' + escapeHtml(String((snow.speed && snow.speed[0]) ?? 1)) + '" /><input class="popover-control" data-effect-field="snowSpeedMax" type="number" step="0.1" value="' + escapeHtml(String((snow.speed && snow.speed[1]) ?? 3)) + '" /></div>' +
              '<label class="popover-label">Вітер min/max</label><div class="effect-pair"><input class="popover-control" data-effect-field="snowWindMin" type="number" step="0.1" value="' + escapeHtml(String((snow.wind && snow.wind[0]) ?? -0.5)) + '" /><input class="popover-control" data-effect-field="snowWindMax" type="number" step="0.1" value="' + escapeHtml(String((snow.wind && snow.wind[1]) ?? 2)) + '" /></div>' +
              '<label class="popover-label">Частота змін</label><input class="popover-control" data-effect-field="snowChangeFrequency" type="number" min="1" value="' + escapeHtml(String(snow.changeFrequency ?? 200)) + '" />' +
              '<label class="popover-label">Обертання min/max</label><div class="effect-pair"><input class="popover-control" data-effect-field="snowRotationMin" type="number" step="0.1" value="' + escapeHtml(String((snow.rotationSpeed && snow.rotationSpeed[0]) ?? -1)) + '" /><input class="popover-control" data-effect-field="snowRotationMax" type="number" step="0.1" value="' + escapeHtml(String((snow.rotationSpeed && snow.rotationSpeed[1]) ?? 1)) + '" /></div>' +
              '<label class="popover-label">Прозорість min/max</label><div class="effect-pair"><input class="popover-control" data-effect-field="snowOpacityMin" type="number" min="0" max="1" step="0.05" value="' + escapeHtml(String((snow.opacity && snow.opacity[0]) ?? 1)) + '" /><input class="popover-control" data-effect-field="snowOpacityMax" type="number" min="0" max="1" step="0.05" value="' + escapeHtml(String((snow.opacity && snow.opacity[1]) ?? 1)) + '" /></div>' +
              '<label class="popover-label">Зображення (URI)</label><input class="popover-control" data-effect-field="snowImageUris" value="' + escapeHtml((snow.imageUris || []).join(', ')) + '" />' +
            '</div>' +
            '<label class="effect-checkbox"><input type="checkbox" data-effect-field="snowEnable3D"' + (snow.enable3DRotation ? ' checked' : '') + ' /> 3D-обертання</label>' +
          '</details>' +
        '</div>' +
        '<div class="effect-options" data-effect-section="fog">' +
          '<div class="effect-section-title">Туман</div>' +
          '<div class="effect-popover-grid">' +
            '<label class="popover-label">Пресет</label><select class="popover-control" data-effect-field="fogVariant">' +
              effectOption('light', 'Легкий туман', fog.variant || (data.intensity >= 60 ? 'dense' : 'light')) +
              effectOption('dense', 'Щільний туман', fog.variant || (data.intensity >= 60 ? 'dense' : 'light')) +
            '</select>' +
          '</div>' +
        '</div>' +
        '<div class="popover-footer"><button type="button" class="popover-button" data-action="reset-effect">Скинути</button><button type="button" class="popover-button primary" data-action="save-effect">Зберегти</button></div>';
      document.body.appendChild(popover);
      effectPopover = popover;
      updateEffectSections();
      afterLayout(function() { positionEffectPopover(chip); });
    }

    function updateEffectSections() {
      if (!effectPopover) return;
      var type = activeEffectTypeValue();
      Array.prototype.slice.call(effectPopover.querySelectorAll('[data-effect-section]')).forEach(function(section) {
        section.classList.toggle('hidden', section.dataset.effectSection !== type);
      });
      var target = selectedValue(effectPopover.querySelector('[data-effect-field="target"]'), 'screen');
      Array.prototype.slice.call(effectPopover.querySelectorAll('[data-effect-row="character"]')).forEach(function(node) {
        node.classList.toggle('hidden', target !== 'character');
      });
      var sceneBoundSupported = isSceneBoundEffectType(type);
      Array.prototype.slice.call(effectPopover.querySelectorAll('[data-effect-row="sceneBoundDuration"]')).forEach(function(node) {
        node.classList.toggle('hidden', !sceneBoundSupported);
      });
      var sceneBoundInput = effectPopover.querySelector('[data-effect-field="sceneBoundDuration"]');
      var durationInput = effectPopover.querySelector('[data-effect-field="duration"]');
      if (durationInput) {
        durationInput.disabled = Boolean(sceneBoundSupported && sceneBoundInput && sceneBoundInput.checked);
      }
      afterLayout(function() { positionEffectPopover(activeEffectChip); });
    }

    function selectEffectTypeChip(button) {
      if (!effectPopover || !button) return;
      Array.prototype.slice.call(effectPopover.querySelectorAll('.effect-type-chip')).forEach(function(chip) {
        chip.classList.toggle('is-active', chip === button);
      });
      updateEffectSections();
    }

    function findCharacterById(id) {
      if (!id) return null;
      return characters.find(function(character) { return character.id === id; }) || null;
    }

    function findCharacterByName(name) {
      var lookup = normalizeSpeakerLookup(name);
      if (!lookup) return null;
      return characters.find(function(character) {
        return normalizeSpeakerLookup(character.name) === lookup;
      }) || null;
    }

    function currentSpriteId(character) {
      if (!character) return null;
      return character.authoring && character.authoring.currentSpriteId
        || character.defaultSpriteId
        || (character.sprites && character.sprites[0] && character.sprites[0].id)
        || null;
    }

    function colorForCharacterKey(key) {
      var palette = ['#ff4d6d', '#14b8a6', '#3b82f6', '#f59e0b', '#8b5cf6', '#22c55e', '#ef4444', '#06b6d4'];
      var hash = 0;
      for (var index = 0; index < String(key || '').length; index += 1) {
        hash = (hash * 31 + String(key).charCodeAt(index)) >>> 0;
      }
      return palette[hash % palette.length];
    }

    function migrateCharacter(character) {
      var next = Object.assign({}, character);
      next.sprites = Array.isArray(next.sprites) ? next.sprites : [];
      next.color = next.color || colorForCharacterKey(next.id || next.name);
      next.authoring = Object.assign({
        currentSpriteId: next.defaultSpriteId || (next.sprites[0] && next.sprites[0].id) || null,
        currentPosition: 'center',
        focusOnSpeak: true
      }, next.authoring || {});
      return next;
    }

    function createCharacter(name) {
      var created = migrateCharacter({
        id: uid('char'),
        name: normalizeSpeakerName(name),
        sprites: [],
        createdAt: Date.now()
      });
      characters.push(created);
      return created;
    }

    function ensureCharacter(name) {
      return findCharacterByName(name) || createCharacter(name);
    }

    function ensureCharacterWithStatus(name) {
      var existing = findCharacterByName(name);
      if (existing) return { character: existing, created: false };
      return { character: createCharacter(name), created: true };
    }

    function configureSpeakerToken(token, character, blockId) {
      if (!token || !character) return;
      token.classList.add('speaker-token', 'dialogue-badge');
      token.contentEditable = 'false';
      token.tabIndex = 0;
      token.setAttribute('role', 'button');
      token.setAttribute('aria-label', 'Edit character ' + character.name);
      token.dataset.characterId = character.id;
      token.dataset.blockId = blockId || '';
      token.style.setProperty('--speaker-color', character.color || colorForCharacterKey(character.id));
      token.textContent = character.name + ':';
    }

    function closeCharacterPopover() {
      if (characterPopover) characterPopover.remove();
      characterPopover = null;
      activeCharacterToken = null;
      scheduleResize();
    }

    function positionCharacterPopover(anchor) {
      if (!characterPopover || !anchor) return;
      var rect = anchor.getBoundingClientRect();
      var scrollX = window.scrollX || window.pageXOffset || 0;
      var scrollY = window.scrollY || window.pageYOffset || 0;
      var width = Math.min(360, window.innerWidth - 32);
      var left = scrollX + Math.max(16, Math.min(window.innerWidth - width - 16, rect.left));
      var height = characterPopover.offsetHeight || 0;
      var top = scrollY + Math.max(16, Math.min(window.innerHeight - height - 16, rect.bottom + 8));
      characterPopover.style.left = left + 'px';
      characterPopover.style.top = top + 'px';
    }

    function spriteNameExists(character, name) {
      var lookup = normalizeSpeakerLookup(name);
      return (character.sprites || []).some(function(sprite) {
        return normalizeSpeakerLookup(sprite.name) === lookup;
      });
    }

    function uniqueSpriteName(character, name) {
      var base = normalizeSpeakerName(name) || 'Sprite';
      if (!spriteNameExists(character, base)) return base;
      var index = 2;
      while (spriteNameExists(character, base + ' ' + index)) index += 1;
      return base + ' ' + index;
    }

    function renderCharacterPopover(token) {
      var character = findCharacterById(token && token.dataset.characterId);
      if (!character) return;
      closeBackgroundPopover();
      closeEffectPopover();
      closeCharacterPopover();
      activeCharacterToken = token;
      var popover = document.createElement('div');
      popover.className = 'character-popover';
      var selectedSpriteId = token.closest('p') && token.closest('p').dataset.spriteId || currentSpriteId(character) || '';
      var spriteRows = (character.sprites || []).length
        ? character.sprites.map(function(sprite) {
            return '<label class="sprite-row"><span>' + escapeHtml(sprite.name || sprite.id) + '</span>' +
              '<input type="radio" name="characterSprite" value="' + escapeHtml(sprite.id) + '"' + (sprite.id === selectedSpriteId ? ' checked' : '') + ' /></label>';
          }).join('')
        : '<div class="asset-empty">No sprites uploaded for this character.</div>';
      popover.innerHTML =
        '<label class="popover-label">Name</label>' +
        '<input class="popover-control" data-field="character-name" value="' + escapeHtml(character.name) + '" />' +
        '<label class="popover-label">Color</label>' +
        '<input class="popover-control" data-field="character-color" type="color" value="' + escapeHtml(character.color || '#ff4d6d') + '" />' +
        '<label class="popover-label">Current sprite</label>' +
        '<div class="sprite-list">' + spriteRows + '</div>' +
        '<input class="popover-control" data-field="sprite-name" placeholder="Sprite name" />' +
        '<div class="preview-actions"><button type="button" class="popover-button" data-action="upload-character-sprite">Upload sprite</button><button type="button" class="popover-button" data-action="delete-character-sprite">Delete selected</button></div>' +
        '<input class="character-sprite-file" type="file" accept="image/*" hidden />' +
        '<label class="popover-label">Position</label>' +
        '<select class="popover-control" data-field="character-position">' +
          option('far-left', 'Far left', character.authoring && character.authoring.currentPosition) +
          option('left', 'Left', character.authoring && character.authoring.currentPosition) +
          option('center', 'Center', character.authoring && character.authoring.currentPosition) +
          option('right', 'Right', character.authoring && character.authoring.currentPosition) +
          option('far-right', 'Far right', character.authoring && character.authoring.currentPosition) +
        '</select>' +
        '<label class="sprite-row"><span>Focus when speaking</span><input type="checkbox" data-field="focus-on-speak"' + (!character.authoring || character.authoring.focusOnSpeak !== false ? ' checked' : '') + ' /></label>' +
        '<p class="popover-help">Character edits are saved as library changes, outside text undo.</p>' +
        '<div class="popover-footer"><button type="button" class="popover-button" data-action="close-character">Close</button><button type="button" class="popover-button primary" data-action="save-character">Save</button></div>';
      document.body.appendChild(popover);
      characterPopover = popover;
      afterLayout(function() { positionCharacterPopover(token); });
      post({ type: 'openCharacterPopover', characterId: character.id, blockId: token.dataset.blockId || '' });
    }

    function collectCharacterPopover() {
      if (!characterPopover || !activeCharacterToken) return;
      var character = findCharacterById(activeCharacterToken.dataset.characterId);
      if (!character) return;
      var paragraph = activeCharacterToken.closest('p');
      var nameInput = characterPopover.querySelector('[data-field="character-name"]');
      var colorInput = characterPopover.querySelector('[data-field="character-color"]');
      var positionInput = characterPopover.querySelector('[data-field="character-position"]');
      var focusInput = characterPopover.querySelector('[data-field="focus-on-speak"]');
      var selectedSprite = characterPopover.querySelector('input[name="characterSprite"]:checked');
      character.name = normalizeSpeakerName(nameInput && nameInput.value) || character.name;
      character.color = colorInput && colorInput.value || character.color || colorForCharacterKey(character.id);
      character.authoring = Object.assign({}, character.authoring || {}, {
        currentSpriteId: selectedSprite && selectedSprite.value || currentSpriteId(character),
        currentPosition: positionInput && positionInput.value || 'center',
        focusOnSpeak: Boolean(focusInput && focusInput.checked)
      });
      if (!character.defaultSpriteId && character.authoring.currentSpriteId) character.defaultSpriteId = character.authoring.currentSpriteId;
      if (paragraph) {
        paragraph.dataset.speaker = character.name;
        paragraph.dataset.characterId = character.id;
        paragraph.dataset.spriteId = character.authoring.currentSpriteId || '';
      }
      configureSpeakerToken(activeCharacterToken, character, paragraph && paragraph.dataset.id);
      saveNow();
    }

    function assetLabel(asset) {
      return asset && asset.name ? asset.name.replace(/\.[^.]+$/, '') : '';
    }

    function findBackgroundAsset(value) {
      var normalized = normalizeAssetName(value);
      if (!normalized) return null;
      return backgroundAssets.find(function(asset) {
        return asset.id === normalized || asset.uri === normalized || asset.name === normalized || assetLabel(asset) === normalized;
      }) || null;
    }

    function formatTransition(value) {
      if (!value) return 'Fade';
      return value.charAt(0).toUpperCase() + value.slice(1);
    }

    function formatSeconds(value) {
      var number = Number(value);
      if (!Number.isFinite(number)) number = 0;
      return (Math.round(number * 100) / 100).toString() + 's';
    }

    function backgroundDataFromNode(node) {
      var durationMs = Number(node.dataset.durationMs);
      var delay = Number(node.dataset.delay);
      return {
        assetId: normalizeAssetName(node.dataset.assetId) || null,
        transition: node.dataset.transition || 'fade',
        duration: Number.isFinite(durationMs) ? durationMs : 500,
        delay: Number.isFinite(delay) ? delay : 0,
        fit: node.dataset.fit || 'cover',
        position: node.dataset.position || 'center'
      };
    }

    function backgroundSummary(data) {
      return formatTransition(data.transition) + ' · ' + formatSeconds((data.duration || 0) / 1000) + ' · ' + (data.fit || 'cover');
    }

    function renderAllBackgroundBlocks() {
      Array.prototype.slice.call(editor.querySelectorAll('.background-block')).forEach(function(block) {
        renderBackgroundBlockContent(block);
      });
    }

    function renderBackgroundBlockContent(node) {
      var data = backgroundDataFromNode(node);
      var asset = findBackgroundAsset(data.assetId);
      var assetName = asset ? assetLabel(asset) || asset.name || asset.id : data.assetId ? data.assetId.replace(/^asset_/, '') : 'No background selected';
      node.innerHTML =
        '<div class="background-copy">' +
          '<div class="background-command-line">' +
            '<span class="void-title">/background</span>' +
            '<span class="background-asset"></span>' +
          '</div>' +
          '<div class="void-summary"></div>' +
        '</div>' +
        '<div class="block-actions">' +
          '<button type="button" class="block-button" data-action="pick-background">Pick</button>' +
          '<button type="button" class="block-button" data-action="edit-background">Edit</button>' +
        '</div>';
      node.querySelector('.background-asset').textContent = assetName;
      node.querySelector('.void-summary').textContent = backgroundSummary(data);
    }

    function applyBackgroundData(node, data) {
      node.dataset.assetId = normalizeAssetName(data.assetId) || '';
      node.dataset.transition = data.transition || 'fade';
      node.dataset.durationMs = String(Math.max(0, Math.round(Number(data.duration) || 0)));
      node.dataset.delay = String(Math.max(0, Number(data.delay) || 0));
      node.dataset.fit = data.fit || 'cover';
      node.dataset.position = data.position || 'center';
      renderBackgroundBlockContent(node);
    }

    function selectedValue(select, fallback) {
      return select ? select.value || fallback : fallback;
    }

    function closeBackgroundPopover() {
      if (backgroundPopover) backgroundPopover.remove();
      backgroundPopover = null;
      backgroundDraft = null;
      if (activeBackgroundBlock) activeBackgroundBlock.classList.remove('is-editing', 'is-selected');
      activeBackgroundBlock = null;
      scheduleResize();
    }

    function positionBackgroundPopover(anchor) {
      if (!backgroundPopover || !anchor) return;
      var rect = anchor.getBoundingClientRect();
      var scrollX = window.scrollX || window.pageXOffset || 0;
      var scrollY = window.scrollY || window.pageYOffset || 0;
      var popoverWidth = Math.min(420, window.innerWidth - 32);
      var left = scrollX + Math.max(16, Math.min(window.innerWidth - popoverWidth - 16, rect.right - popoverWidth));
      var popoverHeight = backgroundPopover.offsetHeight || 0;
      var top = scrollY + Math.max(16, Math.min(window.innerHeight - popoverHeight - 16, rect.bottom + 8));
      backgroundPopover.style.left = left + 'px';
      backgroundPopover.style.top = top + 'px';
    }

    function option(value, label, current) {
      return '<option value="' + value + '"' + (value === current ? ' selected' : '') + '>' + label + '</option>';
    }

    function openBackgroundPopover(block, anchor) {
      if (!block) return;
      closeSlashMenu();
      if (activeBackgroundBlock === block && backgroundPopover) {
        closeBackgroundPopover();
        return;
      }
      closeEffectPopover();
      closeBackgroundPopover();
      activeBackgroundBlock = block;
      activeBackgroundBlock.classList.add('is-editing', 'is-selected');
      backgroundDraft = backgroundDataFromNode(block);

      var popover = document.createElement('div');
      popover.className = 'background-popover';
      popover.innerHTML =
        '<label class="popover-label" for="bgAssetInput">Назва фону</label>' +
        '<input id="bgAssetInput" class="popover-control" value="" list="backgroundAssets" />' +
        '<datalist id="backgroundAssets">' +
          '<option value="forest_night"></option>' +
          '<option value="city_evening"></option>' +
          '<option value="school_day"></option>' +
          '<option value="room_night"></option>' +
        '</datalist>' +
        '<div class="background-preview"></div>' +
        '<div class="preview-actions"><button type="button" class="popover-button" data-action="choose-background">Обрати</button></div>' +
        '<div class="asset-picker hidden"></div>' +
        '<div class="popover-grid">' +
          '<label class="popover-label" for="bgTransition">Ефект переходу</label>' +
          '<select id="bgTransition" class="popover-control">' +
            option('fade', 'Fade', backgroundDraft.transition) +
            option('dissolve', 'Dissolve', backgroundDraft.transition) +
            option('instant', 'Instant', backgroundDraft.transition) +
            option('wipe', 'Wipe', backgroundDraft.transition) +
          '</select>' +
          '<label class="popover-label" for="bgFit">Режим</label>' +
          '<select id="bgFit" class="popover-control">' +
            option('cover', 'Cover', backgroundDraft.fit) +
            option('contain', 'Contain', backgroundDraft.fit) +
            option('stretch', 'Stretch', backgroundDraft.fit) +
          '</select>' +
          '<label class="popover-label" for="bgPosition">Позиція</label>' +
          '<select id="bgPosition" class="popover-control">' +
            option('center', 'Center', backgroundDraft.position) +
            option('top', 'Top', backgroundDraft.position) +
            option('bottom', 'Bottom', backgroundDraft.position) +
            option('left', 'Left', backgroundDraft.position) +
            option('right', 'Right', backgroundDraft.position) +
          '</select>' +
          '<label class="popover-label" for="bgDelay">Затримка</label>' +
          '<input id="bgDelay" class="popover-control" inputmode="decimal" value="" />' +
          '<label class="popover-label" for="bgDuration">Тривалість</label>' +
          '<input id="bgDuration" class="popover-control" inputmode="decimal" value="" />' +
        '</div>' +
        '<p class="popover-help">Зміна фону застосовується з цього моменту сцени і буде показана у відповідному порядку відтворення.</p>' +
        '<div class="popover-footer">' +
          '<button type="button" class="popover-button" data-action="reset-background">Скинути</button>' +
          '<button type="button" class="popover-button primary" data-action="save-background">Зберегти</button>' +
        '</div>';

      document.body.appendChild(popover);
      backgroundPopover = popover;
      popover.querySelector('#bgAssetInput').value = backgroundDraft.assetId || '';
      var selectedAsset = findBackgroundAsset(backgroundDraft.assetId);
      if (selectedAsset) {
        popover.dataset.selectedAssetId = selectedAsset.id;
        popover.querySelector('#bgAssetInput').value = assetLabel(selectedAsset) || selectedAsset.name || selectedAsset.id;
      }
      popover.querySelector('#bgDelay').value = formatSeconds(backgroundDraft.delay || 0);
      popover.querySelector('#bgDuration').value = formatSeconds((backgroundDraft.duration || 0) / 1000);
      updatePreview(popover, selectedAsset ? selectedAsset.id : backgroundDraft.assetId);
      renderAssetPicker(popover);
      afterLayout(function() { positionBackgroundPopover(anchor || block); });
    }

    function updatePreview(popover, assetId) {
      var preview = popover && popover.querySelector('.background-preview');
      if (!preview) return;
      var asset = findBackgroundAsset(assetId);
      var uri = asset ? asset.uri : normalizeAssetName(assetId);
      if (!uri) {
        preview.classList.add('placeholder');
        preview.textContent = 'Фон не вибрано';
        preview.style.backgroundImage = '';
        return;
      }
      preview.classList.remove('placeholder');
      preview.textContent = '';
      preview.style.backgroundImage = 'linear-gradient(180deg, rgba(6, 16, 32, 0.04), rgba(6, 16, 32, 0.18)), url("' + String(uri).replace(/"/g, '\\"') + '")';
      preview.style.backgroundSize = 'cover';
      preview.style.backgroundPosition = 'center';
    }

    function setSelectedBackgroundAsset(asset) {
      if (!backgroundPopover || !asset) return;
      var input = backgroundPopover.querySelector('#bgAssetInput');
      if (input) input.value = assetLabel(asset) || asset.name || asset.id;
      backgroundPopover.dataset.selectedAssetId = asset.id;
      updatePreview(backgroundPopover, asset.id);
      renderAssetPicker(backgroundPopover);
    }

    function renderAssetPicker(popover) {
      var picker = popover && popover.querySelector('.asset-picker');
      if (!picker) return;
      var selected = popover.dataset.selectedAssetId || '';
      var items = backgroundAssets.length
        ? backgroundAssets.map(function(asset) {
            var active = asset.id === selected ? ' active' : '';
            return '<button type="button" class="asset-choice' + active + '" data-action="select-background-asset" data-asset-id="' + escapeHtml(asset.id) + '">' +
              '<span class="asset-thumb" style="background-image:url(&quot;' + escapeHtml(asset.uri) + '&quot;)"></span>' +
              '<span class="asset-name">' + escapeHtml(assetLabel(asset) || asset.name || asset.id) + '</span>' +
            '</button>';
          }).join('')
        : '<div class="asset-empty">Ще немає завантажених фонів.</div>';

      picker.innerHTML =
        '<div class="asset-picker-actions">' +
          '<button type="button" class="popover-button" data-action="upload-background">З комп’ютеру</button>' +
          '<button type="button" class="popover-button" data-action="hide-asset-picker">Готово</button>' +
        '</div>' +
        '<div class="asset-choice-list">' + items + '</div>' +
        '<input class="asset-file-input" type="file" accept="image/*" hidden />';
    }

    function openAssetPicker() {
      if (!backgroundPopover) return;
      var picker = backgroundPopover.querySelector('.asset-picker');
      if (!picker) return;
      picker.classList.remove('hidden');
      renderAssetPicker(backgroundPopover);
      scheduleResize();
    }

    function parseSecondsInput(value, fallback) {
      var cleaned = String(value || '').replace(',', '.').replace(/s$/i, '').trim();
      var number = Number(cleaned);
      return Number.isFinite(number) ? Math.max(0, number) : fallback;
    }

    function collectBackgroundForm() {
      if (!backgroundPopover) return backgroundDraft || {};
      var asset = backgroundPopover.querySelector('#bgAssetInput');
      var transition = backgroundPopover.querySelector('#bgTransition');
      var fit = backgroundPopover.querySelector('#bgFit');
      var position = backgroundPopover.querySelector('#bgPosition');
      var delay = backgroundPopover.querySelector('#bgDelay');
      var duration = backgroundPopover.querySelector('#bgDuration');
      return {
        assetId: normalizeAssetName(backgroundPopover.dataset.selectedAssetId) || normalizeAssetName(asset && asset.value) || null,
        transition: selectedValue(transition, 'fade'),
        fit: selectedValue(fit, 'cover'),
        position: selectedValue(position, 'center'),
        delay: parseSecondsInput(delay && delay.value, backgroundDraft ? backgroundDraft.delay : 0),
        duration: Math.round(parseSecondsInput(duration && duration.value, backgroundDraft ? backgroundDraft.duration / 1000 : 0.5) * 1000)
      };
    }

    function serializeBlock(node) {
      var kind = node.dataset.kind;
      if (kind === 'technical') {
        var commandId = node.dataset.command || 'effect';
        var originalTechnical = originalBlockForNode(node);
        if (commandId === 'background') {
          var backgroundData = backgroundDataFromNode(node);
          var originalStep = originalTechnical && originalTechnical.kind === 'technical' && originalTechnical.step
            ? originalTechnical.step
            : null;
          var step = originalStep
            ? Object.assign({}, originalStep, {
                blockType: 'background',
                data: Object.assign({}, originalStep.data || {}, backgroundData)
              })
            : {
                id: node.dataset.id || uid('step'),
                blockType: 'background',
                data: backgroundData,
                collapsed: false,
                enabled: true
              };
          return {
            id: node.dataset.id || uid('doc_block'),
            kind: 'technical',
            commandId: 'background',
            blockType: 'background',
            label: 'Background',
            summary: backgroundSummary(backgroundData),
            step: step
          };
        }
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
          blockType: commandId,
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
        var badge = node.querySelector('.speaker-token') || node.querySelector('.dialogue-badge');
        var dialogueParts = serializeInlineParts(node);
        var text = hasEffectPart(dialogueParts) ? inlinePartsText(dialogueParts) : textWithoutBadge(node, badge);
        var characterId = node.dataset.characterId || (badge && badge.dataset.characterId) || null;
        var character = findCharacterById(characterId);
        if (originalDialogue && originalDialogue.kind === 'dialogue') {
          var nextDialogue = Object.assign({}, originalDialogue, {
            id: node.dataset.id || originalDialogue.id,
            speakerName: character && character.name || speaker || originalDialogue.speakerName,
            characterId: characterId || originalDialogue.characterId || null,
            spriteId: node.dataset.spriteId || originalDialogue.spriteId || currentSpriteId(character),
            tokenColor: character && character.color || originalDialogue.tokenColor,
            openCharacterControls: false,
            text: text
          });
          if (hasEffectPart(dialogueParts)) nextDialogue.parts = dialogueParts;
          else delete nextDialogue.parts;
          return nextDialogue;
        }
        var newDialogue = {
          id: node.dataset.id || uid('doc_dialogue'),
          kind: 'dialogue',
          speakerName: character && character.name || speaker,
          characterId: characterId,
          spriteId: node.dataset.spriteId || currentSpriteId(character),
          tokenColor: character && character.color,
          openCharacterControls: false,
          text: text
        };
        if (hasEffectPart(dialogueParts)) newDialogue.parts = dialogueParts;
        return newDialogue;
      }
      var originalText = originalBlockForNode(node);
      var textParts = serializeInlineParts(node);
      var content = hasEffectPart(textParts) ? inlinePartsText(textParts) : textOf(node);
      if (originalText && originalText.kind === 'text') {
        var nextText = Object.assign({}, originalText, {
          id: node.dataset.id || originalText.id,
          content: content
        });
        if (hasEffectPart(textParts)) nextText.parts = textParts;
        else delete nextText.parts;
        return nextText;
      }
      var newText = {
        id: node.dataset.id || uid('doc_text'),
        kind: 'text',
        content: content
      };
      if (hasEffectPart(textParts)) newText.parts = textParts;
      return newText;
    }

    function buildScenePayload() {
      var blocks = Array.prototype.slice.call(editor.children)
        .map(serializeBlock)
        .filter(function(block) {
          if (block.kind !== 'text') return true;
          return block.content.trim() !== '' || Boolean(block.parts && block.parts.length) || editor.children.length === 1;
        });
      var last = blocks[blocks.length - 1];
      if (!last || last.kind !== 'text' || last.content.trim() !== '' || Boolean(last.parts && last.parts.length)) {
        blocks.push({ id: uid('doc_text'), kind: 'text', content: '' });
      }
      return {
          sceneId: payload.scene.sceneId,
          sceneName: title.value || payload.scene.sceneName,
          blocks: blocks
      };
    }

    function buildSnapshot() {
      return {
        scene: buildScenePayload(),
        characters: characters
      };
    }

    function saveNow() {
      scheduleResize();
      var snapshot = buildSnapshot();
      post(Object.assign({ type: 'save' }, snapshot));
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

    function editableLineForNode(node) {
      if (!node) return null;
      if (node.nodeType === Node.TEXT_NODE && node.parentElement === editor) {
        var wrapper = document.createElement('p');
        wrapper.dataset.kind = 'text';
        editor.insertBefore(wrapper, node);
        wrapper.appendChild(node);
        return wrapper;
      }
      var element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      if (!element || !element.closest) return null;
      var block = element.closest('p, div');
      if (!block || !editor.contains(block) || block === editor) return null;
      if (block.classList && block.classList.contains('void-block')) return null;
      return block;
    }

    function nearestEditableLine() {
      var selection = window.getSelection();
      if (!selection || !selection.anchorNode) return null;
      return editableLineForNode(selection.anchorNode);
    }

    function createDialogueBlockFromCharacterName(p, speaker, text, options) {
      var ensuredCharacter = ensureCharacterWithStatus(speaker);
      var character = ensuredCharacter.character;
      var shouldOpenControls = Boolean(
        options && options.forceOpenControls
        || (!options || options.openControls !== false) && ensuredCharacter.created
      );
      p.dataset.kind = 'dialogue';
      p.dataset.speaker = character.name;
      p.dataset.characterId = character.id;
      p.dataset.spriteId = currentSpriteId(character) || '';
      p.dataset.id = p.dataset.id || uid('doc_dialogue');
      if (shouldOpenControls) {
        p.dataset.openCharacterControls = 'true';
      } else {
        delete p.dataset.openCharacterControls;
      }
      p.innerHTML = '<span class="speaker-token dialogue-badge" contenteditable="false"></span> ';
      configureSpeakerToken(p.querySelector('.speaker-token'), character, p.dataset.id);
      p.appendChild(document.createTextNode(text));
      if (!options || options.moveCaret !== false) {
        if (text && text.length) moveCaretToEnd(p);
        else moveCaretAfterSpeakerToken(p);
      }
      if (shouldOpenControls) {
        renderCharacterPopover(p.querySelector('.speaker-token'));
        if (options && options.focusName) {
          setTimeout(function() {
            var nameInput = characterPopover && characterPopover.querySelector('[data-field="character-name"]');
            if (nameInput) {
              nameInput.focus();
              nameInput.select();
            }
          }, 0);
        } else if (!options || options.keepEditorFocus !== false) {
          editor.focus();
        }
      }
    }

    function transformParagraphDialogueIfNeeded(p, options) {
      if (!p) return;
      if (p.dataset.kind === 'dialogue' && p.querySelector('.speaker-token')) return;
      var value = textOf(p);
      var match = /^([^:\\n]{1,48}):\\s*(.*)$/.exec(value);
      if (!match) return;
      var speaker = match[1].trim();
      if (!speaker || speaker[0] === '/') return;
      var text = match[2] || '';
      if (/^[a-z][a-z0-9+.-]*$/i.test(speaker) && text.trim().indexOf('//') === 0) return;
      createDialogueBlockFromCharacterName(p, speaker, text, options || { openControls: true });
    }

    function transformDialogueIfNeeded() {
      var p = nearestEditableLine();
      transformParagraphDialogueIfNeeded(p, { openControls: true });
    }

    function transformAllDialogueIfNeeded() {
      Array.prototype.slice.call(editor.childNodes).forEach(function(node) {
        if (node.nodeType === Node.TEXT_NODE && textOf(node).trim()) {
          var wrapper = document.createElement('p');
          wrapper.dataset.kind = 'text';
          editor.insertBefore(wrapper, node);
          wrapper.appendChild(node);
          node = wrapper;
        }
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
        if (node.classList && node.classList.contains('void-block')) return;
        if (node.dataset && node.dataset.kind && node.dataset.kind !== 'text' && !(node.dataset.kind === 'dialogue' && !node.querySelector('.speaker-token'))) return;
        transformParagraphDialogueIfNeeded(node, { openControls: false, moveCaret: false });
      });
    }

    function moveCaretToEnd(element) {
      var range = document.createRange();
      range.selectNodeContents(element);
      range.collapse(false);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function moveCaretAfterSpeakerToken(element) {
      var token = element && element.querySelector ? element.querySelector('.speaker-token') : null;
      if (!token) {
        moveCaretToEnd(element);
        return;
      }
      var afterToken = token.nextSibling;
      if (!afterToken || afterToken.nodeType !== Node.TEXT_NODE) {
        afterToken = document.createTextNode(' ');
        token.parentNode.insertBefore(afterToken, token.nextSibling);
      }
      if (!afterToken.textContent) afterToken.textContent = ' ';
      var range = document.createRange();
      range.setStart(afterToken, afterToken.textContent.length);
      range.collapse(true);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
    }

    function currentSlashQuery() {
      var selection = window.getSelection();
      if (!selection || !selection.rangeCount) return null;
      var range = selection.getRangeAt(0);
      var p = nearestEditableLine();
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

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function isCompactViewport() {
      return window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    }

    function positionSlashMenu(state) {
      if (!state || !menu || menu.classList.contains('hidden')) return;
      if (isCompactViewport()) {
        menu.style.left = '';
        menu.style.top = '';
        menu.style.width = '';
        menu.style.maxHeight = '';
        return;
      }

      var margin = 12;
      var gap = 8;
      var preferredWidth = 340;
      var preferredMaxHeight = 296;
      var minimumHeight = 160;
      var viewportWidth = window.innerWidth || document.documentElement.clientWidth || preferredWidth;
      var viewportHeight = window.innerHeight || document.documentElement.clientHeight || preferredMaxHeight;
      var scrollX = window.scrollX || window.pageXOffset || 0;
      var scrollY = window.scrollY || window.pageYOffset || 0;
      var width = Math.min(preferredWidth, Math.max(240, viewportWidth - margin * 2));
      var rect = state.rect || {};
      var anchorTop = typeof rect.top === 'number' ? rect.top : (typeof rect.bottom === 'number' ? rect.bottom : 120);
      var anchorBottom = typeof rect.bottom === 'number' ? rect.bottom : anchorTop;
      var below = Math.max(0, viewportHeight - anchorBottom - gap - margin);
      var above = Math.max(0, anchorTop - gap - margin);
      var openUp = below < minimumHeight && above > below;
      var available = openUp ? above : below;
      var maxHeight = Math.max(96, Math.min(preferredMaxHeight, available || preferredMaxHeight));

      menu.style.width = width + 'px';
      menu.style.maxHeight = maxHeight + 'px';

      var menuHeight = Math.min(menu.offsetHeight || maxHeight, maxHeight);
      var maxLeft = Math.max(margin, viewportWidth - width - margin);
      var left = scrollX + clamp(typeof rect.left === 'number' ? rect.left : 80, margin, maxLeft);
      var desiredTop = openUp ? anchorTop - menuHeight - gap : anchorBottom + gap;
      var maxTop = Math.max(margin, viewportHeight - menuHeight - margin);
      var top = scrollY + clamp(desiredTop, margin, maxTop);

      menu.style.left = left + 'px';
      menu.style.top = top + 'px';
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
      afterLayout(function() { positionSlashMenu(state); });
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
      scheduleResize();
    }

    function removeSlashToken(p) {
      var children = Array.prototype.slice.call(p.childNodes).reverse();
      for (var index = 0; index < children.length; index += 1) {
        var child = children[index];
        if (child.nodeType !== Node.TEXT_NODE) continue;
        var value = child.textContent || '';
        var slash = value.lastIndexOf('/');
        if (slash < 0) continue;
        child.textContent = value.slice(0, slash).trimEnd();
        return child;
      }
      var fallback = textOf(p);
      var fallbackSlash = fallback.lastIndexOf('/');
      p.textContent = fallbackSlash >= 0 ? fallback.slice(0, fallbackSlash).trimEnd() : fallback;
      return null;
    }

    function insertEffectChipInParagraph(p, anchorNode) {
      var chip = createEffectChip({
        effectType: 'rain',
        target: 'screen',
        intensity: 50,
        duration: 8,
        durationMode: 'scene',
        fadeIn: 0,
        fadeOut: 0
      });
      var spacer = document.createTextNode(' ');
      var reference = anchorNode && anchorNode.parentNode === p ? anchorNode.nextSibling : null;
      var needsLeadingSpace = anchorNode && anchorNode.textContent && !/\\s$/.test(anchorNode.textContent);
      if (needsLeadingSpace) p.insertBefore(document.createTextNode(' '), reference);
      p.insertBefore(chip, reference);
      p.insertBefore(spacer, reference);
      var range = document.createRange();
      range.setStart(spacer, spacer.textContent.length);
      range.collapse(true);
      var selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      editor.focus();
      return chip;
    }

    function selectedEffectChip() {
      if (activeEffectChip && editor.contains(activeEffectChip)) return activeEffectChip;
      var active = document.activeElement;
      if (active && active.closest) {
        var focused = active.closest('.effect-chip');
        if (focused && editor.contains(focused)) return focused;
      }
      var selection = window.getSelection();
      if (!selection || !selection.anchorNode) return null;
      var node = selection.anchorNode.nodeType === Node.ELEMENT_NODE
        ? selection.anchorNode
        : selection.anchorNode.parentNode;
      return node && node.closest ? node.closest('.effect-chip') : null;
    }

    function focusEffectChip(chip) {
      chip.focus();
      activeEffectChip = chip;
      chip.classList.add('is-selected');
      if (effectPopover) positionEffectPopover(chip);
    }

    function moveEffectChip(chip, direction) {
      if (!chip || !chip.parentNode) return false;
      var parent = chip.parentNode;
      var moved = false;
      if (direction < 0) {
        var previous = chip.previousSibling;
        if (previous && previous.nodeType === Node.TEXT_NODE && previous.textContent) {
          var value = previous.textContent;
          var movedChar = value.slice(-1);
          previous.textContent = value.slice(0, -1);
          var after = chip.nextSibling;
          if (after && after.nodeType === Node.TEXT_NODE) after.textContent = movedChar + after.textContent;
          else parent.insertBefore(document.createTextNode(movedChar), chip.nextSibling);
          if (!previous.textContent) previous.remove();
          moved = true;
        } else if (previous) {
          parent.insertBefore(chip, previous);
          moved = true;
        }
      } else {
        var next = chip.nextSibling;
        if (next && next.nodeType === Node.TEXT_NODE && next.textContent) {
          var nextValue = next.textContent;
          var firstChar = nextValue.charAt(0);
          next.textContent = nextValue.slice(1);
          var before = chip.previousSibling;
          if (before && before.nodeType === Node.TEXT_NODE) before.textContent += firstChar;
          else parent.insertBefore(document.createTextNode(firstChar), chip);
          if (!next.textContent) next.remove();
          moved = true;
        } else if (next) {
          parent.insertBefore(next, chip);
          moved = true;
        }
      }
      if (!moved) return false;
      focusEffectChip(chip);
      scheduleResize();
      saveNow();
      return true;
    }

    function caretRangeFromPoint(x, y) {
      if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
      if (document.caretPositionFromPoint) {
        var position = document.caretPositionFromPoint(x, y);
        if (!position) return null;
        var range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
        return range;
      }
      return null;
    }

    function insertDraggedEffectChip(chip, event) {
      if (!chip || !editor.contains(chip)) return false;
      var target = event.target && event.target.closest ? event.target.closest('.effect-chip') : null;
      if (target && target !== chip && editor.contains(target)) {
        var rect = target.getBoundingClientRect();
        if (event.clientX < rect.left + rect.width / 2) target.parentNode.insertBefore(chip, target);
        else target.parentNode.insertBefore(chip, target.nextSibling);
        focusEffectChip(chip);
        scheduleResize();
        saveNow();
        return true;
      }
      var range = caretRangeFromPoint(event.clientX, event.clientY);
      if (!range) return false;
      var container = range.startContainer;
      var parent = container.nodeType === Node.ELEMENT_NODE ? container : container.parentNode;
      if (!parent || !editor.contains(parent)) return false;
      if (parent.closest && parent.closest('.effect-chip')) return false;
      range.insertNode(chip);
      range.setStartAfter(chip);
      range.collapse(true);
      var selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
      focusEffectChip(chip);
      scheduleResize();
      saveNow();
      return true;
    }

    function insertCommand(commandId) {
      var p = activeSlash && activeSlash.paragraph ? activeSlash.paragraph : nearestEditableLine();
      if (!p) return;
      if (commandId === 'newScene') {
        removeSlashToken(p);
        closeSlashMenu();
        post({ type: 'createNextScene', scene: buildScenePayload(), characters: characters });
        return;
      }
      if (commandId === 'character') {
        removeSlashToken(p);
        createDialogueBlockFromCharacterName(p, 'Character', textOf(p), { forceOpenControls: true, focusName: true });
        closeSlashMenu();
        scheduleResize();
        saveNow();
        return;
      }
      if (commandId === 'effect') {
        var slashAnchor = removeSlashToken(p);
        insertEffectChipInParagraph(p, slashAnchor);
        closeSlashMenu();
        scheduleResize();
        saveNow();
        return;
      }
      removeSlashToken(p);
      var block = document.createElement('div');
      block.className = commandId === 'background' ? 'void-block background-block' : 'void-block';
      block.contentEditable = 'false';
      block.dataset.kind = 'technical';
      block.dataset.id = uid('doc_block');
      block.dataset.command = commandId;
      if (commandId === 'background') {
        applyBackgroundData(block, {
          assetId: null,
          transition: 'fade',
          duration: 500,
          delay: 0,
          fit: 'cover',
          position: 'center'
        });
      } else {
        block.innerHTML = '<div class="void-title">/' + commandId + '</div><div class="void-summary">New block</div>';
      }
      p.insertAdjacentElement('afterend', block);
      var next = document.createElement('p');
      next.dataset.kind = 'text';
      next.dataset.id = uid('doc_text');
      next.appendChild(document.createElement('br'));
      block.insertAdjacentElement('afterend', next);
      closeSlashMenu();
      moveCaretToEnd(next);
      scheduleResize();
      saveNow();
    }

    editor.addEventListener('mousedown', function(event) {
      var target = event.target;
      if (!target || !target.closest) return;
      if (target.closest('.block-button')) event.preventDefault();
    });

    editor.addEventListener('dragstart', function(event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var chip = target.closest('.effect-chip');
      if (!chip) return;
      draggedEffectChip = chip;
      chip.classList.add('is-dragging');
      closeEffectPopover();
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', chip.dataset.id || 'effect');
      }
    });

    editor.addEventListener('dragover', function(event) {
      if (!draggedEffectChip) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });

    editor.addEventListener('drop', function(event) {
      if (!draggedEffectChip) return;
      event.preventDefault();
      insertDraggedEffectChip(draggedEffectChip, event);
      draggedEffectChip.classList.remove('is-dragging');
      draggedEffectChip = null;
    });

    editor.addEventListener('dragend', function() {
      if (draggedEffectChip) draggedEffectChip.classList.remove('is-dragging');
      draggedEffectChip = null;
    });

    editor.addEventListener('click', function(event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var token = target.closest('.speaker-token');
      if (token) {
        event.preventDefault();
        renderCharacterPopover(token);
        return;
      }
      var effectChip = target.closest('.effect-chip');
      if (effectChip) {
        event.preventDefault();
        openEffectPopover(effectChip);
        return;
      }
      var button = target.closest('[data-action]');
      var block = target.closest('.background-block');
      if (!block) return;
      Array.prototype.slice.call(editor.querySelectorAll('.void-block.is-selected')).forEach(function(item) {
        if (item !== block) item.classList.remove('is-selected');
      });
      block.classList.add('is-selected');
      if (!button) return;
      var action = button.dataset.action;
      if (action === 'edit-background' || action === 'pick-background') {
        event.preventDefault();
        openBackgroundPopover(block, button);
      }
    });

    document.addEventListener('input', function(event) {
      if (effectPopover && effectPopover.contains(event.target)) {
        var rangeInput = event.target;
        if (rangeInput && rangeInput.type === 'range' && rangeInput.parentNode) {
          var valueNode = rangeInput.parentNode.querySelector('.effect-range-value');
          if (valueNode) valueNode.textContent = String(rangeInput.value);
        }
        return;
      }
      if (!backgroundPopover || !backgroundPopover.contains(event.target)) return;
      var asset = backgroundPopover.querySelector('#bgAssetInput');
      if (event.target === asset) delete backgroundPopover.dataset.selectedAssetId;
      updatePreview(backgroundPopover, asset && asset.value);
    });

    document.addEventListener('click', function(event) {
      if (effectPopover) {
        var effectTarget = event.target;
        if (effectTarget && effectTarget.closest && effectTarget.closest('.effect-popover')) {
          var effectTypeButton = effectTarget.closest('.effect-type-chip');
          if (effectTypeButton) {
            selectEffectTypeChip(effectTypeButton);
            return;
          }
          var effectActionButton = effectTarget.closest('[data-action]');
          if (!effectActionButton) return;
          var effectAction = effectActionButton.dataset.action;
          if (effectAction === 'reset-effect' && activeEffectChip) {
            applyEffectData(activeEffectChip, {
              effectType: 'rain',
              target: 'screen',
              intensity: 50,
              duration: 8,
              durationMode: 'scene',
              fadeIn: 0,
              fadeOut: 0,
              rain: {},
              snow: {},
              fog: {}
            });
            saveNow();
            closeEffectPopover();
            return;
          }
          if (effectAction === 'save-effect' && activeEffectChip) {
            applyEffectData(activeEffectChip, collectEffectForm());
            saveNow();
            closeEffectPopover();
            return;
          }
          return;
        }
        if (effectTarget && effectTarget.closest && effectTarget.closest('.effect-chip')) return;
        closeEffectPopover();
      }
      if (characterPopover) {
        var characterTarget = event.target;
        if (characterTarget && characterTarget.closest && characterTarget.closest('.character-popover')) {
          var characterActionButton = characterTarget.closest('[data-action]');
          if (!characterActionButton) return;
          var characterAction = characterActionButton.dataset.action;
          if (characterAction === 'close-character') {
            closeCharacterPopover();
            return;
          }
          if (characterAction === 'save-character') {
            collectCharacterPopover();
            closeCharacterPopover();
            return;
          }
          if (characterAction === 'upload-character-sprite') {
            var spriteInput = characterPopover.querySelector('.character-sprite-file');
            if (spriteInput) spriteInput.click();
            return;
          }
          if (characterAction === 'delete-character-sprite') {
            var deleteCharacter = activeCharacterToken && findCharacterById(activeCharacterToken.dataset.characterId);
            var selected = characterPopover.querySelector('input[name="characterSprite"]:checked');
            if (deleteCharacter && selected) {
              deleteCharacter.sprites = (deleteCharacter.sprites || []).filter(function(sprite) { return sprite.id !== selected.value; });
              if (deleteCharacter.authoring && deleteCharacter.authoring.currentSpriteId === selected.value) {
                deleteCharacter.authoring.currentSpriteId = deleteCharacter.sprites[0] && deleteCharacter.sprites[0].id || null;
              }
              renderCharacterPopover(activeCharacterToken);
              saveNow();
            }
            return;
          }
          return;
        }
        if (characterTarget && characterTarget.closest && characterTarget.closest('.speaker-token')) return;
        closeCharacterPopover();
      }
      if (!backgroundPopover) return;
      var target = event.target;
      if (target && target.closest && target.closest('.background-popover')) {
        var actionButton = target.closest('[data-action]');
        if (!actionButton) return;
        var action = actionButton.dataset.action;
        if (action === 'choose-background') {
          openAssetPicker();
          return;
        }
        if (action === 'hide-asset-picker') {
          var picker = backgroundPopover.querySelector('.asset-picker');
          if (picker) picker.classList.add('hidden');
          scheduleResize();
          return;
        }
        if (action === 'select-background-asset') {
          var selectedAsset = findBackgroundAsset(actionButton.dataset.assetId);
          setSelectedBackgroundAsset(selectedAsset);
          return;
        }
        if (action === 'upload-background') {
          var input = backgroundPopover.querySelector('.asset-file-input');
          if (input) input.click();
          return;
        }
        if (action === 'reset-background' && activeBackgroundBlock && backgroundDraft) {
          applyBackgroundData(activeBackgroundBlock, backgroundDraft);
          saveNow();
          closeBackgroundPopover();
          return;
        }
        if (action === 'save-background' && activeBackgroundBlock) {
          applyBackgroundData(activeBackgroundBlock, collectBackgroundForm());
          saveNow();
          closeBackgroundPopover();
        }
        return;
      }
      if (target && target.closest && target.closest('.background-block')) return;
      closeBackgroundPopover();
    });

    document.addEventListener('change', function(event) {
      if (effectPopover && effectPopover.contains(event.target)) {
        updateEffectSections();
        return;
      }
      if (characterPopover && characterPopover.contains(event.target)) {
        var spriteUploadInput = event.target;
        if (!spriteUploadInput || !spriteUploadInput.classList || !spriteUploadInput.classList.contains('character-sprite-file')) return;
        var spriteFile = spriteUploadInput.files && spriteUploadInput.files[0];
        if (!spriteFile || !String(spriteFile.type || '').startsWith('image/')) return;
        if (spriteFile.size > 5 * 1024 * 1024) return;
        var uploadCharacter = activeCharacterToken && findCharacterById(activeCharacterToken.dataset.characterId);
        if (!uploadCharacter) return;
        var spriteNameInput = characterPopover.querySelector('[data-field="sprite-name"]');
        var reader = new FileReader();
        reader.onload = function() {
          var dataUri = String(reader.result || '');
          if (!dataUri) return;
          var img = new Image();
          img.onload = function() {
            if (img.naturalWidth > 4096 || img.naturalHeight > 4096) return;
            var sprite = {
              id: uid('sprite'),
              name: uniqueSpriteName(uploadCharacter, spriteNameInput && spriteNameInput.value || spriteFile.name || 'Sprite'),
              uri: dataUri,
              createdAt: Date.now()
            };
            uploadCharacter.sprites = (uploadCharacter.sprites || []).concat([sprite]);
            uploadCharacter.defaultSpriteId = uploadCharacter.defaultSpriteId || sprite.id;
            uploadCharacter.authoring = Object.assign({}, uploadCharacter.authoring || {}, {
              currentSpriteId: sprite.id
            });
            var paragraph = activeCharacterToken && activeCharacterToken.closest('p');
            if (paragraph) paragraph.dataset.spriteId = sprite.id;
            renderCharacterPopover(activeCharacterToken);
            saveNow();
          };
          img.src = dataUri;
        };
        reader.readAsDataURL(spriteFile);
        return;
      }
      if (!backgroundPopover || !backgroundPopover.contains(event.target)) return;
      var input = event.target;
      if (!input || !input.classList || !input.classList.contains('asset-file-input')) return;
      var file = input.files && input.files[0];
      if (!file || !String(file.type || '').startsWith('image/')) return;
      var reader = new FileReader();
      reader.onload = function() {
        var dataUri = String(reader.result || '');
        if (!dataUri) return;
        var picker = backgroundPopover && backgroundPopover.querySelector('.asset-picker');
        if (picker) picker.classList.add('is-uploading');
        post({
          type: 'uploadBackgroundAsset',
          name: file.name || 'background.png',
          dataUri: dataUri
        });
      };
      reader.readAsDataURL(file);
    });

    document.addEventListener('keydown', function(event) {
      if (event.altKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        var chipToMove = selectedEffectChip();
        if (chipToMove && editor.contains(chipToMove)) {
          event.preventDefault();
          moveEffectChip(chipToMove, event.key === 'ArrowLeft' ? -1 : 1);
          return;
        }
      }
      if (event.key === 'Escape' && backgroundPopover) {
        event.preventDefault();
        closeBackgroundPopover();
      }
      if (event.key === 'Escape' && characterPopover) {
        event.preventDefault();
        closeCharacterPopover();
      }
      if (event.key === 'Escape' && effectPopover) {
        event.preventDefault();
        closeEffectPopover();
      }
      var target = event.target;
      if (target && target.classList && target.classList.contains('speaker-token') && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        renderCharacterPopover(target);
      }
    });

    window.addEventListener('resize', function() {
      if (activeBackgroundBlock) positionBackgroundPopover(activeBackgroundBlock);
      if (activeCharacterToken) positionCharacterPopover(activeCharacterToken);
      if (activeEffectChip) positionEffectPopover(activeEffectChip);
      if (activeSlash) positionSlashMenu(activeSlash);
      scheduleResize();
    });

    window.addEventListener('message', function(event) {
      var message = event.data;
      if (!message || message.source !== 'vn-plate-host' || message.editorId !== payload.editorId) return;
      if (message.type === 'flush' && message.requestId) {
        var snapshot = buildSnapshot();
        post(Object.assign({ type: 'flushed', requestId: message.requestId }, snapshot));
      }
      if (message.type === 'charactersUpdated' && Array.isArray(message.characters)) {
        characters = message.characters.map(migrateCharacter);
      }
      if (message.type === 'backgroundAssetsUpdated' && Array.isArray(message.assets)) {
        backgroundAssets = message.assets;
        renderAllBackgroundBlocks();
        if (backgroundPopover) {
          renderAssetPicker(backgroundPopover);
          var input = backgroundPopover.querySelector('#bgAssetInput');
          var currentAssetId = backgroundPopover.dataset.selectedAssetId || normalizeAssetName(input && input.value) || normalizeAssetName(backgroundDraft && backgroundDraft.assetId);
          updatePreview(backgroundPopover, currentAssetId);
        }
      }
      if (message.type === 'backgroundAssetUploaded' && message.asset) {
        var existing = backgroundAssets.find(function(asset) { return asset.id === message.asset.id; });
        if (!existing) backgroundAssets = backgroundAssets.concat([message.asset]);
        if (backgroundPopover) {
          var picker = backgroundPopover.querySelector('.asset-picker');
          if (picker) picker.classList.remove('is-uploading');
          setSelectedBackgroundAsset(message.asset);
          if (activeBackgroundBlock) {
            applyBackgroundData(activeBackgroundBlock, Object.assign({}, collectBackgroundForm(), {
              assetId: message.asset.id
            }));
            saveNow();
          }
        }
      }
    });

    editor.addEventListener('input', function() {
      ensureParagraph();
      transformDialogueIfNeeded();
      transformAllDialogueIfNeeded();
      var slash = currentSlashQuery();
      if (slash) renderSlashMenu(slash);
      else closeSlashMenu();
      scheduleResize();
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

    title.addEventListener('input', function() {
      scheduleResize();
      scheduleSave();
    });
    document.addEventListener('selectionchange', function() {
      if (document.activeElement !== editor) return;
      var slash = currentSlashQuery();
      if (slash) renderSlashMenu(slash);
    });

    ensureParagraph();
    transformAllDialogueIfNeeded();
    var firstOpenToken = editor.querySelector('[data-open-character-controls="true"] .speaker-token');
    if (firstOpenToken) {
      window.setTimeout(function() {
        renderCharacterPopover(firstOpenToken);
      }, 0);
    }
    if (window.ResizeObserver) {
      var resizeObserver = new ResizeObserver(scheduleResize);
      resizeObserver.observe(document.body);
      resizeObserver.observe(document.documentElement);
    }
    postResize();
    post({ type: 'ready' });
  `;
}
