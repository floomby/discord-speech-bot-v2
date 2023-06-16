import { describe } from "mocha";
import {
  finalPrompt,
  initPrompting,
  isQuestionStandalone,
  loadedPackages,
} from "../prompting";
import dotenv from "dotenv";
import { join } from "path";
import { assert, expect } from "chai";
import { LoadedPackage, loadPackages } from "../packageLoader";
import { CondensedConversation } from "../conversation";
import { TTSDispatcher } from "../tts";
import { bot_name, mocking } from "../config";
import { areTextsSimilar } from "../utils/similar";

describe("Testing for all prompts", () => {
  let activity: LoadedPackage | undefined;

  before(async () => {
    dotenv.config({ path: join(__dirname, "..", ".env") });
    await initPrompting();
    const rorPackage = loadedPackages.find((p) => p.name === "Risk of Rain 2");
    if (rorPackage) {
      activity = rorPackage;
    }
    mocking.tts = true;
  });

  it("Makes sure that the correct package is available and active", () => {
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

  // it("Tests if the standalone prompt is working", async () => {
  //   expect(activity).to.exist;

  //   const result0 = await isQuestionStandalone(
  //     "what does the plasma shrimp do",
  //     activity
  //   );
  //   expect(result0).to.be.true;

  //   const result1 = await isQuestionStandalone(
  //     "what is the weather like today",
  //     activity
  //   );
  //   expect(result1).to.be.false;

  //   const result2 = await isQuestionStandalone(
  //     "how should I make a pizza",
  //     activity
  //   );
  //   expect(result2).to.be.false;
  // });

  // it("Tests the whole prompting pipeline from a fresh conversation start", async () => {
  //   const utterance = `${bot_name} what does the plasma shrimp do`;
  //   const userName = "therealfloomby";

  //   const conversation = new CondensedConversation();
  //   const latentConversation = new CondensedConversation();

  //   conversation.addUtterance({
  //     who: userName,
  //     utterance,
  //     time: new Date(),
  //   });

  //   expect(activity).to.exist;

  //   const dispatcher = new TTSDispatcher(conversation, activity);

  //   await finalPrompt(
  //     utterance,
  //     dispatcher,
  //     { usersInChannel: [bot_name, userName] },
  //     userName,
  //     conversation.transformConversationOrGetCachedSynopsis(4),
  //     latentConversation,
  //     activity
  //   );

  //   expect(dispatcher.children.length).to.equal(1);

  //   const spawned = await Promise.all(dispatcher.children);

  //   expect(spawned.length).to.equal(1);
  //   expect(spawned[0].utterances[0]).to.exist;

  //   const isSimilar = await areTextsSimilar(
  //     spawned[0].utterances[0],
  //     "The Plasma Shrimp is a void item in Risk of Rain 2 that, when hitting an enemy, launches a homing missile that deals 40% (+40% per stack) total damage with a proc coefficient of 0.2. In addition, the first Plasma Shrimp the player acquires gives shield equal to 10% of their maximum health. Shields cannot be healed by conventional means, and will only replenish after avoiding damage for 7 seconds. The shield gained from the Plasma Shrimp is affected by anything that modifies the holder's maximum health, such as the Shaped Glass and Stone Flux Pauldron. The missiles fired by Plasma Shrimp act differently than every other missile in the game, rapidly homing on the target while ignoring other enemies and terrain. If the original target dies, it will not search for a new target. Any damage with a proc coefficient greater than 0.0 triggers the Plasma Shrimp, making attacks with lower coefficients very effective. The Plasma Shrimp can be especially useful on skills that can quickly fire multiple projectiles, such as Bandit's Burst and MUL-T's Auto-Nailgun."
  //   );

  //   expect(isSimilar).to.be.true;
  // });

  it("Tests channel user presence awareness", async () => {
    const utterance = `${bot_name} who is in this channel`;
    const userName = "Floomby";

    const conversation = new CondensedConversation();
    const latentConversation = new CondensedConversation();

    conversation.addUtterance({
      who: userName,
      utterance,
      time: new Date(),
    });

    expect(activity).to.exist;

    const dispatcher = new TTSDispatcher(conversation, activity);

    await finalPrompt(
      utterance,
      dispatcher,
      { usersInChannel: [bot_name, userName] },
      userName,
      conversation.transformConversationOrGetCachedSynopsis(4),
      latentConversation,
      activity
    );

    // This should not fire off a child prompt
    expect(dispatcher.children.length).to.equal(0);

    expect(/floomby/i.test(dispatcher.utterances[0])).to.be.true;
  });

  it("Tests activity awareness", async () => {
    const utterance = `${bot_name} are we playing risk of rain`;
    const userName = "therealfloomby";
    const userName2 = "aynpseudorand";

    const conversation = new CondensedConversation();
    const latentConversation = new CondensedConversation();

    conversation.addUtterance({
      who: userName,
      utterance,
      time: new Date(),
    });

    expect(activity).to.exist;

    const dispatcher = new TTSDispatcher(conversation, activity);

    await finalPrompt(
      utterance,
      dispatcher,
      { usersInChannel: [bot_name, userName, userName2] },
      userName,
      conversation.transformConversationOrGetCachedSynopsis(4),
      latentConversation,
      activity
    );

    // This should not fire off a child prompt
    expect(dispatcher.children.length).to.equal(0);

    console.log(dispatcher.utterances);

    // expect(/floomby/i.test(dispatcher.utterances[0])).to.be.true;
  });
});
