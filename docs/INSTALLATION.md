# Install and run Visual Novel Engine on Windows

[English](INSTALLATION.md) · [Українська](uk/INSTALLATION.md)

[Back to the project overview](../README.md) · [Create your first novel](USER_GUIDE.md) · [Settings](SETTINGS.md)

This guide takes you from a fresh Windows computer to a running editor. You do not need programming experience. Enter the commands one at a time and wait for each step to finish before continuing.

## What you will be running

You will download the project and run a local development server. The editor opens in your browser, while the server runs in a PowerShell window on your computer. This is the source-code installation path, not a Windows installer.

You need an internet connection to download the tools and dependencies. The basic local editor does not require an account, an AI key, Supabase, or a `.env` file. Android Studio and Java are not needed for this browser workflow.

## 1. Install Git and Node.js

1. Download [Git for Windows](https://git-scm.com/download/win), run its installer, and keep the default options.
2. Download a Windows installer for **Node.js 24 LTS** from [Node.js](https://nodejs.org/en/download). Install Node.js and its included npm package manager. The project's minimum Node.js version is 24.
3. Use Chrome, Edge, or Firefox to open the app.

Close any existing terminal windows after installing these tools. Open the Windows Start menu, type **PowerShell**, and launch it. A normal window is enough; the project commands do not need an administrator terminal.

Check the installation:

```powershell
git --version
node --version
npm.cmd --version
```

Each command should print a version number. The Node.js result should start with `v24` or a higher supported version. If a command is not found, restart PowerShell and try again before moving on.

## 2. Prepare pnpm

The project uses pnpm 10.23.0 to install dependencies. Install that version through npm:

```powershell
npm.cmd install --global pnpm@10.23.0
pnpm.cmd --version
```

The second command should print `10.23.0`. We use the `.cmd` commands throughout this guide so PowerShell's script execution policy does not block the package manager.

If you already use Corepack, you can use `corepack pnpm` in place of `pnpm.cmd`. You do not need to set up both methods.

## 3. Download the project

Choose a folder where you want to keep the source code. For example, this creates a Projects folder inside your Windows user folder and opens it:

```powershell
New-Item -ItemType Directory -Force -Path "$env:USERPROFILE\Projects"
Set-Location "$env:USERPROFILE\Projects"
```

Now download the repository:

```powershell
git clone https://github.com/9ThLen/Visual-Novel-Engine.git
Set-Location Visual-Novel-Engine
```

Git creates a `Visual-Novel-Engine` folder. The second command moves PowerShell into it. Keep this folder: you will return here to start or update the app.

Check that you are in the right place:

```powershell
Test-Path package.json
```

The result should be `True`. If you already downloaded the repository, open that existing folder instead of cloning it again.

## 4. Install the project's dependencies

From the project folder, run:

```powershell
pnpm.cmd install
```

The first installation can take several minutes. Leave PowerShell open while it downloads packages. Some warnings may appear; wait for the command to finish. A successful installation returns to the PowerShell prompt without a failed-installation error.

If installation fails, resolve the error before starting the app. You normally repeat this step after updating the project, not every time you open it.

## 5. Start the app

Run:

```powershell
pnpm.cmd dev:web
```

Wait for the server to start and for the initial browser build to finish. If a browser tab does not open automatically, open [http://localhost:8081](http://localhost:8081) yourself.

You should see the application's home screen. Keep PowerShell running while you work: it is serving the app to your browser. Closing that window stops the server.

Use the same browser profile and the same address each time. Browser data belongs to that profile and address; switching browsers, ports, or between `localhost` and `127.0.0.1` can make your existing work appear missing.

## 6. Check that the editor and reader work

1. Open **Studio** from the home screen.
2. Open a bundled demonstration story.
3. Choose **Play novel** and advance through a few lines.
4. Return to the story and open its editor.

If the story opens and plays, your local setup is ready. Continue with [Create your first novel](USER_GUIDE.md). Button labels depend on the selected interface language; the examples in these guides use English.

## 7. Stop and start again later

Before stopping, let any save in progress finish. In PowerShell, press **Ctrl+C**. If the terminal asks whether to terminate the batch job, confirm it.

Next time, open PowerShell and run:

```powershell
Set-Location "$env:USERPROFILE\Projects\Visual-Novel-Engine"
pnpm.cmd dev:web
```

Use your actual project path if you chose a different folder. Open [http://localhost:8081](http://localhost:8081) again. You do not need to clone or reinstall the project for an ordinary restart.

## 8. Update the app

First, create a **full backup** of important stories from their project pages. A text-only JSON export does not include images or audio. Keep the downloaded backup outside the browser's storage.

Stop the server with **Ctrl+C**, then run these commands from the project folder:

```powershell
git pull --ff-only
pnpm.cmd install
pnpm.cmd dev:web
```

Wait for each command to succeed before running the next. Reload the browser when the server is ready.

If Git reports local changes or says it cannot fast-forward, stop the update and keep the error message. Do not discard changes or reset the repository to force an update. Story data lives in browser storage, but source-code changes in your project folder also need to be preserved.

## Troubleshooting

### A command is not recognized

Close PowerShell, open it again, and repeat the version checks in step 1. If Git or Node.js is still missing, rerun its installer and make sure it is added to PATH. If only pnpm is missing, repeat step 2 and reopen PowerShell.

### PowerShell says scripts are disabled

Use `npm.cmd` and `pnpm.cmd`, exactly as shown above, rather than `npm` and `pnpm`. You do not need to change the system execution policy for these commands.

### Installation reports an unsupported Node.js version

Run `node --version`. Install Node.js 24 LTS, reopen PowerShell, check the version again, and retry `pnpm.cmd install`.

### Dependency installation fails

Check your internet connection and copy the first complete `ERR_PNPM` error. If it mentions a network connection, check your proxy or VPN settings and retry after restoring access. Do not delete your project or clear browser data as an installation fix.

### Port 8081 is already in use

Check whether another PowerShell window is already running the app. Use that instance, or stop it with **Ctrl+C** before starting again. Keep using port 8081 for your normal work so you return to the same browser storage.

### The browser cannot connect

Check that PowerShell is still running the server and has not returned an error. Open `http://localhost:8081` manually. If the server stopped, restart it from the project directory.

### The page still shows an older version

First refresh with **Ctrl+Shift+R**. If that does not help, stop the server and restart it with the build cache cleared:

```powershell
pnpm.cmd exec expo start --web --port 8081 --clear
```

This clears the development build cache. Do not clear browser site data: that can remove your stories.

### My stories are missing

Check the browser, profile, and address you used originally. Avoid private browsing for work you want to keep. If browser data has been removed, use **Import** in Studio to restore a saved backup.

### I still need help

Open an [issue](https://github.com/9ThLen/Visual-Novel-Engine/issues) with your Windows version, browser, Node.js version, the command you ran, and its first complete error. Describe what you expected and what actually happened. Remove credentials and private story content before sharing logs.
