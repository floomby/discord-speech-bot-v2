// import { Configuration, OpenAIApi } from "openai";
import { createChat } from "./streamingChat/createChat";
import { Message } from "./streamingChat/createCompletions";

import { bot_name } from "./config";
import { CondensedConversation } from "./conversation";
import { TTSDispatcher } from "./tts";

import { inspect } from "util";

import { OpenAI } from "langchain/llms/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { SerpAPI } from "langchain/tools";
import { Calculator } from "langchain/tools/calculator";
import { LoadedPackage, loadPackages } from "./packageLoader";

// let openai: OpenAIApi | undefined;

// FIXME: Problematic global state
const loadedPackages: LoadedPackage[] = [];

let executor:
  | Awaited<ReturnType<typeof initializeAgentExecutorWithOptions>>
  | undefined;

const init = async () => {
  // const configuration = new Configuration({
  //   apiKey: process.env.OPENAI_API_KEY,
  // });
  // openai = new OpenAIApi(configuration);

  const model = new OpenAI({ temperature: 0 });

  loadedPackages.push(...(await loadPackages(model)));

  const tools = [
    new SerpAPI(),
    new Calculator(),
    ...loadedPackages.map((p) => p.tool),
  ];

  executor = await initializeAgentExecutorWithOptions(tools, model, {
    agentType: "zero-shot-react-description",
  });
};

const interimPrompt = (fragments: string[]) => {
  // TODO implement
};

export type ConversationContext = {
  usersInChannel: string[];
};

const finalSystem = (
  context: ConversationContext,
  conversationText: string,
  latentConversation: CondensedConversation,
  activity: LoadedPackage | null
) => {
  return `You are ${bot_name} a discord bot in a voice channel know for being concise with your responses.

The current date time is ${new Date().toString()}.

You will need to consult external resources to learn about current events.
${
  activity
    ? `\n${activity.name} is going on in the background in a different channel. If the question is about this say you need to use external resources.\n`
    : ""
}
The discord voice channel has the following users: ${context.usersInChannel.join(
    ", "
  )}

The following is the conversation that has occurred so far:${
    !!latentConversation.synopsis
      ? `\n\n[Hint: ${latentConversation.synopsis}]`
      : ""
  }

${conversationText}

Skip two lines between every sentence in your response.

Be concise with your responses.

`;
};

const finalPrompt = async (
  complete: string,
  dispatcher: TTSDispatcher,
  conversationContext: ConversationContext,
  userName: string,
  conversationText: string,
  latentConversation: CondensedConversation,
  activity: LoadedPackage | null
) => {
  const messages: Message[] = [
    {
      role: "system",
      content: finalSystem(
        conversationContext,
        conversationText,
        latentConversation,
        activity
      ),
    },
    {
      role: "user",
      content: `When you respond, skip two lines in between each sentence.

If you need to look something up just say "I need to consult external resources"

Do not say anymore than you need to.

If you need to consult external only response should be "I need to consult external resources".

`,
    },
    {
      role: "assistant",
      content: `I am ${bot_name} bot.\n
I understand that I need to skip two lines in between each sentence when I respond.

I understand that if I need to look something up I should say "I need to consult external resources".

`,
    },
  ];

  // console.log(inspect(messages, false, null, true));

  try {
    const chat = createChat({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-3.5-turbo",
      messages,
    });

    let acm = "";

    await chat.sendMessage(
      `Answer the question remembering that if you need to consult external resources, you should say only "I need to consult external resources".

======
${userName}: ${complete}
======

`,
      (message) => {
        const choice = message.message.choices[0];
        if (!choice.finish_reason) {
          const content = (choice.delta as { content?: string }).content;
          if (content) {
            if (content.includes("\n\n")) {
              dispatcher.addUtterance(acm + content);
              acm = "";
            } else {
              acm += content;
            }
          }
        } else {
          dispatcher.addUtterance(acm);
          dispatcher.finalize();
        }
      }
    );
  } catch (e) {
    console.error(e);
    dispatcher.hasErrored = true;
  }
};

const summarizeConversation = async (
  conversation: string,
  altPrompt?: string
) => {
  const chat = createChat({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-3.5-turbo",
  });

  return chat.sendMessage(
    `${altPrompt ?? "Summarize the conversation:"}\n\n${conversation}`
  );
};

const extractQuestion = async (
  conversation: CondensedConversation,
  activity: LoadedPackage | null
) => {
  // console.log(
  //   "extracting question from conversation",
  //   inspect(conversation, false, null, true)
  // );

//   const synopsis = conversation.transformConversationOrGetCachedSynopsis(4);

//   const chat = createChat({
//     apiKey: process.env.OPENAI_API_KEY,
//     model: "gpt-3.5-turbo",
//     messages: [
//       {
//         role: "system",
//         content: `You are privy to a conversation between a discord bot named ${bot_name} and users in a voice channel.`,
//       },
//     ],
//   });

//   const response = await chat.sendMessage(
//     `${synopsis}

// ======
// Why does ${bot_name} bot need to consult external resources?
// ======

// `
//   );

//   const ret = response.content;

//   console.log("Intermediate question> ", ret);

//   // THIS PROMPT IS NOT WORKING WELL !!!!
//   const question = await chat.sendMessage(
//     `Rephrase what is being asked of ${bot_name} bot into a question. If it seems like there are multiple questions, choose only the last question.`
//   );

  // const finalQuestion = question.content;

  const finalQuestion = conversation.conversation[conversation.conversation.length - 1].utterance;

  if (!finalQuestion) {
    console.warn("No final question found in conversation!!!");
    return;
  }
  
  console.log("Final question> ", finalQuestion);

  let showActivityHint = false;

  if (activity) {
    showActivityHint = await isQuestionAboutActivity(
      finalQuestion,
      activity
    );
  }

  let answer: TTSDispatcher | undefined;
  try {
    const agentAnswer = await executor.call({
      input: `${
        showActivityHint
          ? `[HINT: This question may be about ${activity.name}] `
          : ""
      }${finalQuestion}`,
    });

    answer = new TTSDispatcher();

    console.log("Agent answer> ", agentAnswer);

    answer.addUtterance(agentAnswer.output);
    answer.finalize();
  } catch (e) {
    console.error(e);
    if (answer) {
      answer.hasErrored = true;
    }
  }

  return answer;
};

const isQuestionAboutActivity = async (
  question: string,
  activity: LoadedPackage
) => {
  const chat = createChat({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-3.5-turbo",
  });

  const stringified = JSON.stringify([activity.name, ...activity.boosts]);

  const response = await chat.sendMessage(
    `Data: ${stringified}\n\n======\nQUESTION: ${question}\n======\n\ndoes anything in this data pertain to this question ("Yes" or "No")?`
  );

  console.log("Is question about data> ", response.content);

  return /yes/i.test(response.content);
};

export {
  loadedPackages,
  init as initPrompting,
  interimPrompt,
  finalPrompt,
  summarizeConversation,
  extractQuestion,
  isQuestionAboutActivity as isQuestionStandalone,
};
