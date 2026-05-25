export function isBlockComplete(blockType: string, data: any): boolean {
  switch (blockType) {
    case 'background':
      return !!data.assetId;
    case 'character':
      return !!data.characterId;
    case 'text':
      return !!(data.content && data.content.trim());
    case 'dialogue':
      return data.entries?.length > 0 && data.entries.some((e: any) => e.text?.trim());
    case 'choice':
      return data.options?.length > 0 && data.options.some((o: any) => o.text?.trim());
    case 'music':
    case 'sound':
      return data.action === 'stop' || !!data.assetId;
    case 'variable':
      return !!data.variableName;
    case 'interactive_object':
      return !!data.name;
    default:
      return true;
  }
}

export function getBlockEmptyFields(blockType: string, data: any): string[] {
  const empty: string[] = [];
  switch (blockType) {
    case 'background':
      if (!data.assetId) empty.push('Asset');
      break;
    case 'character':
      if (!data.characterId) empty.push('Character');
      break;
    case 'text':
      if (!data.content?.trim()) empty.push('Content');
      break;
    case 'dialogue':
      if (!data.entries?.length) empty.push('Speaker');
      else {
        const emptyEntries = data.entries.filter((e: any) => !e.text?.trim() && !e.characterId);
        if (emptyEntries.length > 0) empty.push(`Speaker ${data.entries.indexOf(emptyEntries[0]) + 1}`);
      }
      break;
    case 'choice':
      if (!data.options?.length) empty.push('Choices');
      else {
        const emptyOpts = data.options.filter((o: any) => !o.text?.trim());
        if (emptyOpts.length > 0) empty.push(`Choice ${data.options.indexOf(emptyOpts[0]) + 1}`);
      }
      break;
    case 'music':
    case 'sound':
      if (!data.assetId && data.action !== 'stop') empty.push('Asset');
      break;
    case 'variable':
      if (!data.variableName) empty.push('Variable Name');
      break;
    case 'interactive_object':
      if (!data.name) empty.push('Object Name');
      break;
  }
  return empty;
}
