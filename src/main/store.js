import fs from 'node:fs';
import path from 'node:path';

/** Tiny JSON file store with atomic, debounced writes. */
export class JsonStore {
  constructor(file, defaults = {}) {
    this.file = file;
    this.timer = null;
    try {
      this.data = { ...defaults, ...JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch {
      this.data = { ...defaults };
    }
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 200);
  }

  flush() {
    clearTimeout(this.timer);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}
