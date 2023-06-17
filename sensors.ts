import { z } from "zod";
import { informationAgent, type Chat } from "./prompting";
import { TTSDispatcher } from "./tts";
import { LoadedPackage } from "./packageLoader";
import { CondensedConversation } from "./conversation";

export const SensorSchema = z.object({
  query: z.string(),
  which_sensor: z.enum(["activity", "channel", "past_conversation"]),
});

const useSensors = async (
  parameters: z.infer<typeof SensorSchema>,
  chat: Chat,
  activity: LoadedPackage,
  conversation: CondensedConversation,
  latentConversation: CondensedConversation
) => {
  const { query, which_sensor } = parameters;

  console.log(`Querying ${which_sensor} sensor for ${query}`);

  try {
    switch (which_sensor) {
      case "activity":
        const agentAnswer = await informationAgent.call({
          input: `Provider a description of ${activity.name}`,
        });
        chat.sendMessage(JSON.stringify({ description: agentAnswer.output }));
        break;
      case "channel":
        throw new Error("Channel sensor not implemented");
      case "past_conversation":
        throw new Error("Past conversation sensor not implemented");
    }
  } catch (e) {
    console.error("Error querying sensor:", e);
  }

  return new TTSDispatcher(conversation, activity);
};

export { useSensors };
