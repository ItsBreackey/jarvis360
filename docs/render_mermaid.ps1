Param(
    [string]$source = "arr_sequence.mmd",
    [string]$outdir = ".",
    [string]$formats = "svg,png"
)

Write-Output "Rendering Mermaid diagram: $source -> $outdir"

# Ensure npx and mermaid-cli are available; this script will call npx to run the mermaid cli
# Example usage (from repo root):
#   powershell -ExecutionPolicy Bypass -File docs/render_mermaid.ps1 -source docs/arr_sequence.mmd -outdir docs -formats svg,png

$formatsArray = $formats -split ','
foreach ($f in $formatsArray) {
    $ext = $f.Trim()
    $outfile = Join-Path $outdir ([IO.Path]::GetFileNameWithoutExtension($source) + "." + $ext)
    Write-Output "Generating $outfile"
    npx -y @mermaid-js/mermaid-cli -i $source -o $outfile -w 800 || Write-Output "render failed for $ext"
}

Write-Output "Done."
