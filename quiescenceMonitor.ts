import { conversation, latentConversation } from "./conversation";

// This is not a great name for what this is turning into
export class QuiescenceMonitor {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly timeout: number;
  callback: (text: string) => void;
  acm: string[] = [];
  hot: boolean = false;
  hotnessCheck: ((val: string) => boolean) | null = null;
  name: string = "<unknown>";

  constructor(
    timeout: number,
    callback: (text: string) => void,
    hotnessCheck: (val: string) => boolean,
    name: string,
  ) {
    this.timeout = timeout;
    this.callback = callback;
    this.hotnessCheck = hotnessCheck
    this.name = name;
  }

  public activity(val: string) {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.acm.push(val);

    if (!this.hot) {
      this.hot = this.hotnessCheck(val);
    }

    this.timer = setTimeout(() => {
      const text = this.acm.join(" ");
      if (this.hot) {
        this.callback(text);
        conversation.addUtterance({
          who: this.name,
          utterance: text,
          time: new Date(),
        });
      } else {
        latentConversation.addUtterance({
          who: this.name,
          utterance: text,
          time: new Date(),
        });
      }

      this.acm = [];
      this.hot = false;
    }, this.timeout);
  }
}
