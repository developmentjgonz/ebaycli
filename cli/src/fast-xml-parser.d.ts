declare module "fast-xml-parser" {
  export class XMLParser {
    public constructor(options?: Record<string, unknown>);
    public parse(xml: string): unknown;
  }

  export class XMLBuilder {
    public constructor(options?: Record<string, unknown>);
    public build(input: unknown): string;
  }
}
