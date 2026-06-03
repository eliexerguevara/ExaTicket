const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Required environment variable "${key}" is not set`);
  return value;
};

export default {
  secret: requireEnv("JWT_SECRET"),
  expiresIn: "8h",
  refreshSecret: requireEnv("JWT_REFRESH_SECRET"),
  refreshExpiresIn: "7d"
};
