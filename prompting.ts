import { Configuration, OpenAIApi } from "openai";

let openai: OpenAIApi | undefined;

const init = () => {
  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  openai = new OpenAIApi(configuration);
};

const interumPrompt = (fragments: string[]) => {
  // TODO implement
};

const finalPrompt = async (complete: string) => {
  const completion = await openai.createChatCompletion({
    model: "gpt-3.5-turbo",
    messages: [
      { role: "system", content: "You are charlie the ai assistant" },
      { role: "user", content: complete },
    ],
  });

  console.log(completion.data.choices[0].message);
  return completion.data.choices[0].message.content as string;
};

export { interumPrompt, finalPrompt, init as initPrompting };
