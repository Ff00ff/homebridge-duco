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
import { makeDucoApi } from "./DucoApi";

import { PLATFORM_NAME, PLUGIN_NAME } from "./settings";
import {
  DucoController,
  DucoVentilationLevel,
  getVentilationLevel,
  makeDucoController,
} from "./makeDucoController";
import { makeLogger } from "./Logger";

interface DucoAccessoryContext {
  host: string;
  node: number;
  isOn: boolean;
}

type DucoAccessory = PlatformAccessory<DucoAccessoryContext>;

interface AccessoryBundle {
  accessory: DucoAccessory;
  controller: DucoController;
}

export class DucoHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly bundles = new Map<string, AccessoryBundle>();
  private discoverRetryTimeout: NodeJS.Timeout | undefined = undefined;

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.log.info(`Starting DUCO plugin`);

    this.api.on("didFinishLaunching", () => {
      this.discoverDevices();
    });

    this.api.on(`shutdown`, () => {
      if (this.discoverRetryTimeout) {
        clearTimeout(this.discoverRetryTimeout);
        this.discoverRetryTimeout = undefined;
      }

      this.bundles.forEach(({ controller, accessory }) => {
        controller.cleanUp();

        accessory
          .getService(this.api.hap.Service.Fan)
          ?.getCharacteristic(this.api.hap.Characteristic.On)
          .removeOnGet()
          .removeOnSet();
      });
    });
  }

  configureAccessory(accessory: DucoAccessory) {
    // For backwards compatibility with one of the first versions, we ignore any accessories without a context (and those will be re-added
    // anyway when searching for all the nodes).
    if (
      !accessory.context ||
      !accessory.context.host ||
      !accessory.context.node
    ) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
        accessory,
      ]);

      this.log.info(
        `Unregistering accessory '${accessory.displayName}' (${accessory.UUID}) because context is invalid. It's probably from an older version. Going to re-add the same accessory once discovery is finished.`
      );
      return;
    }

    const controller = this.createController(accessory);
    this.bundles.set(accessory.UUID, {
      accessory,
      controller,
    });
  }

  private createController(accessory: DucoAccessory) {
    this.log.info(
      `Loading accessory '${accessory.displayName}' (${accessory.context.host}#${accessory.context.node} ${accessory.context.isOn}) from cache`
    );

    const api = this.api;
    const service =
      accessory.getService(this.api.hap.Service.Fan) ||
      accessory.addService(this.api.hap.Service.Fan);
    service.setCharacteristic(this.api.hap.Characteristic.Name, `Duco`);

    accessory
      .getService(this.api.hap.Service.AccessoryInformation)
      ?.setCharacteristic(this.api.hap.Characteristic.Manufacturer, "DUCO")
      ?.setCharacteristic(this.api.hap.Characteristic.Model, "Silent Connect");

    const logger = makeLogger(
      this.log,
      `[${accessory.context.host}#${accessory.context.node}]`
    );
    const ducoApi = makeDucoApi(accessory.context.host);
    const controller = makeDucoController({
      ducoApi,
      host: accessory.context.host,
      node: accessory.context.node,
      isInitiallyOn: accessory.context.isOn,
      logger,
      setOn(value) {
        service.updateCharacteristic(api.hap.Characteristic.On, value);
        accessory.context.isOn = value;
      },
      flagAsNotResponding() {
        service.updateCharacteristic(
          api.hap.Characteristic.On,
          new Error(`not responding`) as any
        );
      },
    });

    service
      .getCharacteristic(this.api.hap.Characteristic.On)
      // The Characteristic.On should have a set handler of (val: boolean) instead of (val: CharacteristicValue)
      .onSet(async (anyValue) => {
        const value = anyValue as boolean;
        await controller.onSet(value);
        accessory.context.isOn = value;
      })
      .onGet(controller.onGet);
    return controller;
  }

  createAccessoryIdentifier(serialNumber: string) {
    return this.api.hap.uuid.generate(serialNumber);
  }

  private createAccessory(
    UUID: string,
    name: string,
    ducoHost: string,
    node: number,
    isOn: boolean
  ) {
    const accessory = new this.api.platformAccessory<DucoAccessoryContext>(
      name,
      UUID
    );
    accessory.context = {
      host: ducoHost,
      node,
      isOn,
    };
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [
      accessory,
    ]);
    return accessory;
  }

  async discoverDevices() {
    // Just in case, we'll clear any pending retry timeout in case we ever call this
    // multiple times from different places.
    if (this.discoverRetryTimeout) {
      clearTimeout(this.discoverRetryTimeout);
      this.discoverRetryTimeout = undefined;
    }

    this.log.info(`Searching for DUCO instance`);

    const bonjour = makeBonjour({});

    // TODO: at some point it makes sense to first find all matching hosts, and then query
    // the board info API to check whether we found an actual DUCO instance (or someone
    // pretending to be a DUCO instance). But for now we just find the first http service
    // starting with the name DUCO.
    const ducoHost = await bonjour.findFirst(`http`, `DUCO `);

    if (!ducoHost) {
      this.log.warn(
        "Could not find any DUCO instance on your local network. Going to retry in 30 seconds."
      );

      this.discoverRetryTimeout = setTimeout(
        this.discoverDevices.bind(this),
        1000 * 30
      );
      return;
    }

    const ducoApi = makeDucoApi(ducoHost);

    // TODO: maybe there is something we can use to verify whether this is a real
    // DUCO instance or a weird http service? We still call the board info API just
    // to verify whether the host works.
    await ducoApi.getBoardInfo();

    const nodesInfo = await ducoApi.findNodes();

    for (const node of nodesInfo.nodes) {
      try {
        const nodeInfo = await ducoApi.getNodeInfo(node);

        const initialVentilationLevel = getVentilationLevel(nodeInfo.overrule);
        const isOn = initialVentilationLevel === DucoVentilationLevel.HIGH;

        const UUID = this.createAccessoryIdentifier(nodeInfo.serialNumber);
        const bundle = this.bundles.get(UUID);
        if (bundle) {
          const { controller: existingController, accessory } = bundle;
          if (
            accessory.context.host === ducoHost &&
            accessory.context.node === node
          ) {
            // The bundles was already registered and the host and node are correct, so we don't have to do anything.
            continue;
          }

          // The host or node of the accessory was changed. We set the new
          // host and node and need to remove the old controller and create
          // a new controller.
          accessory.context = {
            host: ducoHost,
            node,
            isOn,
          };

          existingController.cleanUp();

          const controller = this.createController(accessory);
          this.bundles.set(UUID, {
            accessory,
            controller,
          });
        } else {
          // Only if there are multiple nodes we add the number of the node to the name.
          const name = nodesInfo.nodes.length === 1 ? `DUCO` : `DUCO #${node}`;

          // We use the serial number as identifier data to avoid accessories changing
          // when new nodes join or the duco host changes.
          const accessory = this.createAccessory(
            UUID,
            name,
            ducoHost,
            node,
            isOn
          );

          const controller = this.createController(accessory);
          this.bundles.set(UUID, {
            controller,
            accessory,
          });
        }
      } catch (e) {
        // TODO: there is probably a plethora of nodes, such as sensors, or errors, we should ignore or recover from.

        this.log.error(
          `Not adding DUCO node #${node} because of a failure when adding. This node will be skipped even though the error may be recoverable. You must restart the plugin if you wish to retry. Please report a bug on GitHub if you encounter this error with all the node info and the error details.`,
          e
        );
      }
    }
  }
}
