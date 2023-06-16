// import { Configuration, OpenAIApi } from "openai";
import { createChat, type Message } from "completions";

import { bot_name } from "./config";
import { CondensedConversation } from "./conversation";
import { CannedResponse, TTSDispatcher } from "./tts";

import { inspect } from "util";

import { OpenAI } from "langchain/llms/openai";
import { initializeAgentExecutorWithOptions } from "langchain/agents";
import { SerpAPI } from "langchain/tools";
import { Calculator } from "langchain/tools/calculator";
import { LoadedPackage, loadPackages } from "./packageLoader";
import { SensorSchema, useSensors } from "./sensors";

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
  // TODO? implement if we want to pre-run on un-finalized asr
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

You have sensors that are connected to the discord channel and the games and activities that happen here.

The current date time is ${new Date().toString()}.

The discord voice channel currently has the following users: ${context.usersInChannel.join(
    ", "
  )}

You will need to consult external resources to learn about current events.
${activity ? `\nWe are doing ${activity.name}.\n` : ""}
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
  try {
    const chat = createChat({
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-3.5-turbo-0613",
      functionCall: "auto",
      functions: [
        {
          name: "answer_difficult_question",
          description:
            "Providers answers to questions which require more context, real time data, or external resources.",
          parameters: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "The question to answer.",
              },
            },
            required: ["question"],
          },
        },
        {
          name: "use_sensors",
          description:
            "Uses sensors to provide information about the current activity, information on other channels, and past information on this channel.",
          parameters: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "What to query the sensors for.",
              },
              which_sensor: {
                type: "string",
                enum: ["activity", "channel", "past"],
                description: "Which sensor to query.",
              },
            },
            required: ["query", "which_sensor"],
          },
        },
      ],
    });

    chat.addMessage({
      role: "system",
      content: finalSystem(
        conversationContext,
        conversationText,
        latentConversation,
        activity
      ),
    });
    //     chat.addMessage({
    //       role: "user",
    //       content: `When you respond, skip two lines in between each sentence.

    // Do not say anymore than you need to when you respond.

    // `,
    //     });
    //     chat.addMessage({
    //       role: "assistant",
    //       content: `I am ${bot_name} bot.

    // I understand that I need to skip two lines in between each sentence when I respond.

    // `,
    //     });

    let acm = "";

    const response = await chat.sendMessage(
      `Respond question asked by ${userName}.

======
QUESTION: ${complete}
======

`,
      (message) => {
        const choice = message.message.choices[0];
        if (
          (choice.delta as { function_call?: { name: string } } | undefined)
            ?.function_call
        ) {
          if (!dispatcher.isFinalized()) {
            // dispatcher.addUtterance("Give me a moment to think.");
            // dispatcher.finalize();
            const name = (choice.delta as { function_call?: { name: string } }).function_call.name;

            switch (name) {
              case "answer_difficult_question":
                dispatcher.playCannedResponse(CannedResponse.Think);
                dispatcher.finalize();
                break;
              case "use_sensors":
                dispatcher.playCannedResponse(CannedResponse.Sensors);
                dispatcher.finalize();
                break;
            }
          }
        } else {
          if (dispatcher.isFinalized()) {
            // console.log("WARNING: received response after finalization.");
          } else {
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
        }
      }
    );

    if (!dispatcher.isFinalized()) {
      console.log("!!!! This is a bug. Unfinalized dispatcher after response completed.");
      dispatcher.finalize();
    }

    if (response.function_call) {
      try {
        switch (response.function_call.name) {
          case "answer_difficult_question":
            const question = JSON.parse(
              response.function_call.arguments
            ).question;
            dispatcher.addChild(answerQuestion(question, activity));
            break;
          case "use_sensors":
            const parameters = SensorSchema.parse(
              JSON.parse(response.function_call.arguments)
            );
            // dispatcher.addChild(useSensors(parameters));
            useSensors(parameters);
            break;
          default:
            throw new Error(
              `Unknown function call: ${response.function_call.name}`
            );
        }
      } catch (e) {
        console.error("Chat function call failed:", e);
      }
    }
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

const answerQuestion = async (
  question: string,
  activity: LoadedPackage | null
) => {
  let showActivityHint = false;

  if (activity) {
    showActivityHint = await isQuestionAboutActivity(question, activity);
  }

  let answer: TTSDispatcher | undefined;
  try {
    const agentAnswer = await executor.call({
      input: `${
        showActivityHint
          ? `[HINT: This question may be about ${activity.name}] `
          : ""
      }${question}`,
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

  // console.log("Is question about data> ", response.content);

  return /yes/i.test(response.content);
};

export {
  loadedPackages,
  init as initPrompting,
  interimPrompt,
  finalPrompt,
  summarizeConversation,
  isQuestionAboutActivity as isQuestionStandalone,
};
