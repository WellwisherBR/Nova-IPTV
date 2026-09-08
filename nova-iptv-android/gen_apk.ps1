# Nova IPTV Android - Build APK
# Execute na pasta nova-iptv-android

if (-not $env:JAVA_HOME) {
    Write-Host "ERRO: Defina JAVA_HOME para o caminho do JDK 17." -ForegroundColor Red
    Write-Host 'Exemplo: $env:JAVA_HOME = "C:\Program Files\Eclipse Adoptium\jdk-17"' -ForegroundColor Yellow
    exit 1
}

Write-Host "Sincronizando web assets..." -ForegroundColor Cyan
& "C:\Program Files\nodejs\npx.cmd" cap sync android

Write-Host "Compilando APK debug..." -ForegroundColor Cyan
Push-Location android
.\gradlew.bat assembleDebug
$exit = $LASTEXITCODE
Pop-Location

if ($exit -eq 0) {
    $apk = Join-Path $PWD "android\app\build\outputs\apk\debug\app-debug.apk"
    Write-Host "`nAPK gerado com sucesso:" -ForegroundColor Green
    Write-Host "  $apk" -ForegroundColor Green
} else {
    Write-Host "Falha na compilacao (exit code $exit)" -ForegroundColor Red
    exit $exit
}
