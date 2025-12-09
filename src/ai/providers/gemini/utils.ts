export class OrderedListBuilder {
  private count = 1;
  private list: string[] = [];

  add(text: string): void {
    this.list.push(`${this.count++}. ${text}`);
  }

  getList(): string[] {
    return this.list;
  }

  reset(): void {
    this.count = 1;
    this.list = [];
  }
}