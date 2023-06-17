import { z } from "zod";
import { type Chat } from "./prompting";
import { TTSDispatcher } from "./tts";
import { LoadedPackage } from "./packageLoader";
import { CondensedConversation } from "./conversation";

export const SensorSchema = z.object({
  query: z.string(),
  which_sensor: z.enum(["activity", "channel", "past"]),
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

  return new TTSDispatcher(undefined, activity);
};

export { useSensors };
