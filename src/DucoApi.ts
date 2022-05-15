import fetch from "node-fetch";
import AbortController from "abort-controller";

export enum DucoVentilationLevel {
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  AUTO = "AUTO",
}

const ventilationLevels: { [key: string]: DucoVentilationLevel | undefined } = {
  100: DucoVentilationLevel.HIGH,
  50: DucoVentilationLevel.MEDIUM,
  0: DucoVentilationLevel.LOW,
  255: DucoVentilationLevel.AUTO,
};

export type DucoApi = ReturnType<typeof makeDucoApi>;

export const makeDucoApi = (host: string) => {
  //

  return {
    async changeVentilationLevel(level: DucoVentilationLevel) {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 1000 * 10);
      try {
        const response = await fetch(
          `http://${host}/nodesetoverrule?node=1&value=${Object.keys(
            ventilationLevels
          ).find((key) => ventilationLevels[parseInt(key, 10)] === level)}`,
          {
            signal: controller.signal,
          }
        );
        const result = await response.text();
        return result === `SUCCESS`;
      } finally {
        clearTimeout(timeout);
      }
    },

    async getVentilationLevel(): Promise<DucoVentilationLevel> {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 1000 * 10);
      try {
        const response = await fetch(`http://${host}/nodeinfoget?node=1`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(
            `Receive invalid HTTP response ${response.status} from '${host}'`
          );
        }

        const json = (await response.json()) as { ovrl: number };

        const ovrl = json && json.ovrl;
        const ventilationLevel = ventilationLevels[ovrl];

        if (ventilationLevel === undefined) {
          throw new Error(
            `Unknown ventilation value '${ovrl}' in "ovrl" response from host '${host}' when receiving ventilation level. Please report this value. Full JSON response = ${JSON.stringify(
              json
            )}`
          );
        }

        return ventilationLevel;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
};
