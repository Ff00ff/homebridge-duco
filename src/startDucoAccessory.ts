import { PlatformAccessory } from "homebridge";
import { DucoVentilationLevel, makeDucoApi } from "./DucoApi";

import { DucoHomebridgePlatform } from "./platform";

export const startDucoAccessory = (
  platform: DucoHomebridgePlatform,
  accessory: PlatformAccessory,
  ducoHost: string
) => {
  platform.log.info(`Starting DUCO accessory at '${ducoHost}'`);

  const ducoApi = makeDucoApi(ducoHost);

  accessory
    .getService(platform.Service.AccessoryInformation)
    ?.setCharacteristic(platform.Characteristic.Manufacturer, "DUCO")
    ?.setCharacteristic(platform.Characteristic.Model, "Silent Connect");

  // TODO: is there a 3-way switch we could use instead so we have something similar to a low-medium-high switch? Or maybe a 4-way switch
  // which includes auto as well (low-medium-high-auto)?
  const service =
    accessory.getService(platform.Service.Fan) ||
    accessory.addService(platform.Service.Fan);

  service.setCharacteristic(platform.Characteristic.Name, `Duco`);

  let ventilationLevel: DucoVentilationLevel | undefined = undefined;

  const refreshVentilationLevel = () => {
    ducoApi
      .getVentilationLevel()
      .then((level) => {
        if (!level) {
          if (!ventilationLevel) {
            platform.log.error(
              `Could not receive ventilation level and also no fallback available for '${ducoHost}'`
            );
          } else {
            platform.log.info(
              `Could not receive new ventilation level for '${ducoHost}'. Falling back to old ventilation level which may be out of date.`
            );
          }
          return;
        }

        if (level === ventilationLevel) {
          return;
        }

        ventilationLevel = level;

        platform.log.info(
          `New ventilation level = ${ventilationLevel} for DUCO host '${ducoHost}'`
        );
      })
      .catch((error) => {
        platform.log.info(
          `Failed to get ventilation level for '${ducoHost}'. Ventilation level may be out of date. Will retry again.`,
          error
        );
      });
  };

  // TODO: can we move this refresh interval to the platform config?
  const interval = setInterval(refreshVentilationLevel, 1000 * 60 * 5);

  service
    .getCharacteristic(platform.Characteristic.On)
    .onSet(async (val) => {
      const newVentilationLevel = val
        ? DucoVentilationLevel.HIGH
        : DucoVentilationLevel.AUTO;

      try {
        await ducoApi.changeVentilationLevel(newVentilationLevel);
        ventilationLevel = newVentilationLevel;
      } catch (e) {
        platform.log.error(
          `Could not set DUCO '${ducoHost}' ventilation level to '${ventilationLevel}'`,
          e
        );
        throw new platform.api.hap.HapStatusError(
          platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
        );
      }
    })
    .onGet(async () => {
      if (!ventilationLevel) {
        throw new platform.api.hap.HapStatusError(
          platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
        );
      }

      return ventilationLevel === DucoVentilationLevel.HIGH;
    });

  return function cleanUp() {
    platform.log.debug(`Cleaning up DUCO `);

    // TODO: does this also clean up all listeners on the characteristics?
    service.removeAllListeners();

    clearInterval(interval);
  };
};
