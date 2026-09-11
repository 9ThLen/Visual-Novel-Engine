/** Windows PowerShell must discover its own modules, not inherit PowerShell 7's. */
export function powershellEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const childEnv = { ...env };
  for (const key of Object.keys(childEnv)) {
    if (key.toLowerCase() === 'psmodulepath') delete childEnv[key];
  }
  return childEnv;
}
