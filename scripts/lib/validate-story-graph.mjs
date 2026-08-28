// @ts-check

/**
 * Validate scene references for both legacy Story and canonical SceneRecord
 * exports. The exporter runs in plain Node, so this stays dependency-free.
 *
 * @param {unknown} story
 * @returns {string[]}
 */
export function validateStoryGraph(story) {
  if (!story || typeof story !== 'object') return [];
  const record = /** @type {Record<string, unknown>} */ (story);
  const scenes = record.scenes;
  if (!scenes || typeof scenes !== 'object' || Array.isArray(scenes)) return [];

  const sceneMap = /** @type {Record<string, unknown>} */ (scenes);
  const sceneIds = new Set(Object.keys(sceneMap));
  const problems = [];
  if (typeof record.startSceneId === 'string' && record.startSceneId && !sceneIds.has(record.startSceneId)) {
    problems.push(`startSceneId "${record.startSceneId}" does not exist`);
  }

  /** @param {unknown} value @param {string} path */
  function visit(value, path) {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (
        (key === 'targetSceneId' || key === 'nextSceneId')
        && typeof child === 'string'
        && child
        && !sceneIds.has(child)
      ) {
        problems.push(`${childPath} references missing scene "${child}"`);
      }
      visit(child, childPath);
    }
  }

  for (const [sceneId, scene] of Object.entries(sceneMap)) {
    visit(scene, `scenes.${sceneId}`);
  }
  return [...new Set(problems)];
}
