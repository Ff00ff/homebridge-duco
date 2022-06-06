import Bonjour from "bonjour-service";

export interface BonjourProps {
  findTimeout?: number;
}

const DEFAULT_FIND_TIMEOUT = 1000 * 20;

export const makeBonjour = ({ findTimeout }: BonjourProps) => {
  return {
    findFirst(type: string, serviceName: string) {
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

        const timeout = setTimeout(() => {
          cleanUp();

          resolve(undefined);
        }, findTimeout || DEFAULT_FIND_TIMEOUT);
      });
    },
  };
};
