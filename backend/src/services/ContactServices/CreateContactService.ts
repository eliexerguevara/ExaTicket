import { UniqueConstraintError } from "sequelize";
import AppError from "../../errors/AppError";
import Contact from "../../models/Contact";

interface ExtraInfo {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number: string;
  email?: string;
  profilePicUrl?: string;
  extraInfo?: ExtraInfo[];
}

const CreateContactService = async ({
  name,
  number,
  email = "",
  extraInfo = []
}: Request): Promise<Contact> => {
  const numberExists = await Contact.findOne({
    where: { number }
  });

  if (numberExists) {
    throw new AppError("ERR_DUPLICATED_CONTACT");
  }

  try {
    const contact = await Contact.create(
      {
        name,
        number,
        email,
        extraInfo
      },
      {
        include: ["extraInfo"]
      }
    );

    return contact;
  } catch (err) {
    // Condicion de carrera: dos requests casi simultaneas pasaron el
    // findOne de arriba antes de que la primera terminara de insertar.
    if (err instanceof UniqueConstraintError) {
      throw new AppError("ERR_DUPLICATED_CONTACT");
    }
    throw err;
  }
};

export default CreateContactService;
