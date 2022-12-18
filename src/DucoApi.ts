import fetch from "node-fetch";
import AbortController from "abort-controller";

export type DucoApi = ReturnType<typeof makeDucoApi>;

export const makeDucoApi = (host: string) => {
  const request = async (url: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 1000 * 10);
    try {
      const response = await fetch(`http://${host}${url}`, {
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(
          `Receive invalid HTTP response ${response.status} when calling ${host}${url}`
        );
      }
      return response;
    } finally {
      clearTimeout(timeout);
    }
  };

  return {
    async findNodes(): Promise<{ nodes: number[] }> {
      const response = await request(`/nodelist?t=${new Date().getTime()}`);
      const json = await response.json();
      return {
        nodes: json.nodelist,
      };
    },

    async getBoardInfo(): Promise<{
      serial: string;
      uptime: number;
      softwareVersion: string;
      mac: string;
      ip: string;
    }> {
      const response = await request(`/board_info?t=${new Date().getTime()}`);

      const json = await response.json();
      return {
        serial: json.serial,
        uptime: json.uptime,
        softwareVersion: json.swversion,
        mac: json.mac,
        ip: json.ip,
      };
    },

    async updateOverrule(node: number, value: number): Promise<void> {
      const response = await request(
        `/nodesetoverrule?node=${node}&value=${value}`
      );
      const result = await response.text();
      const isSuccess = result === "SUCCESS";
      if (!isSuccess) {
        throw new Error(
          `Could not set overrule to value '${value}' on '${host}#${node}' because response was '${result}'`
        );
      }
    },

    async getNodeInfo(node: number): Promise<{
      type: "BOX" | unknown;
      overrule: number;
      serialNumber: string;
    }> {
      const response = await request(`/nodeinfoget?node=${node}`);
      const json = await response.json();

      /*
      {
        "node": 1,
        "devtype": "BOX",
        "subtype": 1,
        "netw": "VIRT",
        "addr": 1,
        "sub": 1,
        "prnt": 0,
        "asso": 0,
        "location": "",
        "state": "AUTO",
        "cntdwn": 0,
        "endtime": 0,
        "mode": "AUTO",
        "trgt": 10,
        "actl": 10,
        "ovrl": 255,
        "snsr": 0,
        "cerr": 0,
        "swversion": "16056.10.4.0",
        "serialnb": "PS2113001384",
        "temp": 0,
        "co2": 0,
        "rh": 0,
        "error": "W.00.00.00",
        "show": 0,
        "link": 0
      }
      */
      return {
        type: json.devtype,
        overrule: json.ovrl,
        serialNumber: json.serialnb,
      };
    },
  };
};
