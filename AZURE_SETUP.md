# Azure Deployment Guide for Simulation Timer

## Step 1: Create Azure Web App

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **"Create a resource"** → Search for **"Web App"**
3. Click **"Create"**

### Basic Settings:
- **Subscription**: Select your subscription
- **Resource Group**: Create new → `simulation-timer-rg`
- **Name**: `simulation-timer` (or your preferred unique name)
  - This will be your URL: `https://simulation-timer.azurewebsites.net`
- **Publish**: `Code`
- **Runtime stack**: `Node 18 LTS`
- **Operating System**: `Linux` (recommended) or `Windows`
- **Region**: Choose closest to you (e.g., `East US`)

### App Service Plan:
- **Linux Plan**: Create new or use existing
- **Pricing Plan**:
  - For testing: `Free F1` or `Basic B1`
  - For production: `Standard S1` or higher (supports always-on and better performance)

4. Click **"Review + Create"** → **"Create"**
5. Wait for deployment to complete (1-2 minutes)

## Step 2: Configure Application Settings

1. Go to your new Web App resource
2. Navigate to **"Configuration"** (under Settings in left menu)
3. Click **"Application settings"** tab
4. Click **"+ New application setting"** and add:

### Required Settings:
| Name | Value |
|------|-------|
| `CONTROLLER_PASSWORD` | `Belmont1900!` |
| `WEBSITE_NODE_DEFAULT_VERSION` | `18-lts` |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |

5. Click **"Save"** at the top
6. Click **"Continue"** when prompted

## Step 3: Enable WebSockets

1. Still in **"Configuration"**
2. Click **"General settings"** tab
3. Scroll down to **"Web sockets"**
4. Toggle to **"On"**
5. Click **"Save"** at the top

## Step 4: Get Deployment Credentials

### Option A: Download Publish Profile (Recommended)
1. Go back to your Web App **"Overview"** page
2. Click **"Get publish profile"** button at the top
3. A file will download (e.g., `simulation-timer.PublishSettings`)
4. Open this file in a text editor
5. **Copy the entire contents** of this file

### Option B: Use Deployment Center
1. Go to **"Deployment Center"** (under Deployment in left menu)
2. Click **"GitHub"** as the source
3. Click **"Authorize"** and sign in to GitHub
4. Select:
   - **Organization**: `Simulation1900`
   - **Repository**: `StageTimer`
   - **Branch**: `master`
5. Click **"Save"**

## Step 5: Configure GitHub Secrets

1. Go to your GitHub repository: https://github.com/Simulation1900/StageTimer
2. Click **"Settings"** tab
3. Click **"Secrets and variables"** → **"Actions"**
4. Click **"New repository secret"**

### Add these secrets:

**Secret 1:**
- Name: `AZURE_WEBAPP_NAME`
- Value: `simulation-timer` (or whatever you named your app)
- Click **"Add secret"**

**Secret 2:**
- Name: `AZURE_WEBAPP_PUBLISH_PROFILE`
- Value: Paste the **entire contents** of the publish profile file you downloaded
- Click **"Add secret"**

## Step 6: Trigger Deployment

### Option 1: Push a change
```bash
cd "c:\Users\NateMcDowell\Downloads\Timer"
git commit --allow-empty -m "Trigger Azure deployment"
git push origin master
```

### Option 2: Manually trigger workflow
1. Go to your GitHub repository
2. Click **"Actions"** tab
3. Click **"Deploy to Azure Web App"** workflow
4. Click **"Run workflow"** button
5. Select branch `master`
6. Click **"Run workflow"**

## Step 7: Monitor Deployment

1. In GitHub, go to **"Actions"** tab
2. Click on the running workflow
3. Watch the deployment progress
4. Should complete in 2-3 minutes

## Step 8: Test Your Application

Once deployment is complete:

1. Visit: `https://simulation-timer.azurewebsites.net` (or your app name)
2. Test the landing page
3. Go to `/controller` and login with password: `Belmont1900!`
4. Open `/endpoint` in another window
5. Test the timer synchronization

## Step 9: Custom Domain (Optional)

If you want a custom domain like `timer.belmont.edu`:

1. Go to **"Custom domains"** (under Settings)
2. Click **"Add custom domain"**
3. Follow the DNS configuration steps
4. Add SSL certificate for HTTPS

## Troubleshooting

### App doesn't start:
1. Go to **"Log stream"** (under Monitoring)
2. Watch for errors
3. Check that Node.js version is correct

### WebSocket not working:
1. Verify WebSockets are enabled in Configuration
2. Check that your pricing tier supports WebSockets (Free tier does)

### Controller password not working:
1. Go to Configuration → Application settings
2. Verify `CONTROLLER_PASSWORD` is set correctly
3. Restart the app

### GitHub Actions failing:
1. Check that publish profile is copied correctly
2. Verify no extra spaces or missing characters
3. Re-download publish profile if needed

## Useful Commands

### View logs:
```bash
az webapp log tail --name simulation-timer --resource-group simulation-timer-rg
```

### Restart app:
```bash
az webapp restart --name simulation-timer --resource-group simulation-timer-rg
```

### Update environment variable:
```bash
az webapp config appsettings set --name simulation-timer --resource-group simulation-timer-rg --settings CONTROLLER_PASSWORD="NewPassword123!"
```

## Cost Estimation

- **Free F1**: $0/month (limited, for testing only)
- **Basic B1**: ~$13/month (good for small team)
- **Standard S1**: ~$70/month (production recommended, includes auto-scaling)

## Support

For issues with the Simulation Timer app:
- GitHub Issues: https://github.com/Simulation1900/StageTimer/issues

For Azure support:
- Azure Documentation: https://docs.microsoft.com/azure/app-service/
- Azure Support Portal: https://portal.azure.com/#blade/Microsoft_Azure_Support/HelpAndSupportBlade
