# Test-Notes.ps1 - Vérifier conservation des notes lors mise à jour

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host " TEST CONSERVATION NOTES - MYM EXTENSION" -ForegroundColor Cyan  
Write-Host "===============================================
" -ForegroundColor Cyan

Write-Host " INSTRUCTIONS:" -ForegroundColor Yellow
Write-Host ""
Write-Host "1. Ouvrez Chrome et allez sur creators.mym.fans" -ForegroundColor White
Write-Host "2. Créez une note sur un utilisateur (bouton )" -ForegroundColor White
Write-Host "3. Notez le contenu exact de la note" -ForegroundColor White
Write-Host "4. Ouvrez chrome://extensions/" -ForegroundColor White
Write-Host "5. Cliquez sur 'Recharger' l'extension MYM" -ForegroundColor White
Write-Host "6. Retournez sur creators.mym.fans" -ForegroundColor White
Write-Host ""
Write-Host " QUE VOYEZ-VOUS?" -ForegroundColor Magenta
Write-Host ""
Write-Host "Option A: 'Extension rechargée. Veuillez rafraîchir...'" -ForegroundColor Yellow
Write-Host "    C'est NORMAL! Les notes sont conservées." -ForegroundColor Green
Write-Host "    Rafraîchissez la page (F5)" -ForegroundColor Green
Write-Host "    Les notes réapparaissent " -ForegroundColor Green
Write-Host ""
Write-Host "Option B: Les notes ne reviennent pas après F5" -ForegroundColor Red
Write-Host "    Ouvrez debug-storage.html pour vérifier" -ForegroundColor Yellow
Write-Host "    Commande: chrome://extensions/ > Détails MYM > Inspecter debug-storage.html" -ForegroundColor Yellow
Write-Host ""
Write-Host " OUTIL DE DEBUG:" -ForegroundColor Cyan
Write-Host "   Fichier: extension/debug-storage.html" -ForegroundColor White
Write-Host "   Usage: Charge comme popup pour voir storage complet" -ForegroundColor White
Write-Host ""

# Vérifier manifest version actuelle
if (Test-Path "extension/manifest.json") {
    $manifest = Get-Content "extension/manifest.json" -Raw | ConvertFrom-Json
    Write-Host " Version actuelle: $($manifest.version)" -ForegroundColor Green
}

Write-Host ""
Write-Host "Appuyez sur une touche pour continuer..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
