declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>;
  export default classes;
}

declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '*?url' {
  const url: string;
  export default url;
}
