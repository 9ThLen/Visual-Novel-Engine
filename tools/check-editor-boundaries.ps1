$ErrorActionPreference = 'Stop'
node (Join-Path $PSScriptRoot 'check-editor-boundaries.mjs')
exit $LASTEXITCODE
