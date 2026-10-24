# HUB-042 Admin vom Windows-Laptop aus (siehe docs/ADMIN_HANDBUCH.md)
# Wird von den .cmd-Dateien im Admin-Ordner aufgerufen, z. B. "2_OFFLINE_Killswitch.cmd".
# Server-Adresse und SSH-Schlüssel stehen in admin-config.txt im selben Ordner.
param([Parameter(Mandatory = $true)][string]$Befehl)

$ErrorActionPreference = 'Stop'
$cfgFile = Join-Path $PSScriptRoot 'admin-config.txt'
if (-not (Test-Path $cfgFile)) { Write-Host "admin-config.txt fehlt im Ordner $PSScriptRoot" -ForegroundColor Red; exit 1 }
$cfg = @{}
Get-Content $cfgFile | Where-Object { $_ -match '^\s*[A-Z_]+\s*=' } | ForEach-Object {
  $k, $v = $_ -split '=', 2; $cfg[$k.Trim()] = $v.Trim()
}
$server = "ubuntu@$($cfg['SERVER_IP'])"
$key = [Environment]::ExpandEnvironmentVariables($cfg['SSH_KEY'])
if (-not (Test-Path $key)) { Write-Host "SSH-Schlüssel nicht gefunden: $key (Pfad in admin-config.txt anpassen)" -ForegroundColor Red; exit 1 }

function Invoke-Server([string]$cmd) { ssh -t -i $key $server $cmd }

switch ($Befehl) {
  'sichern' {
    # Kopie des aktuellen Stands: Quellcode von GitHub + verschlüsseltes Datenbank-Backup
    $ziel = Join-Path $PSScriptRoot ("Staende\" + (Get-Date -Format 'yyyy-MM-dd_HHmm'))
    New-Item -ItemType Directory -Force $ziel | Out-Null
    Write-Host "1/2 Quellcode von GitHub herunterladen ..."
    Invoke-WebRequest 'https://github.com/BanioX/hub-042/archive/refs/heads/main.zip' -OutFile (Join-Path $ziel 'hub-042-code.zip')
    Write-Host "2/2 Datenbank-Backup auf dem Server erstellen (Backup-Passwort wird abgefragt) ..."
    Invoke-Server '~/hub-042/scripts/admin.sh backup'
    $neuestes = (ssh -i $key $server 'ls -1t ~/hub-042-backups/hub042_*.sql.gz.enc | head -1').Trim()
    scp -i $key "${server}:$neuestes" $ziel
    Write-Host "`n✅ Gesichert in: $ziel" -ForegroundColor Green
  }
  'ssh' { ssh -i $key $server }
  default { Invoke-Server "~/hub-042/scripts/admin.sh $Befehl" }
}
