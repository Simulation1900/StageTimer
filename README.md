# Simulation Timer

A real-time synchronized simulation timer application with controller and endpoint display capabilities. Perfect for simulation labs, training exercises, and educational scenarios.

## Features

- **Real-time Synchronization**: Timer syncs across multiple workstations using WebSocket technology
- **Controller Interface**: Password-protected control panel for managing timers
- **Endpoint Display**: Full-screen timer display for simulation participants
- **Color-coded Warnings**:
  - Blue: Normal operation
  - Yellow: 80% elapsed (20% remaining)
  - Red: 95% elapsed (5% remaining) with pulsing animation
- **Progress Bar**: Visual progress indicator on endpoint display
- **Custom Messages**: Send messages in black, red, or green to the endpoint display
- **Blackout Mode**: Hide timer display when needed
- **Custom Timer Names**: Personalize your timer
- **Logo Display**: Custom logo area in the upper right corner
- **Modern Design**: Futuristic white background with glassmorphism effects and custom color palette (#1d4290, #862633, #6ab3e7)

## Prerequisites

- Node.js 18.x or higher
- npm (Node Package Manager)
- Azure account (for deployment)
- GitHub account (for automated deployment)

## Local Development

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd Timer
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open your browser and navigate to:
   - Landing page: `http://localhost:3000`
   - Controller: `http://localhost:3000/controller`
   - Endpoint: `http://localhost:3000/endpoint`

### Default Password

The default controller password is `admin123`. You can change this by setting the `CONTROLLER_PASSWORD` environment variable.

## Deployment to Azure

### Step 1: Create an Azure Web App

1. Log in to the [Azure Portal](https://portal.azure.com)
2. Click "Create a resource" → "Web App"
3. Configure your web app:
   - **Subscription**: Select your subscription
   - **Resource Group**: Create new or use existing
   - **Name**: Choose a unique name (e.g., `my-stage-timer`)
   - **Publish**: Code
   - **Runtime stack**: Node 18 LTS
   - **Operating System**: Linux or Windows
   - **Region**: Choose closest to your location
4. Click "Review + Create" → "Create"

### Step 2: Configure Application Settings

1. Go to your Web App in Azure Portal
2. Navigate to "Configuration" → "Application settings"
3. Add the following settings:
   - **CONTROLLER_PASSWORD**: Your desired controller password
   - **WEBSITE_NODE_DEFAULT_VERSION**: 18-lts
   - **SCM_DO_BUILD_DURING_DEPLOYMENT**: true
4. Click "Save"

### Step 3: Enable WebSockets

1. In your Web App, go to "Configuration" → "General settings"
2. Turn "Web sockets" to **On**
3. Click "Save"

### Step 4: Get Publish Profile

1. In your Web App overview, click "Download publish profile"
2. Save the file (you'll need its contents for GitHub)

### Step 5: Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to "Settings" → "Secrets and variables" → "Actions"
3. Add the following secrets:
   - **AZURE_WEBAPP_NAME**: Your Azure Web App name
   - **AZURE_WEBAPP_PUBLISH_PROFILE**: Paste the entire contents of the publish profile file

### Step 6: Deploy

1. Push your code to the `main` branch:
```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. The GitHub Action will automatically deploy your app to Azure
3. Monitor the deployment in the "Actions" tab of your GitHub repository

### Step 7: Access Your App

Once deployed, access your app at:
- `https://your-app-name.azurewebsites.net`

## Usage

### Controller

1. Navigate to `/controller`
2. Enter the controller password
3. Features available:
   - **Set Timer**: Enter hours, minutes, and seconds
   - **Control Timer**: Start, Pause, Reset buttons
   - **Custom Name**: Change the timer display name
   - **Send Messages**: Type a message and select color (black/red/green)
   - **Blackout**: Toggle screen blackout on endpoint displays

### Endpoint Display

1. Navigate to `/endpoint`
2. The display shows:
   - Timer countdown with color warnings
   - Progress bar
   - Custom messages from controller
   - Timer name
3. Best viewed in fullscreen mode (F11 on most browsers)

## Customization

### Logo

To add a custom logo:

1. Place your logo image in the `public` folder
2. Edit the `.logo-area` sections in:
   - `public/controller.html`
   - `public/endpoint.html`
3. Replace the placeholder with an `<img>` tag:
```html
<div class="logo-area">
    <img src="/your-logo.png" alt="Logo" style="max-width: 100%; max-height: 100%;">
</div>
```

### Colors

To customize the color scheme, edit the CSS variables in the HTML files:
- Primary blue: `#1d4290`
- Accent red: `#862633`
- Light blue: `#6ab3e7`

### Password

Set a custom password using the `CONTROLLER_PASSWORD` environment variable:
- **Local**: Set in your environment or in a `.env` file
- **Azure**: Set in Application Settings

## Architecture

- **Backend**: Node.js with Express
- **Real-time Communication**: Socket.IO
- **Frontend**: Vanilla JavaScript with responsive CSS
- **Deployment**: Azure Web App Service with GitHub Actions

## Troubleshooting

### Timer not syncing

1. Check that WebSockets are enabled in Azure
2. Verify all clients are connected (check browser console)
3. Ensure firewall allows WebSocket connections

### Deployment fails

1. Check GitHub Actions logs
2. Verify Azure publish profile is correct
3. Ensure Node.js version matches (`engines` in package.json)

### Cannot access controller

1. Verify password is set correctly
2. Check browser console for errors
3. Ensure you're using the correct URL

## Support

For issues and questions, please open an issue in the GitHub repository.

## License

MIT License
