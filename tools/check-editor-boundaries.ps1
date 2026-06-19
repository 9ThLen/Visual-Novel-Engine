$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$scanRoots = @(
  (Join-Path $repoRoot 'app'),
  (Join-Path $repoRoot 'components\editor')
)

$restrictedPathPatterns = @(
  'components/editor-legacy',
  'components\\editor-legacy',
  'stores/use-editor-store',
  'stores\\use-editor-store',
  'SceneComposer',
  'TimelinePanel',
  'BlockLibraryPanel',
  'PropertiesPanel'
)

$violations = New-Object System.Collections.Generic.List[string]

foreach ($scanRoot in $scanRoots) {
  if (-not (Test-Path $scanRoot)) {
    continue
  }

  Get-ChildItem -LiteralPath $scanRoot -Recurse -File -Include *.ts,*.tsx |
    Where-Object { $_.FullName -notmatch '\\components\\editor-legacy\\' } |
    ForEach-Object {
      $file = $_
      $lineNumber = 0
      Get-Content -LiteralPath $file.FullName | ForEach-Object {
        $lineNumber += 1
        $line = $_
        if ($line -notmatch '^\s*(import|export)\b') {
          return
        }

        foreach ($pattern in $restrictedPathPatterns) {
          if ($line -match [regex]::Escape($pattern)) {
            $relative = [System.IO.Path]::GetRelativePath($repoRoot, $file.FullName)
            $violations.Add("${relative}:${lineNumber}: ${line}") | Out-Null
          }
        }
      }
    }
}

if ($violations.Count -gt 0) {
  Write-Error ("Active editor boundary violations:`n" + ($violations -join "`n"))
}

Write-Host 'Editor boundary check passed.'
