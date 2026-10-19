# Opens a .docx in hidden Word and saves two copies: <name>_accepted.docx (all changes
# accepted) and <name>_rejected.docx (all changes rejected). Also prints the revision and
# comment counts and their authors. Usage: powershell -File word_accept_reject.ps1 <path.docx>
param([string]$Path)
$dir = Split-Path -Parent $Path
$base = [System.IO.Path]::GetFileNameWithoutExtension($Path)
$acc = Join-Path $dir ($base + "_accepted.docx")
$rej = Join-Path $dir ($base + "_rejected.docx")
Copy-Item -LiteralPath $Path -Destination $acc -Force
Copy-Item -LiteralPath $Path -Destination $rej -Force
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
try {
  $doc = $word.Documents.Open($acc, $false, $false, $false)
  $ra = @{}; foreach ($r in $doc.Revisions) { $ra[$r.Author] = 1 }
  $ca = @{}; foreach ($c in $doc.Comments) { $ca[$c.Author] = 1 }
  "revisions=" + $doc.Revisions.Count + " authors=" + (($ra.Keys) -join ",") + " comments=" + $doc.Comments.Count + " authors=" + (($ca.Keys) -join ",")
  $doc.Revisions.AcceptAll(); $doc.Save(); $doc.Close(0)
  $doc = $word.Documents.Open($rej, $false, $false, $false)
  $doc.Revisions.RejectAll(); $doc.Save(); $doc.Close(0)
  "saved " + $acc + " and " + $rej
} finally {
  $word.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) | Out-Null
}
