import Bonjour from "bonjour-service";
import { DucoVentilationLevel, makeDucoApi } from "./DucoApi";

export const makeBonjour = () => {
  return {
    find(type: string, serviceName: string) {
      return new Promise<string | undefined>((resolve) => {
        const instance = new Bonjour();
        const browser = instance.find({ type }, (service) => {
          const isMatching = service.name.startsWith(serviceName);

          if (!isMatching) {
            return;
          }

          clearTimeout(timeout);
          cleanUp();
          resolve(service.host);
        });

        const cleanUp = () => {
          browser.stop();
          instance.destroy();
        };

        // TODO: this find timeout should also be set in a config somewhere
        const timeout = setTimeout(() => {
          cleanUp();

          resolve(undefined);
        }, 1000 * 10);
      });
    },
  };
};
