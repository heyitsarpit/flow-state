// STAND-INS for what the apps import and the repo does not install or build: React, Next, the view hooks. All any: UI files are syntax-checked only.
declare module "react" {
  export const useState: <T = any>(...args: any[]) => any;
  export const useEffect: any;
  export const Suspense: any, createElement: any;
  export type ChangeEvent<T = any> = {
    target: T & { value: any; files: FileList | null; checked: any };
  };
  export type ReactNode = any;
  const React: any;
  export default React;
}
declare module "react/jsx-runtime" {
  export const jsx: any, jsxs: any, Fragment: any;
}
declare module "react-dom/client" {
  export const hydrateRoot: any;
}
declare module "react-dom/server" {
  export const renderToString: any;
}
declare module "next/*" {
  const value: any;
  export default value;
  export const headers: any;
  export const redirect: any;
}
declare module "@testing-library/react" {
  export const act: any, render: any, screen: any;
}
declare module "@stripe/stripe-js" {
  export const loadStripe: (key: string) => Promise<any>;
}
declare module "@collab/realtime" {
  export const Realtime: any;
}
declare module "flow-state/react" {
  export const FlowProvider: any, Hydrate: any;
  export const useActorByRef: <A = any, B = any>(...args: any[]) => any;
  export const useNow: <A = any>(...args: any[]) => any;
  export const useRuntime: <A = any>(...args: any[]) => any;
  export const useView: <A = any, B = any>(...args: any[]) => any;
}
declare module "flow-state/server" {
  export const dehydrate: any;
}
declare module "flow-state/persistence" {
  export const layerIndexedDb: any;
}
declare module "flow-state/inspect" {
  export const attachInspector: any, inspect: any, render: any, trace: any;
}
declare module "flow-state/check" {
  export const check: any;
}
declare module "server-only" {}
declare namespace JSX {
  interface IntrinsicAttributes {
    key?: any;
  }
  interface IntrinsicElements {
    [name: string]: any;
  }
  interface ElementChildrenAttribute {
    children: {};
  }
  type Element = any;
}
interface ImportMeta {
  readonly glob: <T = any>(...args: any[]) => Record<string, T>;
}
