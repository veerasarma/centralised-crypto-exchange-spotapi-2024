// import package
import redis from "redis";
import { promisify } from "util";
import config from "../config";
import { toFixed } from "../lib/roundOf";
const redisClient = redis.createClient({ url: config.REDIS_URL });
redisClient.get = promisify(redisClient.get);
redisClient.hget = promisify(redisClient.hget);
redisClient.set = promisify(redisClient.set);
redisClient.hset = promisify(redisClient.hset);
redisClient.HGETALL = promisify(redisClient.HGETALL);
redisClient.HDEL = promisify(redisClient.HDEL);
redisClient.HINCRBYFLOAT = promisify(redisClient.HINCRBYFLOAT);
redisClient.rpush = promisify(redisClient.rpush);
redisClient.lpop = promisify(redisClient.lpop);
redisClient.rpop = promisify(redisClient.rpop);
redisClient.lrange = promisify(redisClient.lrange);
redisClient.DEL = promisify(redisClient.DEL)

redisClient.on("connect", () =>
  console.log("Connected to Redis", config.REDIS_URL)
);

redisClient.on("error", function (error) {
  console.log("\x1b[31m", "Error on redis client", error);
});

export const set = async (key, value) => {
  try {
    await redisClient.set(config.REDIS_PREFIX + key, value);
    return true;
  } catch (err) {
    return false;
  }
};

export const get = async (key) => {
  try {
    return await redisClient.get(config.REDIS_PREFIX + key);
  } catch (err) {
    console.log("err---------- ", err);
    return null;
  }
};
export const del = async (key) => {
  try {
    await redisClient.del(config.REDIS_PREFIX + key);
  } catch (err) {
    return null;
  }
};
export const hset = async (key, uniqueId, data) => {
  let result = await redisClient.hset(
    config.REDIS_PREFIX + key,
    uniqueId.toString(),
    JSON.stringify(data)
  );
  // console.log("-----result", result)
};

export const hget = async (key, uniqueId) => {
  return await redisClient.hget(config.REDIS_PREFIX + key, uniqueId.toString());
};
export const hincby = async (key, uniqueId, incrementval) => {
  if (
    incrementval.toString().split(".")[1] &&
    incrementval.toString().split(".")[1].length > 7
  ) {
    incrementval = toFixed(incrementval, 7);
  }
  return await redisClient.HINCRBY(
    config.REDIS_PREFIX + key,
    uniqueId,
    incrementval,
    function (err, value) {
      if (value <= 0) {
        redisClient.HDEL(config.REDIS_PREFIX + key, uniqueId);
      }
    }
  );
};

export const hincbyfloat = async (key, uniqueId, incrementval) => {
  try {
    return await redisClient.HINCRBYFLOAT(
      config.REDIS_PREFIX + key,
      uniqueId,
      incrementval
    );
  } catch (err) {
    console.log("-----------", err);
  }
};

export const hdel = async (key, uniqueId) => {
  return await redisClient.HDEL(config.REDIS_PREFIX + key, uniqueId.toString());
};

export const hgetall = async (key) => {
  let allvalues = await redisClient.HGETALL(config.REDIS_PREFIX + key);
  return allvalues;
};

export const hdetall = async (key) => {
  await redisCtrl.del(key);
};

export const hdelAll = async (key) => {
  await redisClient.DEL(config.REDIS_PREFIX + key);
};

export const rpush = async (key, data) => {
  const result = await redisClient.rpush(key, data);
  return result;
};
export const lpop = async (listKey) => {
  let result = await redisClient.lpop(listKey);
  return result; // will return null if there is no data
};
export const rpop = async (listKey) => {
  let result = await redisClient.rpop(listKey);
  return result; // will return null if there is no data
};
export const lrange = async (listKey, start = 0, end = -1) => {
  let result = redisClient.lrange(listKey, start, end);
  return result; // will return empty if there are no results
};
