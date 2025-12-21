// Regular code with describe/it as function names - NOT a test framework
interface Product {
  name: string;
  describe(): string;
  it: string;
}

class Item {
  describe() {
    return 'This is an item description';
  }
}

function describe(thing: unknown): string {
  return JSON.stringify(thing);
}

const it = 'pronoun';
const before = new Date();
const after = new Date();

// Using them
const description = describe({ foo: 'bar' });
const item = new Item();
console.log(item.describe());
