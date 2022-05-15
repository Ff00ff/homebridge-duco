import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
  Service,
  Characteristic,
} from "homebridge";
import { makeBonjour } from "./Bonjour";

import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import { startDucoAccessory } from "./startDucoAccessory";

export class DucoHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
    this.api.hap.Characteristic;

  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.log.info(`Starting DUCO plugin`);

    let cleanUp: (() => void) | undefined = undefined;

    this.api.on("didFinishLaunching", async () => {
      cleanUp = await this.discoverDevices();
    });

    this.api.on(`shutdown`, () => {
      this.log.debug(`Shutting down, calling clean up`);

      cleanUp?.();
    });
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    this.accessories.push(accessory);
  }

  private findOrCreateAccessory(ducoHost: string) {
    // TODO: it would be nice if we have another identifier instead of the host, as the host may change.
    const uuid = this.api.hap.uuid.generate(ducoHost);
    const existingAccessory = this.accessories.find(
      (accessory) => accessory.UUID === uuid
    );
    if (existingAccessory) {
      return existingAccessory;
    }
    const accessory = new this.api.platformAccessory(`DUCO`, uuid);
    this.accessories.push(accessory);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
      accessory,
    ]);
    return accessory;
  }

  async discoverDevices() {
    this.log.info(`Searching for DUCO instance`);

    const bonjour = makeBonjour();
    const ducoHost = await bonjour.find(`http`, `DUCO `);

    if (!ducoHost) {
      this.log.error("Could not find DUCO instance on local network. ");
      return;
    }

    const accessory = this.findOrCreateAccessory(ducoHost);

    return startDucoAccessory(this, accessory, ducoHost);
  }
}
