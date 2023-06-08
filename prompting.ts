import { Configuration, OpenAIApi } from "openai";
import { createChat } from "./streamingChat/createChat";
import { inspect } from "util";
import { TTSDispatcher } from "./tts";
import { bot_name } from "./config";
import { Message } from "./streamingChat/createCompletions";
import { latentConversation } from "./conversation";

let openai: OpenAIApi | undefined;

const init = () => {
  // const configuration = new Configuration({
  //   apiKey: process.env.OPENAI_API_KEY,
  // });
  // openai = new OpenAIApi(configuration);
};

const interimPrompt = (fragments: string[]) => {
  // TODO implement
};

export type ConversationContext = {
  usersInChannel: string[];
};

const finalSystem = (context: ConversationContext, conversationText: string) => {
  return `You are ${bot_name} bot a helpful happy discord bot.
You live in a discord voice channel.
You don't have a brain yet, but you are excited to get one soon.
If the question seems complicated or like it might need math give your best answer and then remind the user that your are excited to get a brain soon.

The discord voice channel has the following users: ${context.usersInChannel.join(
    ", "
  )}.

The following is the conversation that has occurred so far:${
  latentConversation.synopsis ? `\n\n(Possible topic: ${latentConversation.synopsis})` : ""
}

${conversationText}

Skip two lines between every sentence in your response.

`;
};

const finalPrompt = async (
  complete: string,
  dispatcher: TTSDispatcher,
  conversationContext: ConversationContext,
  userName: string,
  conversationText: string
) => {
  const messages: Message[] = [
    { role: "system", content: finalSystem(conversationContext, conversationText) },
    {
      role: "user",
      content: "When you respond, skip two lines in between each sentence. Do not preface your response with your name.",
    },
    {
      role: "assistant",
      content:
        `I am ${bot_name} bot.\n\nI understand that I need to skip two lines in between each sentence when I respond.`,
    },
  ];

  console.log(inspect(messages, false, null, true));

  try {
    const chat = createChat({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-3.5-turbo",
      messages,
    });

    let acm = "";

    await chat.sendMessage(`${userName}: ${complete}`, (message) => {
      const choice = message.message.choices[0];
      if (!choice.finish_reason) {
        const content = (choice.delta as { content?: string }).content;
        if (content) {
          if (content.includes("\n\n")) {
            dispatcher.addSentence(acm + content);
            acm = "";
          } else {
            acm += content;
          }
        }
      } else {
        dispatcher.addSentence(acm);
        dispatcher.finalize();
      }
    });
  } catch (e) {
    console.error(e);
    dispatcher.hasErrored = true;
  }
};

const summarizeConversation = async (conversation: string, altPrompt?: string) => {
  const chat = createChat({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-3.5-turbo",
  });

  return chat.sendMessage(`${altPrompt ?? "Summarize the conversation:"}\n\n${conversation}`);
};

export { interimPrompt, finalPrompt, init as initPrompting, summarizeConversation };
