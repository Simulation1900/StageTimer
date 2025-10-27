#!/bin/bash

# Azure Setup Script for Simulation Timer
# This script automates the Azure Web App creation and configuration

# Configuration Variables - CUSTOMIZE THESE
APP_NAME="simulation-timer"
RESOURCE_GROUP="simulation-timer-rg"
LOCATION="eastus"
RUNTIME="NODE:18-lts"
SKU="B1"  # Options: F1 (Free), B1 (Basic), S1 (Standard)

echo "=========================================="
echo "Simulation Timer - Azure Setup"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  App Name: $APP_NAME"
echo "  Resource Group: $RESOURCE_GROUP"
echo "  Location: $LOCATION"
echo "  Runtime: $RUNTIME"
echo "  Pricing Tier: $SKU"
echo ""
read -p "Continue with this configuration? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Setup cancelled."
    exit 1
fi

# Step 1: Login to Azure (if not already logged in)
echo ""
echo "Step 1: Checking Azure login..."
az account show > /dev/null 2>&1
if [ $? -ne 0 ]; then
    echo "Not logged in. Opening Azure login..."
    az login
else
    echo "Already logged in to Azure."
fi

# Step 2: Create Resource Group
echo ""
echo "Step 2: Creating resource group..."
az group create \
    --name $RESOURCE_GROUP \
    --location $LOCATION \
    --output table

# Step 3: Create App Service Plan
echo ""
echo "Step 3: Creating App Service Plan..."
az appservice plan create \
    --name "${APP_NAME}-plan" \
    --resource-group $RESOURCE_GROUP \
    --location $LOCATION \
    --is-linux \
    --sku $SKU \
    --output table

# Step 4: Create Web App
echo ""
echo "Step 4: Creating Web App..."
az webapp create \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --plan "${APP_NAME}-plan" \
    --runtime $RUNTIME \
    --output table

# Step 5: Configure Application Settings
echo ""
echo "Step 5: Configuring application settings..."
az webapp config appsettings set \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --settings \
        CONTROLLER_PASSWORD="Belmont1900!" \
        WEBSITE_NODE_DEFAULT_VERSION="18-lts" \
        SCM_DO_BUILD_DURING_DEPLOYMENT="true" \
    --output table

# Step 6: Enable WebSockets
echo ""
echo "Step 6: Enabling WebSockets..."
az webapp config set \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --web-sockets-enabled true \
    --output table

# Step 7: Download Publish Profile
echo ""
echo "Step 7: Downloading publish profile..."
az webapp deployment list-publishing-profiles \
    --name $APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --xml > publish-profile.xml

echo ""
echo "=========================================="
echo "Setup Complete!"
echo "=========================================="
echo ""
echo "Your Web App URL: https://${APP_NAME}.azurewebsites.net"
echo ""
echo "Next Steps:"
echo "1. Add GitHub Secrets:"
echo "   - Go to: https://github.com/Simulation1900/StageTimer/settings/secrets/actions"
echo "   - Add secret: AZURE_WEBAPP_NAME = $APP_NAME"
echo "   - Add secret: AZURE_WEBAPP_PUBLISH_PROFILE = (contents of publish-profile.xml)"
echo ""
echo "2. The publish profile has been saved to: publish-profile.xml"
echo "   Copy its contents for the GitHub secret."
echo ""
echo "3. Push to GitHub to trigger deployment:"
echo "   git push origin master"
echo ""
echo "4. Monitor deployment:"
echo "   - GitHub: https://github.com/Simulation1900/StageTimer/actions"
echo "   - Azure: https://portal.azure.com"
echo ""
