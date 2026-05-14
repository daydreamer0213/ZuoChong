import { app } from "electron";

import { closeAllAgentPets } from "./agent-pet-controller.js";
import { destroyDefaultPet } from "./default-pet-controller.js";
import { info } from "./logger.js";
import { stopLocalIpcServer } from "./local-ipc.js";
import { focusOpenTaskWindows } from "./windows.js";

let intentionalQuit = false;

export function installAppLifecycle(): void {
  app.on("second-instance", () => {
    info("app", "second instance requested");
    console.log("Second OpenPets launch requested; keeping existing instance.");
    focusOpenTaskWindows();
  });

  app.on("window-all-closed", () => {
    if (!intentionalQuit) {
      info("app", "all task windows closed; tray app kept alive");
      console.log("All OpenPets task windows closed; keeping tray app running.");
    }
  });

  app.on("activate", () => {
    info("app", "activate event");
    console.log("OpenPets activate event received; not opening a dashboard window.");
  });

  app.on("before-quit", () => {
    intentionalQuit = true;
    info("app", "before quit cleanup begin");
    stopLocalIpcServer();
    closeAllAgentPets();
    destroyDefaultPet();
  });
}

export function quitOpenPets(): void {
  intentionalQuit = true;
  info("app", "quit requested");
  app.quit();
}
