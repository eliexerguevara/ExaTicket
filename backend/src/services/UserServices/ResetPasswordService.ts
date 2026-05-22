import { Op } from "sequelize";
import User from "../../models/User";
import AppError from "../../errors/AppError";

const ResetPasswordService = async (
  token: string,
  password: string
): Promise<void> => {
  const user = await User.findOne({
    where: {
      passwordResetToken: token,
      passwordResetExpires: {
        [Op.gt]: new Date()
      }
    }
  });

  if (!user) {
    throw new AppError("ERR_RESET_TOKEN_INVALID", 400);
  }

  await user.update({
    password,
    passwordResetToken: null,
    passwordResetExpires: null
  });
};

export default ResetPasswordService;
