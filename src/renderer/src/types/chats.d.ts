
declare global {
  interface Chat {
    id: string;
    title: string;
    messages: BaseMessage[];
    createdAt: number;
  }
  interface Additional_kwargs {
    provider?: Provider,
    model?: Model,
    time?: string,
    reasoning_content?: string
  }
}

export { };
