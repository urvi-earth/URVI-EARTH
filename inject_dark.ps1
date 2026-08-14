$pages = @(
  'c:\MY PROGRAMS\URVI 2\urvi-main\index.html',
  'c:\MY PROGRAMS\URVI 2\urvi-main\impact\impact.html',
  'c:\MY PROGRAMS\URVI 2\urvi-main\community\community.html',
  'c:\MY PROGRAMS\URVI 2\urvi-main\activities\activities.html',
  'c:\MY PROGRAMS\URVI 2\urvi-main\notifications\notifications.html',
  'c:\MY PROGRAMS\URVI 2\urvi-main\profile\profile.html',
  'c:\MY PROGRAMS\URVI 2\urvi-main\profile\mycertificates.html',
  'c:\MY PROGRAMS\URVI 2\urvi-main\profile\user-profile.html'
)

foreach ($page in $pages) {
  $content = Get-Content $page -Raw -Encoding UTF8

  # Determine correct relative path
  $isRoot = $page -match 'urvi-main\\index\.html$'
  $prefix = if ($isRoot) { 'components' } else { '../components' }

  # Build the new script tag
  $darkModeTag = "    <script src=`"$prefix/dark-mode.js`"></script>"

  # Remove old inline theme script (if present)
  $content = $content -replace '\s*<script>!function\(\)\{[^<]+\}[^<]*\(\);<\/script>', ''

  # Remove old theme-toggle.js module reference (will keep it but add dark-mode.js first)
  # Add dark-mode.js right after <head> opening tag if not already present
  if ($content -notmatch 'dark-mode\.js') {
    $content = $content -replace '(<head[^>]*>)', ('$1' + "`n" + $darkModeTag)
    Write-Host "Injected dark-mode.js into: $page"
  } else {
    Write-Host "Already has dark-mode.js: $page"
  }

  Set-Content $page $content -Encoding UTF8
}
Write-Host "Done!"
