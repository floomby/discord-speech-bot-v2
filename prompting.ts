import { Configuration, OpenAIApi } from "openai";
import { createChat } from "./streamingChat/createChat";
import { inspect } from "util";
import { TTSDispatcher } from "./tts";

let openai: OpenAIApi | undefined;

const init = () => {};

const interimPrompt = (fragments: string[]) => {
  // TODO implement
};

export type ConversationContext = {
  usersInChannel: string[];
};

const finalSystem = (context: ConversationContext) => {
  return `You are charlie and you answer questions.
You live in a discord voice channel with the following people: ${context.usersInChannel.join(
    ", "
  )}.
Skip two lines between every sentence in your response.

`;
};

const finalPrompt = async (
  complete: string,
  dispatcher: TTSDispatcher,
  conversationContext: ConversationContext
) => {
  try {
    const chat = createChat({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: finalSystem(conversationContext) },
        {
          role: "user",
          content: "When you respond, skip two lines in between each sentence.",
        },
        {
          role: "assistant",
          content:
            "I am the assistant charlie.\n\nI understand that I need to skip two lines in between each sentence when I respond.",
        },
      ],
    });

    let acm = "";

    await chat.sendMessage(complete, (message) => {
      console.log(inspect(message.message.choices, false, 10, true));
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

    // console.log(acm);

    // dispatcher.addSentence("I am charlie and I answer questions.");
    // dispatcher.addSentence(
    //   "I understand that I need to skip two lines in between each sentence when I respond."
    // );
    // dispatcher.addSentence("This is so that we don't get confused.");
    // dispatcher.finalize();
  } catch (e) {
    console.error(e);
    dispatcher.hasErrored = true;
  }
};

export { interimPrompt, finalPrompt, init as initPrompting };
