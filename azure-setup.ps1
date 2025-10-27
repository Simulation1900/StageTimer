# Azure Setup Script for Simulation Timer
# PowerShell version for Windows

# Configuration Variables - CUSTOMIZE THESE
$APP_NAME = "simulation-timer"
$RESOURCE_GROUP = "simulation-timer-rg"
$LOCATION = "eastus"
$RUNTIME = "NODE:18-lts"
$SKU = "B1"  # Options: F1 (Free), B1 (Basic), S1 (Standard)

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Simulation Timer - Azure Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Configuration:"
Write-Host "  App Name: $APP_NAME"
Write-Host "  Resource Group: $RESOURCE_GROUP"
Write-Host "  Location: $LOCATION"
Write-Host "  Runtime: $RUNTIME"
Write-Host "  Pricing Tier: $SKU"
Write-Host ""

$confirmation = Read-Host "Continue with this configuration? (y/n)"
if ($confirmation -ne 'y') {
    Write-Host "Setup cancelled." -ForegroundColor Yellow
    exit
}

# Step 1: Check Azure CLI
Write-Host ""
Write-Host "Step 1: Checking Azure CLI..." -ForegroundColor Green
try {
    az account show | Out-Null
    Write-Host "Already logged in to Azure." -ForegroundColor Green
} catch {
    Write-Host "Not logged in. Opening Azure login..." -ForegroundColor Yellow
    az login
}

# Step 2: Create Resource Group
Write-Host ""
Write-Host "Step 2: Creating resource group..." -ForegroundColor Green
az group create `
    --name $RESOURCE_GROUP `
    --location $LOCATION `
    --output table

# Step 3: Create App Service Plan
Write-Host ""
Write-Host "Step 3: Creating App Service Plan..." -ForegroundColor Green
az appservice plan create `
    --name "$APP_NAME-plan" `
    --resource-group $RESOURCE_GROUP `
    --location $LOCATION `
    --is-linux `
    --sku $SKU `
    --output table

# Step 4: Create Web App
Write-Host ""
Write-Host "Step 4: Creating Web App..." -ForegroundColor Green
az webapp create `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --plan "$APP_NAME-plan" `
    --runtime $RUNTIME `
    --output table

# Step 5: Configure Application Settings
Write-Host ""
Write-Host "Step 5: Configuring application settings..." -ForegroundColor Green
az webapp config appsettings set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --settings `
        CONTROLLER_PASSWORD="Belmont1900!" `
        WEBSITE_NODE_DEFAULT_VERSION="18-lts" `
        SCM_DO_BUILD_DURING_DEPLOYMENT="true" `
    --output table

# Step 6: Enable WebSockets
Write-Host ""
Write-Host "Step 6: Enabling WebSockets..." -ForegroundColor Green
az webapp config set `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --web-sockets-enabled true `
    --output table

# Step 7: Download Publish Profile
Write-Host ""
Write-Host "Step 7: Downloading publish profile..." -ForegroundColor Green
az webapp deployment list-publishing-profiles `
    --name $APP_NAME `
    --resource-group $RESOURCE_GROUP `
    --xml > publish-profile.xml

Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Your Web App URL: https://$APP_NAME.azurewebsites.net" -ForegroundColor Yellow
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Add GitHub Secrets:"
Write-Host "   - Go to: https://github.com/Simulation1900/StageTimer/settings/secrets/actions"
Write-Host "   - Add secret: AZURE_WEBAPP_NAME = $APP_NAME"
Write-Host "   - Add secret: AZURE_WEBAPP_PUBLISH_PROFILE = (contents of publish-profile.xml)"
Write-Host ""
Write-Host "2. The publish profile has been saved to: publish-profile.xml"
Write-Host "   Copy its contents for the GitHub secret."
Write-Host ""
Write-Host "3. Push to GitHub to trigger deployment:"
Write-Host "   git push origin master"
Write-Host ""
Write-Host "4. Monitor deployment:"
Write-Host "   - GitHub: https://github.com/Simulation1900/StageTimer/actions"
Write-Host "   - Azure: https://portal.azure.com"
Write-Host ""

# Open publish profile for easy copying
Write-Host "Opening publish profile in notepad..." -ForegroundColor Green
notepad publish-profile.xml
