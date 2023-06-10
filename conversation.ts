import { summarizeConversation } from "./prompting";

export type ConversationElement = {
  who: string;
  utterance: string;
  time: Date;
};

export class CondensedConversation {
  synopsis: string | null = null;
  lastUpdated: Date;
  dirty: boolean = false;
  private conversation: ConversationElement[] = [];

  addUtterance(element: ConversationElement) {
    this.conversation.push(element);
    this.dirty = true;
    this.lastUpdated = new Date(0);
  }

  transformConversationOrGetCachedSynopsis(lastN = 20) {
    let acm = "";
    let filterDate = new Date(0);

    if (this.synopsis) {
      acm = "Past conversation summary: " + this.synopsis + "\n\n";
      filterDate = this.lastUpdated;
    }

    if (!this.dirty) {
      return acm;
    }

    for (
      let i = Math.max(0, this.conversation.length - lastN);
      i < this.conversation.length;
      i++
    ) {
      if (this.conversation[i].time < filterDate) {
        continue;
      }

      const element = this.conversation[i];
      acm += element.who + ": " + element.utterance + "\n\n";
    }
    return acm;
  }

  summarizeConversation(altPrompt?: string, synopsisTransform?: (synopsis: string) => string) {
    const conversation = this.transformConversationOrGetCachedSynopsis(50);

    summarizeConversation(conversation, altPrompt).then((synopsis) => {
      console.log("Got synopsis", synopsis);
      if (synopsis?.content) {
        this.synopsis = synopsis.content;
        if (synopsisTransform) {
          this.synopsis = synopsisTransform(this.synopsis);
        }
        this.lastUpdated = new Date();
      } else {
        console.error("Failed to summarize conversation");
      }
    });
  }

  update(altPrompt?: string, synopsisTransform?: (synopsis: string) => string) {
    // if we are dirty and have more than 10 unsummarized utterances, summarize
    if (!this.dirty || this.conversation.length < 10) {
      return;
    }

    let unsummarized = 0;
    for (let i = this.conversation.length - 1; i >= 0; i--) {
      if (this.conversation[i].time < this.lastUpdated) {
        break;
      }
      if (unsummarized > 10) {
        break;
      }
      unsummarized++;
    }

    if (unsummarized > 10) {
      this.summarizeConversation(altPrompt, synopsisTransform);
    }
  }
}

const conversation: CondensedConversation = new CondensedConversation();
const latentConversation: CondensedConversation = new CondensedConversation();

const init = () => {
  setInterval(() => {
    conversation.update();
    latentConversation.update(
      "Give a short summary of the conversation, it will have lots of noise from the environment. Ignore all the stray noises. If there is no conversation, just say \"No Topic\".",
      (synopsis) => {
        if (/no topic/i.test(synopsis)) {
          console.log("No latent topic, not summarizing");
          return "";
        }
        return synopsis;
      }
    );
  }, 1000 * 60 * 5);
};

export { conversation, latentConversation, init as initConversationDaemon };
