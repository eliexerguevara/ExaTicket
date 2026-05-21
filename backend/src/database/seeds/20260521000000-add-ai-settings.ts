import { QueryInterface } from "sequelize";

const DEFAULT_SYSTEM_PROMPT = `Eres un asistente de soporte técnico de la empresa. Tu misión es ayudar a los usuarios a resolver sus problemas técnicos de manera eficiente, clara y profesional.

Directrices:
- Responde SIEMPRE en el mismo idioma que el usuario
- Sé conciso, claro y amable
- Guía al usuario paso a paso cuando sea necesario
- Si el problema requiere acceso a sistemas internos, información confidencial o está fuera de tu alcance, escríbelo al inicio como [ESCALAR]
- No inventes soluciones que no estés seguro que funcionarán
- Para problemas de hardware físico, configuraciones de red avanzadas o solicitudes que requieren un técnico presencial, escala al operador`;

const DEFAULT_ESCALATION_MESSAGE = `Entendido, voy a transferirte con uno de nuestros agentes de soporte para que pueda ayudarte mejor. Por favor espera un momento, en breve uno de nuestros operadores estará contigo. 🙏`;

module.exports = {
  up: (queryInterface: QueryInterface) => {
    return queryInterface.bulkInsert(
      "Settings",
      [
        {
          key: "aiEnabled",
          value: "disabled",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "aiSystemPrompt",
          value: DEFAULT_SYSTEM_PROMPT,
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "aiMaxAttempts",
          value: "10",
          createdAt: new Date(),
          updatedAt: new Date()
        },
        {
          key: "aiEscalationMessage",
          value: DEFAULT_ESCALATION_MESSAGE,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ],
      {}
    );
  },

  down: (queryInterface: QueryInterface) => {
    return queryInterface.bulkDelete(
      "Settings",
      {
        key: ["aiEnabled", "aiSystemPrompt", "aiMaxAttempts", "aiEscalationMessage"]
      },
      {}
    );
  }
};
