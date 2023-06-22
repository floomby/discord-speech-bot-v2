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
  vectorStore: HNSWLib;
};

const loadPackages = async (model: BaseLanguageModel) => {
  const loadedPackages: LoadedPackage[] = [];

  if (!fs.existsSync(packageDirectory)) {
    fs.mkdirSync(packageDirectory);
    return loadedPackages;
  }

  const packages = fs.readdirSync(packageDirectory);
  for (const packageFile of packages) {
    const name = packageFile.replace(/_/g, " ");
    const boosts = fs
      .readFileSync(
        `${packageDirectory}/${packageFile}/named_entities`,
        "utf-8"
      )
      .split("\n");

    const vectorStore = await HNSWLib.load(
      `${packageDirectory}/${packageFile}/data.hnsw`,
      new OpenAIEmbeddings()
    );
    const answerChain = RetrievalQAChain.fromLLM(model, vectorStore.asRetriever());

    const tool = new DynamicTool({
      name: `${name} Reference`,
      description: `Use this tool to get detailed information about ${name}`,
      func: async (query: string) => {
        console.log("Reference Query", query);
        const result = await answerChain.call({ query });
        console.log("Reference Result", result);
        return result.text;
      },
    });

    loadedPackages.push({
      boosts,
      tool,
      name,
      vectorStore,
    });
  }

  return loadedPackages;
};

export { loadPackages };
