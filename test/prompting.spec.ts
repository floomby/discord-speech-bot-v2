import { describe } from "mocha";
import {
  initPrompting,
  isQuestionStandalone,
  loadedPackages,
} from "../prompting";
import dotenv from "dotenv";
import { join } from "path";
import { assert, expect } from "chai";
import { LoadedPackage, loadPackages } from "../packageLoader";

describe("Testing for all prompts", () => {
  let activity: LoadedPackage | undefined;

  before(async () => {
    dotenv.config({ path: join(__dirname, "..", ".env") });
    await initPrompting();
    const rorPackage = loadedPackages.find((p) => p.name === "Risk of Rain 2");
    if (rorPackage) {
      activity = rorPackage;
    }
  });

  it("Makes sure that the correct package was available", () => {
    expect(activity?.name).to.equal("Risk of Rain 2");
  });

  // it("Tests if the vectorstore is loaded correctly", async () => {
  //   const vectorStore = activity?.vectorStore;

  //   expect(vectorStore).to.exist;

  //   const result = await vectorStore.similaritySearch(
  //     "What does the plasma shrimp do?",
  //     1
  //   );

  //   expect(result[0]?.pageContent).to.exist;

  //   expect(result[0]?.pageContent).to.contain("Plasma Shrimp");
  // });

  it("Tests if the standalone prompt is working", async () => {
    expect(activity).to.exist;

    const result0 = await isQuestionStandalone(
      "What does the plasma shrimp do?",
      activity
    );
    expect(result0).to.be.true;

    const result1 = await isQuestionStandalone(
      "What is the weather like today?",
      activity
    );
    expect(result1).to.be.false;

    const result2 = await isQuestionStandalone(
      "How should I make a pizza?",
      activity
    );
    expect(result2).to.be.false;
  });
});
