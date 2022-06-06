import type { Logger as HomebridgeLogger } from "homebridge";

export type Logger = ReturnType<typeof makeLogger>;

export const makeLogger = (logger: HomebridgeLogger, prefix: string) => {
  return {
    info: (...args: any[]) => logger.info(prefix, ...args),
    error: (...args: any[]) => logger.error(prefix, ...args),
  };
};
