import { Bonjour, type Service } from "bonjour-service";

export type MdnsServiceHandle = {
  stop: () => Promise<void>;
};

type PublishMobileServiceOptions = {
  name: string;
  type: string;
  port: number;
  instanceId: string;
};

export function publishMobileService({
  name,
  type,
  port,
  instanceId,
}: PublishMobileServiceOptions): MdnsServiceHandle {
  const bonjour = new Bonjour();
  const service = bonjour.publish({
    name,
    type,
    port,
    txt: {
      instanceId,
      version: "1",
    },
  });

  return {
    stop: () =>
      new Promise<void>((resolve) => {
        const maybeService = service as Service | null;
        if (!maybeService || typeof maybeService.stop !== "function") {
          bonjour.destroy();
          resolve();
          return;
        }
        maybeService.stop(() => {
          bonjour.destroy();
          resolve();
        });
      }),
  };
}
