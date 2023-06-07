export class QuiescenceMonitor<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly timeout: number;
  callback: (vals: T[]) => void;
  acm: T[] = [];
  hot: boolean = false;
  hotnessCheck: ((val: T) => boolean) | null = null;

  constructor(
    timeout: number,
    callback: (vals: T[]) => void,
    hotnessCheck: (val: T) => boolean
  ) {
    this.timeout = timeout;
    this.callback = callback;
    this.hotnessCheck = hotnessCheck
  }

  public activity(val: T) {
    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.acm.push(val);

    if (!this.hot) {
      this.hot = this.hotnessCheck(val);
    }

    this.timer = setTimeout(() => {
      if (this.hot) {
        this.callback(this.acm);
      }
      this.acm = [];
      this.hot = false;
    }, this.timeout);
  }
}
