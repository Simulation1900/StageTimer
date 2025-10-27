# GitHub Secrets Setup

## Azure Web App Created Successfully! 🎉

**Your App URL:** https://bucies-timer.azurewebsites.net
**Resource Group:** bucies-timer-rg
**Location:** Central US (Basic B1 tier ~$13/month)

## Step 1: Add GitHub Secrets

Go to: **https://github.com/Simulation1900/StageTimer/settings/secrets/actions**

### Secret 1: AZURE_WEBAPP_NAME
1. Click **"New repository secret"**
2. Name: `AZURE_WEBAPP_NAME`
3. Value: `bucies-timer`
4. Click **"Add secret"**

### Secret 2: AZURE_WEBAPP_PUBLISH_PROFILE
1. Click **"New repository secret"**
2. Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
3. Value: **Copy the ENTIRE contents from `publish-profile.xml`**
   - Open: `c:\Users\NateMcDowell\Downloads\Timer\publish-profile.xml`
   - Select all (Ctrl+A) and copy (Ctrl+C)
   - Paste into the GitHub secret value field
4. Click **"Add secret"**

## Step 2: Trigger Deployment

### Option A: Commit and Push (Recommended)
Open PowerShell or Command Prompt:
```bash
cd "c:\Users\NateMcDowell\Downloads\Timer"
git add .
git commit -m "Add Azure configuration"
git push origin master
```

### Option B: Manual Workflow Trigger
1. Go to: https://github.com/Simulation1900/StageTimer/actions
2. Click **"Deploy to Azure Web App"** workflow
3. Click **"Run workflow"**
4. Select branch: `master`
5. Click **"Run workflow"**

## Step 3: Monitor Deployment

1. Go to: https://github.com/Simulation1900/StageTimer/actions
2. Watch the deployment progress (takes 2-3 minutes)
3. Once complete, visit: **https://bucies-timer.azurewebsites.net**

## Step 4: Test Your Application

1. **Landing Page:** https://bucies-timer.azurewebsites.net
2. **Controller:** https://bucies-timer.azurewebsites.net/controller
   - Password: `Belmont1900!`
3. **Endpoint Display:** https://bucies-timer.azurewebsites.net/endpoint

## Configuration Summary

✅ Resource Group: bucies-timer-rg
✅ App Service Plan: bucies-timer-plan (Basic B1)
✅ Web App: bucies-timer
✅ Runtime: Node.js 20 LTS
✅ Location: Central US
✅ WebSockets: Enabled
✅ Password: Belmont1900!

## Useful Commands

### View live logs:
```bash
az webapp log tail --name bucies-timer --resource-group bucies-timer-rg
```

### Restart app:
```bash
az webapp restart --name bucies-timer --resource-group bucies-timer-rg
```

### Update password:
```bash
az webapp config appsettings set --name bucies-timer --resource-group bucies-timer-rg --settings CONTROLLER_PASSWORD="NewPassword"
```

### Delete app (to stop charges):
```bash
az group delete --name bucies-timer-rg --yes --no-wait
```

## Troubleshooting

### App shows error:
1. Check logs: `az webapp log tail --name bucies-timer --resource-group bucies-timer-rg`
2. Verify environment variables in Azure Portal
3. Restart the app

### Timer not syncing:
1. Ensure WebSockets are enabled (they are)
2. Test in different browsers
3. Check browser console for errors

### GitHub Actions failing:
1. Verify both secrets are added correctly
2. Make sure publish profile has no extra spaces
3. Re-download publish profile if needed

## Cost Management

**Basic B1 Tier:** ~$13/month

To avoid charges, you can:
1. Delete the resource group when not in use
2. Downgrade to Free tier (with limitations)
3. Stop the app (still charges for plan)

## Next Steps

Once deployment is successful:
1. Test all features (controller, endpoint, blackout mode)
2. Share the endpoint URL with your team
3. Consider setting up a custom domain (timer.belmont.edu)
4. Set up Application Insights for monitoring (optional)
