import { app } from "electron";

import { initializeAppState, isOnboardingCompleted, releaseStartupInstallLock } from "./app-state.js";
import { installDefaultPetDisplayHandlers, shouldOpenDefaultPetOnLaunch, showDefaultPet } from "./default-pet-controller.js";
import { installAppLifecycle } from "./lifecycle.js";
import { error as logError, getLogFilePath, info, initializeLogger } from "./logger.js";
import { startLocalIpcServer } from "./local-ipc.js";
import { createAppTray, refreshTrayMenu } from "./tray.js";
import { checkForGitHubReleaseUpdate } from "./update-checker.js";
import { installInternalUiHandlers, installInternalUiProtocol, openTaskWindow } from "./windows.js";

// OpenPets does not store browser passwords, cookies, or encrypted app secrets.
// Keep Chromium/Electron from prompting for macOS Keychain or Linux keyring access
// during startup/profile initialization.
app.commandLine.appendSwitch("use-mock-keychain");
app.commandLine.appendSwitch("password-store", "basic");

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  installAppLifecycle();

  app.whenReady().then(async () => {
    initializeLogger();
    app.setName("OpenPets");
    info("app", "startup begin", { version: app.getVersion(), platform: process.platform, arch: process.arch, packaged: app.isPackaged, pid: process.pid });

    if (process.platform === "darwin") {
      app.dock?.hide();
    }

    initializeAppState();
    installInternalUiProtocol();
    installInternalUiHandlers();
    createAppTray();
    installDefaultPetDisplayHandlers();
    await startLocalIpcServer();
    releaseStartupInstallLock();
    if (shouldOpenDefaultPetOnLaunch()) {
      showDefaultPet();
    }
    if (!isOnboardingCompleted()) {
      try {
        openTaskWindow("onboarding");
      } catch (error) {
        console.error("Failed to open OpenPets onboarding; continuing with tray app.", error);
      }
    }
    refreshTrayMenu();
    void checkForGitHubReleaseUpdate().then(() => refreshTrayMenu());
    info("app", "startup complete", { logFile: getLogFilePath(), openDefaultPetOnLaunch: shouldOpenDefaultPetOnLaunch(), onboardingCompleted: isOnboardingCompleted() });
    console.log("OpenPets desktop shell ready.");
  }).catch((error: unknown) => {
    releaseStartupInstallLock();
    logError("app", "startup failed", error);
    console.error("Failed to start OpenPets desktop shell.", error);
    app.quit();
  });
}
