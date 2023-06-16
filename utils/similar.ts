import { createChat } from "completions";

const areTextsSimilar = async (text0: string, text1: string) => {
  const chat = createChat({
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-3.5-turbo",
  });

  const response = await chat.sendMessage(
    `Respond with only "yes" or "no". Are these texts similar?
    
=======================
TEXT A: ${text0}
=======================

=======================
TEXT B: ${text1}
=======================

Similar? `
  );

  return /yes/i.test(response.content);
};

export { areTextsSimilar };
