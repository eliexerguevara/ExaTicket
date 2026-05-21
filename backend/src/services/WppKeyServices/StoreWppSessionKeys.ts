import { BufferJSON } from "whaileys";

import WppKey from "../../models/WppKey";
import { setInRedis } from "../../libs/redisStore";
import { logger } from "../../utils/logger";

interface StoreKeyRequest {
  connectionId: number;
  deviceId: number;
  type: string;
  id: string;
  value: any;
}

const REDIS_KEY_TYPES = ["session", "sender-keys", "sender-key-memory"];

const StoreWppSessionKeys = async ({
  connectionId,
  deviceId,
  type,
  id,
  value
}: StoreKeyRequest): Promise<void> => {
  const valueJson = JSON.stringify(value, BufferJSON.replacer);

  if (REDIS_KEY_TYPES.includes(type)) {
    const redisKey = `wpp:${connectionId}:${deviceId}:${type}:${id}`;
    await setInRedis(redisKey, valueJson);

    return;
  }

  try {
    await WppKey.upsert({
      connectionId,
      type,
      keyId: id,
      value: valueJson
    });
  } catch (err) {
    logger.error({
      info: "Error storing key in database",
      connectionId,
      type,
      keyId: id,
      err
    });
  }
};

export default StoreWppSessionKeys;
