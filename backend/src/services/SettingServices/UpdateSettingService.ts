import AppError from "../../errors/AppError";
import Setting from "../../models/Setting";

interface Request {
  key: string;
  value: string;
}

const UpdateSettingService = async ({
  key,
  value
}: Request): Promise<Setting | undefined> => {
  const [setting] = await Setting.findOrCreate({
    where: { key },
    defaults: { key, value }
  });

  await setting.update({ value });

  return setting;
};

export default UpdateSettingService;
