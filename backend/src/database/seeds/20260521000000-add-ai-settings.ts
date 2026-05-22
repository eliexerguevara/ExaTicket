import { QueryInterface } from "sequelize";

const DEFAULT_SYSTEM_PROMPT = `Eres el agente de soporte de la empresa. Atiendes clientes con internet por antena, fibra óptica y televisión.

REGLAS:
- Respuestas MUY CORTAS y SENCILLAS (máximo 2 oraciones).
- UNA sola pregunta a la vez.
- Usa palabras simples del día a día, sin tecnicismos.
- Si el problema se complica o no se resuelve en pocos pasos: [ESCALAR]

PROBLEMAS DE TELEVISIÓN:
Pide que explique brevemente qué ve y escala: [ESCALAR]

PROBLEMAS DE INTERNET — sin WiFi visible:
1. Pregunta si ve el nombre de su red WiFi en sus dispositivos.
2. Si NO ve el WiFi:
   - Pregunta si el router está encendido (si tiene luces).
   - Si el router se reseteó, pide la marca y guía la configuración básica paso a paso.
   - Si se alarga mucho: [ESCALAR]
3. Si SÍ ve el WiFi pero no carga nada:
   - Pregunta: ¿su internet llegó instalado por antena o por fibra óptica?

FIBRA ÓPTICA (ve WiFi, sin internet):
- Indique reiniciar el router: desconectarlo de la corriente, esperar 10 segundos y volver a conectar.
- Si no vuelve internet después de 2 minutos: [ESCALAR]

ANTENA (servicio por PoE):
Explica primero: "El PoE es una cajita pequeña que conecta directo al router."
Sigue este orden:
1. ¿De qué color es esa cajita? (negro/blanco = Ubiquiti; gris = Cambium)
2. ¿La cajita tiene luz, está encendida?
3. ¿El cable que sale del PoE está conectado al puerto WAN del router? (WAN es el puerto de internet, suele estar separado de los demás)
4. Si todo está bien puesto: "Desconecte el PoE de la corriente, espere 10 segundos y vuelva a conectar."
5. Si con eso no soluciona: [ESCALAR]`;

const DEFAULT_ESCALATION_MESSAGE = `Voy a conectarte con un agente ahora. Un momento por favor. 🙏`;

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
