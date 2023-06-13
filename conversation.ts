import { LoadedPackage } from "./packageLoader";
import { loadedPackages, summarizeConversation } from "./prompting";

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

  summarizeConversation(
    altPrompt?: string,
    synopsisTransform?: (synopsis: string) => string
  ) {
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

  clone() {
    const clone = new CondensedConversation();
    clone.conversation = [...this.conversation];
    clone.synopsis = this.synopsis;
    clone.lastUpdated = this.lastUpdated;
    clone.dirty = this.dirty;
    return clone;
  }
}

// FIXME: Problematic global state
const conversation: CondensedConversation = new CondensedConversation();
const latentConversation: CondensedConversation = new CondensedConversation();
let activity: LoadedPackage | null = null;

const pickActivity = () => {
  // TODO: Actually do this
  if (loadedPackages.length === 0) {
    return "No packages loaded";
  }
  activity = loadedPackages[0];
};

const init = () => {
  setInterval(() => {
    conversation.update();
    latentConversation.update(
      "You have overheard a conversation, give a short summary of the conversation paying more attention to the most recent utterances."
    );
  }, 1000 * 60 * 5);
};

export {
  conversation,
  latentConversation,
  activity,
  init as initConversationDaemon,
  pickActivity,
};
