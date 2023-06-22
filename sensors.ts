import { z } from "zod";
import { informationAgent, type Chat, sendChatMessage } from "./prompting";
import { TTSDispatcher } from "./tts";
import { LoadedPackage } from "./packageLoader";
import { CondensedConversation } from "./conversation";

export const SensorSchema = z.object({
  query: z.string(),
  which_sensor: z.enum(["activity", "past_conversation"]),
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

  console.log("Activity is", activity.name);

  const ret = new TTSDispatcher(conversation, activity);

  try {
    switch (which_sensor) {
      case "activity":
        const agentAnswer = await informationAgent.call({
          input: `What is ${activity.name} about?`,
        });

        console.log("Got agent answer", agentAnswer);
        await sendChatMessage(
          chat,
          JSON.stringify({ description: agentAnswer.output }),
          ret,
          activity,
          latentConversation,
          { functionName: "use_sensors" }
        );
        break;
      case "past_conversation":
        await sendChatMessage(
          chat,
          JSON.stringify(latentConversation.sense(), null, 2),
          ret,
          activity,
          latentConversation,
          { functionName: "use_sensors" }
        );
    }
  } catch (e) {
    console.error("Error querying sensor:", e);
    ret.hasErrored = true;
  }

  return ret;
};

export { useSensors };
