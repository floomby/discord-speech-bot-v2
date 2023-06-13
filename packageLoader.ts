import fs from "fs";

import { DynamicTool } from "langchain/tools";
import { RetrievalQAChain } from "langchain/chains";
import { OpenAIEmbeddings } from "langchain/embeddings/openai";
import { HNSWLib } from "langchain/vectorstores/hnswlib";
import { BaseLanguageModel } from "langchain/dist/base_language";

const packageDirectory = "./packages";

export type LoadedPackage = {
  boosts: string[];
  tool: DynamicTool;
  name: string;
};

const loadPackages = async (model: BaseLanguageModel) => {
  const loadedPackages: LoadedPackage[] = [];

  if (!fs.existsSync(packageDirectory)) {
    fs.mkdirSync(packageDirectory);
    return loadedPackages;
  }

  const packages = fs.readdirSync(packageDirectory);
  for (const packageFile of packages) {
    const name = packageFile.replace("_", " ");
    const boosts = fs
      .readFileSync(
        `${packageDirectory}/${packageFile}/named_entities`,
        "utf-8"
      )
      .split("\n");

    const vs = await HNSWLib.load(
      `${packageDirectory}/${packageFile}/data.hnsw`,
      new OpenAIEmbeddings()
    );
    const answerChain = RetrievalQAChain.fromLLM(model, vs.asRetriever());

    const tool = new DynamicTool({
      name: `${name} Reference`,
      description: `Use this tool to get detailed information about ${name}`,
      func: async (query: string) => {
        const result = await answerChain.call({ query });
        console.log("describe item result", result);
        return result.text;
      },
    });

    loadedPackages.push({
      boosts,
      tool,
      name,
    });
  }

  return loadedPackages;
};

export { loadPackages };
